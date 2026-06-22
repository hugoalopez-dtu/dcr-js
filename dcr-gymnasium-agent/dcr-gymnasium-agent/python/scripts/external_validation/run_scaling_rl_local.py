"""
RL-side half of the scaling study, run LOCALLY (no cluster/SSH needed) since
these are cheap diagnostic budgets, not the full paper-quality sweep.

For each #events, generates a controlled chain+noise graph (same generator
and seed as run_scaling_minizinc.py, so both halves of the study look at the
identical graphs), converts it to engine XML, trains a baseline (alpha=0,
beta=0) PPO agent for a small step budget, and reports the illegal-action
ratio trend + whether any episode ever accepted. This locates where vanilla
(non-masked) PPO's action-space wall sits, as a function of #events, to
compare against where MiniZinc's wall sits (run_scaling_minizinc.py).

Does NOT use run_experiments.py's run_experiment() because that hardcodes
`source ~/.nvm/nvm.sh && nvm use 20` to start the node adapter, which is a
cluster-only assumption -- this machine has no nvm, plain `node` is on PATH
and new enough (v25).

Usage:
    cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
    python3 scripts/run_scaling_rl_local.py 20 40 60 80 100 --steps 20000
"""
import os
import sys
import json
import time
import argparse
import subprocess
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parent.parent
TENSORBOARD_DIR = ROOT / "dcr_tensorboard_scaling"
MODELS_DIR = PYTHON_PROJECT_DIR / "models_scaling"
LOGS_DIR = PYTHON_PROJECT_DIR / "scripts" / "logs"
GRAPHS_DIR = Path("/tmp/scaling_graphs")

DCRGRAPH_SOURCE = ROOT / "dcr-gymnasium-agent" / "dcr-gymnasium-agent" / "python" / "dcrGraph" / "source"
sys.path.insert(0, str(DCRGRAPH_SOURCE))
from random_dcr_generator import generate_chain_graph  # noqa: E402
from tobias_converter import build_engine_xml  # noqa: E402


def wait_for_adapter(url, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.post(f"{url}/reset", timeout=2)
            if r.ok:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def free_port(port):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    for pid_str in result.stdout.split():
        try:
            os.kill(int(pid_str), 9)
        except Exception:
            pass


def run_one(num_events, steps, seed, noise_density, port):
    GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
    parsed = generate_chain_graph(num_events, seed=seed, noise_density=noise_density)
    xml = build_engine_xml(parsed, title=f"scaling_{num_events}", seed=seed)
    xml_path = GRAPHS_DIR / f"scaling_{num_events}.xml"
    xml_path.write_text(xml)

    exp_id = f"Scaling{num_events}"
    free_port(port)

    env = os.environ.copy()
    env["DCR_XML"] = str(xml_path)
    env["PORT"] = str(port)
    env["GOAL_LABEL"] = ""
    env["TB_LOG_DIR"] = str(TENSORBOARD_DIR)
    env["RESET_NOVELTY_ON_RESET"] = "0"
    env["STRICT_GOAL_TERMINATION"] = "0"
    env["MAX_EPISODE_STEPS"] = "300"
    env["COST_WEIGHT"] = "0"
    env["DURATION_WEIGHT"] = "0"
    env["EXPERT_BUDGET_K"] = "none"
    env["STEP_PENALTY"] = "-1.5"

    node_proc = subprocess.Popen(
        ["node", "dist/server.mjs"], cwd=str(NODE_ADAPTER_DIR), env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    row = {"num_events": num_events, "num_relations": parsed["num_relations"]}
    try:
        node_url = f"http://localhost:{port}"
        if not wait_for_adapter(node_url):
            row["status"] = "adapter_failed"
            return row

        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        train_cmd = [
            sys.executable, "src/agents/train_agent.py",
            "--exp-id", exp_id, "--steps", str(steps),
            "--node-url", node_url, "--out-dir", str(MODELS_DIR),
            "--tb-log-dir", str(TENSORBOARD_DIR), "--ent-coef", "0.2",
            "--seed", str(seed),
        ]
        t0 = time.time()
        before = set(LOGS_DIR.glob(f"train_trace_exp_{exp_id}_*.csv"))
        ret = subprocess.run(train_cmd, cwd=str(PYTHON_PROJECT_DIR), env=env,
                              capture_output=True, text=True)
        row["train_wall_s"] = round(time.time() - t0, 1)
        if ret.returncode != 0:
            row["status"] = "train_failed"
            row["error"] = (ret.stderr or ret.stdout)[-1500:]
            return row

        after = set(LOGS_DIR.glob(f"train_trace_exp_{exp_id}_*.csv"))
        new_csvs = after - before
        if not new_csvs:
            row["status"] = "no_csv"
            return row
        csv_path = sorted(new_csvs)[-1]
        row["csv"] = str(csv_path)
        row["status"] = "ok"
        return row
    finally:
        node_proc.terminate()
        try:
            node_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            node_proc.kill()
            node_proc.wait()


def summarize_csv(csv_path):
    import pandas as pd
    df = pd.read_csv(csv_path)
    eps = df[df["done"] == True].copy()
    eps["accepting"] = eps["accepting"].astype(str).str.lower().isin(["true", "1"])
    n = len(eps)
    if n == 0:
        return {"episodes": 0}
    last20 = eps.tail(max(1, n // 5))
    return {
        "episodes": n,
        "overall_accept_rate": round(float(eps["accepting"].mean()), 4),
        "last20_accept_rate": round(float(last20["accepting"].mean()), 4),
        "last20_illegal_ratio_mean": round(float(last20["illegal_traces_ratio"].mean()), 1),
        "last20_episode_steps_mean": round(float(last20["episode_steps"].mean()), 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_counts", type=int, nargs="+")
    ap.add_argument("--steps", type=int, default=20000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--noise-density", type=float, default=2.0)
    ap.add_argument("--base-port", type=int, default=5200)
    args = ap.parse_args()

    results = []
    for i, n in enumerate(args.event_counts):
        port = args.base_port + i
        print(f"=== N={n} (steps={args.steps}, port={port}) ===", flush=True)
        row = run_one(n, args.steps, args.seed, args.noise_density, port)
        if row.get("status") == "ok":
            row.update(summarize_csv(row["csv"]))
        print(json.dumps(row, indent=2), flush=True)
        results.append(row)

    print("\n=== SUMMARY ===")
    print("N | relations | status | episodes | accept_rate(last20%) | illegal%(last20%) | ep_len(last20%)")
    for r in results:
        print(f"{r['num_events']} | {r.get('num_relations','?')} | {r['status']} | "
              f"{r.get('episodes','-')} | {r.get('last20_accept_rate','-')} | "
              f"{r.get('last20_illegal_ratio_mean','-')} | {r.get('last20_episode_steps_mean','-')}")

    out_path = Path(__file__).resolve().parent / "scaling_rl_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nWritten: {out_path}")


if __name__ == "__main__":
    main()
