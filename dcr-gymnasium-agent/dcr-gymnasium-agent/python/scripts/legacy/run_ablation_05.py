"""
External validation of the Safe RL ablation (saferl vs rl_only) on graph 05
(Tobias mined "Synthetic Event Logs - Review Example Large", 14 events) --
replicates the same comparison already done internally on LoanApp_junior_senior
(run_ablation.py), but on a graph that played no role whatsoever in designing
the shield, reward shaping, or hyperparameters: cost/duration were assigned by
a fixed seeded policy (tobias_converter.py), never touched by hand, and the
graph structure is third-party (mined from a real event log by a different
thesis, not built or tuned for this project).

MiniZinc ground truth for this graph (Phase 1/2 of the scaling study) is two
Pareto points: cost=335/duration=410 and cost=339/duration=387, via the trace
invite_reviewers -> {time_out_2 | get_review_2} -> get_review_3 -> get_review_1
-> collect_reviews -> decide. saferl recovering these (not just producing
*some* valid trace) is the bonus check LoanApp's ablation never had.

Unlike run_ablation.py, this starts node directly (no nvm) since this machine
has no nvm installed -- mirrors run_scaling_rl_local.py's approach.

Usage:
    python scripts/run_ablation_05.py --condition saferl --steps 20000   # pilot
    python scripts/run_ablation_05.py --condition rl_only --steps 20000  # pilot
    python scripts/run_ablation_05.py --condition saferl --steps 100000  # full
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = PYTHON_PROJECT_DIR / "models_ablation_05"
PORT = "5210"
NODE_URL = f"http://localhost:{PORT}"

XML_FILE = str(ROOT / "app" / "public" / "examples" / "diagrams" / "Mined_05_SyntheticReviewLarge.xml")
EXP_BASE = "Mined05_external"

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]

MAX_EPISODE_STEPS = 300


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


def build_env(condition, cost_w, dur_w):
    env = os.environ.copy()
    env.update({
        "DCR_XML": XML_FILE,
        "PORT": PORT,
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


def logs_dir_for(condition):
    return PYTHON_PROJECT_DIR / "scripts" / f"logs_ablation_05_{condition}"


def run_ppo_condition(condition, cost_w, dur_w, total_steps, seed, ent_coef):
    weight_tag = f"a{cost_w}_b{dur_w}".replace(".", "p")
    exp_id = f"{EXP_BASE}_{condition}_s{seed}_{weight_tag}"
    out_dir = logs_dir_for(condition)
    out_dir.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    run_log = out_dir / f"run_{exp_id}_{int(time.time())}.log"

    print(f"[{condition.upper()}] {exp_id} | a={cost_w} b={dur_w} | steps={total_steps}")

    env = build_env(condition, cost_w, dur_w)
    free_port(PORT)

    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            ["node", "dist/server.mjs"], cwd=str(NODE_ADAPTER_DIR), env=env,
            stdout=subprocess.DEVNULL, stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=25):
                proc.terminate()
                proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            train_cmd = [
                sys.executable, "src/agents/train_agent.py",
                "--exp-id", exp_id, "--steps", str(total_steps),
                "--node-url", NODE_URL, "--out-dir", str(MODELS_DIR),
                "--tb-log-dir", "", "--ent-coef", str(ent_coef),
                "--seed", str(seed),
            ]
            ret = subprocess.run(train_cmd, cwd=str(PYTHON_PROJECT_DIR), env=env,
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
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--condition", required=True, choices=["saferl", "rl_only"])
    ap.add_argument("--steps", type=int, default=100000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--ent-coef", type=float, default=0.1)
    args = ap.parse_args()

    assert Path(XML_FILE).exists(), f"Graph XML not found: {XML_FILE}"
    print(f"=== Ablation-05: condition={args.condition} | seed={args.seed} ===")
    print(f"XML: {XML_FILE}")

    for cost_w, dur_w in PARETO_WEIGHTS:
        run_ppo_condition(args.condition, cost_w, dur_w, args.steps, args.seed, args.ent_coef)
        time.sleep(2)

    print("Done.")


if __name__ == "__main__":
    main()
