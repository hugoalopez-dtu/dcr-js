"""
Generic Safe-RL ablation runner for any of the Tobias mined-graph benchmark
suite, parametrized by graph path -- generalizes run_ablation_05.py so the
same saferl / rl_only / shield_only comparison can run across the full
size x density x constraint-type grid the professor asked for, not just one
graph. No nvm dependency (plain `node`), for local runs; same env-var
contract as run_ablation.py / run_experiments.py so cluster runs only need
to swap the node-start command back to the nvm-sourcing one.

Usage:
    python scripts/run_ablation_mined.py --graph app/public/examples/diagrams/Mined_04_BPI2013Incidents.xml \
        --exp-base Mined04 --condition saferl --steps 20000 --port 5220

    python scripts/run_ablation_mined.py --graph ... --exp-base Mined04 --condition shield_only --episodes 2000 --port 5220
"""
import argparse
import csv
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]

MAX_EPISODE_STEPS = 300

CSV_FIELDNAMES = [
    "global_timestep", "episode", "step_in_episode",
    "action_idx", "action_event", "action_role", "action_label",
    "reward", "ep_rew_sum", "done",
    "base_mapped", "novelty_delta", "progress_delta",
    "pending_before", "pending_after",
    "accepting", "goal_reached", "max_step_reached",
    "illegal_traces_count", "episode_steps", "illegal_traces_ratio",
    "event_cost", "event_duration", "episode_cost", "episode_duration",
    "action_compliant",
    "message",
]


def wait_for_adapter(url, timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.post(f"{url}/reset", timeout=2).ok:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def free_port(port):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    for pid in result.stdout.split():
        try:
            os.kill(int(pid), 9)
        except Exception:
            pass
    time.sleep(0.3)


def build_env(xml_file, port, condition, cost_w, dur_w):
    env = os.environ.copy()
    env.update({
        "DCR_XML": str(xml_file),
        "PORT": str(port),
        "GOAL_LABEL": "",
        "MAX_EPISODE_STEPS": str(MAX_EPISODE_STEPS),
        "COST_WEIGHT": str(cost_w),
        "DURATION_WEIGHT": str(dur_w),
        "STEP_PENALTY": "-1.5",
        "RESET_NOVELTY_ON_RESET": "0",
        "STRICT_GOAL_TERMINATION": "0",
    })
    if condition == "rl_only":
        env["SHIELD_DISABLED"] = "1"
    else:
        env.pop("SHIELD_DISABLED", None)
    return env


def logs_dir_for(exp_base, condition):
    return PYTHON_PROJECT_DIR / "scripts" / f"logs_ablation_{exp_base}_{condition}"


def start_adapter(xml_file, port, condition, cost_w, dur_w, log_path):
    free_port(port)
    env = build_env(xml_file, port, condition, cost_w, dur_w)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lf = open(log_path, "ab")
    proc = subprocess.Popen(["node", "dist/server.mjs"], cwd=str(NODE_ADAPTER_DIR), env=env,
                             stdout=subprocess.DEVNULL, stderr=lf)
    if not wait_for_adapter(f"http://localhost:{port}", timeout=25):
        proc.terminate()
        proc.wait(timeout=5)
        lf.close()
        raise RuntimeError(f"Node adapter failed to start; see {log_path}")
    return proc, lf


def stop_adapter(proc, lf, port):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    lf.close()
    free_port(port)


def run_ppo_condition(xml_file, exp_base, condition, cost_w, dur_w, total_steps, seed, ent_coef, port):
    weight_tag = f"a{cost_w}_b{dur_w}".replace(".", "p")
    exp_id = f"{exp_base}_{condition}_s{seed}_{weight_tag}"
    out_dir = logs_dir_for(exp_base, condition)
    out_dir.mkdir(parents=True, exist_ok=True)
    models_dir = PYTHON_PROJECT_DIR / f"models_ablation_{exp_base}"
    models_dir.mkdir(parents=True, exist_ok=True)
    run_log = out_dir / f"run_{exp_id}_{int(time.time())}.log"

    print(f"[{condition.upper()}] {exp_id} | a={cost_w} b={dur_w} | steps={total_steps}")
    proc, lf = start_adapter(xml_file, port, condition, cost_w, dur_w, run_log)
    try:
        node_url = f"http://localhost:{port}"
        train_cmd = [
            sys.executable, "src/agents/train_agent.py",
            "--exp-id", exp_id, "--steps", str(total_steps),
            "--node-url", node_url, "--out-dir", str(models_dir),
            "--tb-log-dir", "", "--ent-coef", str(ent_coef),
            "--seed", str(seed),
        ]
        ret = subprocess.run(train_cmd, cwd=str(PYTHON_PROJECT_DIR),
                              env=build_env(xml_file, port, condition, cost_w, dur_w),
                              stdout=subprocess.DEVNULL, stderr=lf)
        if ret.returncode != 0:
            print(f"[ERROR] code {ret.returncode}. See {run_log}")
            return
        default_logs = PYTHON_PROJECT_DIR / "scripts" / "logs"
        for csv_f in sorted(default_logs.glob(f"train_trace_exp_{exp_id}_*.csv")):
            dest = out_dir / csv_f.name
            csv_f.rename(dest)
            print(f"[OK] {dest}")
    finally:
        stop_adapter(proc, lf, port)


def _http_reset(url):
    r = requests.post(f"{url}/reset", timeout=5)
    r.raise_for_status()
    return r.json()


def _http_step(url, action_idx):
    r = requests.post(f"{url}/action", json={"action": action_idx}, timeout=5)
    r.raise_for_status()
    return r.json()


def run_shield_only(xml_file, exp_base, n_episodes, seed, port):
    condition = "shield_only"
    out_dir = logs_dir_for(exp_base, condition)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%S")
    csv_path = out_dir / f"train_trace_exp_{exp_base}_{condition}_s{seed}_a0p0_b0p0_{ts}.csv"
    run_log = out_dir / f"run_{condition}_{int(time.time())}.log"

    print(f"[SHIELD_ONLY] {exp_base} | {n_episodes} episodes | seed={seed}")
    proc, lf = start_adapter(xml_file, port, condition, 0.0, 0.0, run_log)
    random.seed(seed)
    node_url = f"http://localhost:{port}"
    try:
        global_t = 0
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
            for ep in range(1, n_episodes + 1):
                init = _http_reset(node_url)
                action_mask = init.get("actionMask", [])
                pairs = init.get("eventRolePairs", [])
                ep_rew_sum = 0.0
                step_in_ep = 0
                for _ in range(MAX_EPISODE_STEPS):
                    valid = [i for i, m in enumerate(action_mask) if m == 1]
                    if not valid:
                        break
                    action_idx = random.choice(valid)
                    resp = _http_step(node_url, action_idx)
                    result = resp.get("result", {})
                    reward = result.get("stepReward", result.get("reward", 0))
                    done = bool(result.get("done", False))
                    action_mask = resp.get("actionMask", [])
                    global_t += 1
                    step_in_ep += 1
                    ep_rew_sum += reward
                    pair = pairs[action_idx] if action_idx < len(pairs) else {}
                    writer.writerow({
                        "global_timestep": global_t, "episode": ep, "step_in_episode": step_in_ep,
                        "action_idx": action_idx, "action_event": pair.get("event", ""),
                        "action_role": pair.get("role", ""), "action_label": pair.get("event", ""),
                        "reward": round(reward, 4), "ep_rew_sum": round(ep_rew_sum, 4), "done": done,
                        "base_mapped": result.get("baseMapped", ""),
                        "novelty_delta": result.get("noveltyDelta", ""),
                        "progress_delta": result.get("progressDelta", ""),
                        "pending_before": result.get("pendingBefore", ""),
                        "pending_after": result.get("pendingAfter", ""),
                        "accepting": result.get("accepting", False),
                        "goal_reached": result.get("goalReached", False),
                        "max_step_reached": result.get("maxStepReached", False),
                        "illegal_traces_count": 0, "episode_steps": step_in_ep,
                        "illegal_traces_ratio": 0.0,
                        "event_cost": result.get("eventCost", ""),
                        "event_duration": result.get("eventDuration", ""),
                        "episode_cost": result.get("episodeCost", ""),
                        "episode_duration": result.get("episodeDuration", ""),
                        "action_compliant": True,
                        "message": result.get("msg", ""),
                    })
                    if done:
                        break
                if ep % 500 == 0:
                    print(f"  ep {ep}/{n_episodes} | t={global_t}")
        print(f"[OK] {csv_path}")
    finally:
        stop_adapter(proc, lf, port)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True, type=Path)
    ap.add_argument("--exp-base", required=True)
    ap.add_argument("--condition", required=True, choices=["saferl", "rl_only", "shield_only"])
    ap.add_argument("--steps", type=int, default=100000)
    ap.add_argument("--episodes", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--ent-coef", type=float, default=0.1)
    ap.add_argument("--port", type=int, default=5220)
    args = ap.parse_args()

    assert args.graph.exists(), f"Graph XML not found: {args.graph}"
    print(f"=== {args.exp_base}: condition={args.condition} | seed={args.seed} ===")
    print(f"XML: {args.graph}")

    if args.condition == "shield_only":
        run_shield_only(args.graph, args.exp_base, args.episodes, args.seed, args.port)
    else:
        for cost_w, dur_w in PARETO_WEIGHTS:
            run_ppo_condition(args.graph, args.exp_base, args.condition, cost_w, dur_w,
                               args.steps, args.seed, args.ent_coef, args.port)
            time.sleep(2)
    print("Done.")


if __name__ == "__main__":
    main()
