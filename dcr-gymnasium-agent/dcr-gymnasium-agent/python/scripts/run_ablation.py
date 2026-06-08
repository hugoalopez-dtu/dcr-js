"""
Ablation runner for internal validation of the Safe RL pipeline.

Three conditions:
  saferl        — PPO + DCR shielding (full method, baseline reference)
  rl_only       — PPO without DCR shielding (SHIELD_DISABLED=1)
  shield_only   — random valid-action agent, no PPO learning

Usage:
    python run_ablation.py --condition saferl
    python run_ablation.py --condition rl_only
    python run_ablation.py --condition shield_only [--episodes 14500]
    python run_ablation.py --condition rl_only --steps 100000 --seed 1

Output directories (under .../scripts/):
    logs_ablation_saferl/
    logs_ablation_rl_only/
    logs_ablation_shield_only/

The CSV schema matches the main training logs so analysis_loanapp_roles.ipynb
can load all three conditions with the same loader.
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

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT              = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR  = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR        = PYTHON_PROJECT_DIR / "models_ablation"
PORT              = "5001"
NODE_URL          = f"http://localhost:{PORT}"

XML_FILE = str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml")
EXP_BASE = "LoanApp_roles"

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


# ── Node adapter helpers ────────────────────────────────────────────────────
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


def free_port(port: str):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    for pid in result.stdout.split():
        try:
            os.kill(int(pid), 9)
        except Exception:
            pass


def build_env(condition: str, cost_w: float, dur_w: float) -> dict:
    env = os.environ.copy()
    env.update({
        "DCR_XML":                  XML_FILE,
        "PORT":                     PORT,
        "GOAL_LABEL":               "",
        "MAX_EPISODE_STEPS":        str(MAX_EPISODE_STEPS),
        "COST_WEIGHT":              str(cost_w),
        "DURATION_WEIGHT":          str(dur_w),
        "STEP_PENALTY":             "-1.5",
        "RESET_NOVELTY_ON_RESET":   "0",
        "STRICT_GOAL_TERMINATION":  "0",
    })
    if condition == "rl_only":
        env["SHIELD_DISABLED"] = "1"
    else:
        env.pop("SHIELD_DISABLED", None)
    return env


def logs_dir_for(condition: str) -> Path:
    return PYTHON_PROJECT_DIR / "scripts" / f"logs_ablation_{condition}"


# ── Condition A/B: PPO training (saferl or rl_only) ────────────────────────
def run_ppo_condition(condition: str, cost_w: float, dur_w: float,
                      total_steps: int, seed: int):
    weight_tag = f"a{cost_w}_b{dur_w}".replace(".", "p")
    exp_id     = f"{EXP_BASE}_{condition}_s{seed}_{weight_tag}"
    out_dir    = logs_dir_for(condition)
    out_dir.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    run_log    = out_dir / f"run_{exp_id}_{int(time.time())}.log"

    print(f"[{condition.upper()}] {exp_id} | α={cost_w} β={dur_w} | steps={total_steps}")

    env = build_env(condition, cost_w, dur_w)
    free_port(PORT)

    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"],
            cwd=str(NODE_ADAPTER_DIR), env=env,
            stdout=subprocess.DEVNULL, stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=30):
                proc.terminate(); proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            train_cmd = [
                sys.executable, "src/agents/train_agent.py",
                "--exp-id",     exp_id,
                "--steps",      str(total_steps),
                "--node-url",   NODE_URL,
                "--out-dir",    str(MODELS_DIR),
                "--tb-log-dir", str(MODELS_DIR / "tb"),
                "--ent-coef",   "0.1",
                "--seed",       str(seed),
            ]
            ret = subprocess.run(
                train_cmd, cwd=str(PYTHON_PROJECT_DIR),
                env=env, stdout=subprocess.DEVNULL, stderr=lf,
            )
            if ret.returncode != 0:
                print(f"[ERROR] code {ret.returncode}. See {run_log}")
            else:
                # Move CSV from default logs/ to condition-specific directory
                default_logs = PYTHON_PROJECT_DIR / "scripts" / "logs"
                for csv_f in sorted(default_logs.glob(f"train_trace_exp_{exp_id}_*.csv")):
                    csv_f.rename(out_dir / csv_f.name)
                    print(f"[OK] {out_dir / csv_f.name}")
        finally:
            proc.terminate()
            try:    proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill(); proc.wait()


# ── Condition C: Shielding-only (random valid actions, no PPO) ─────────────
def _http_reset(url):
    r = requests.post(f"{url}/reset", timeout=5); r.raise_for_status()
    return r.json()


def _http_step(url, action_idx):
    r = requests.post(f"{url}/action", json={"action": action_idx}, timeout=5)
    r.raise_for_status()
    return r.json()


def run_shield_only(n_episodes: int, seed: int):
    condition = "shield_only"
    out_dir   = logs_dir_for(condition)
    out_dir.mkdir(parents=True, exist_ok=True)

    ts       = time.strftime("%Y%m%dT%H%M%S")
    csv_path = out_dir / f"train_trace_exp_{EXP_BASE}_{condition}_s{seed}_a0p0_b0p0_{ts}.csv"
    run_log  = out_dir / f"run_{condition}_{int(time.time())}.log"

    print(f"[SHIELD_ONLY] {n_episodes} episodes | seed={seed}")

    env = build_env(condition, 0.0, 0.0)
    free_port(PORT)
    random.seed(seed)

    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"],
            cwd=str(NODE_ADAPTER_DIR), env=env,
            stdout=subprocess.DEVNULL, stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=30):
                proc.terminate(); proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            global_t = 0
            with open(csv_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
                writer.writeheader()

                for ep in range(1, n_episodes + 1):
                    init         = _http_reset(NODE_URL)
                    action_mask  = init.get("actionMask", [])
                    pairs        = init.get("eventRolePairs", [])
                    ep_rew_sum   = 0.0
                    step_in_ep   = 0

                    for _ in range(MAX_EPISODE_STEPS):
                        valid = [i for i, m in enumerate(action_mask) if m == 1]
                        if not valid:
                            break
                        action_idx  = random.choice(valid)
                        resp        = _http_step(NODE_URL, action_idx)
                        result      = resp.get("result", {})
                        reward      = result.get("stepReward", result.get("reward", 0))
                        done        = bool(result.get("done", False))
                        action_mask = resp.get("actionMask", [])
                        global_t   += 1
                        step_in_ep += 1
                        ep_rew_sum += reward
                        pair        = pairs[action_idx] if action_idx < len(pairs) else {}

                        writer.writerow({
                            "global_timestep":      global_t,
                            "episode":              ep,
                            "step_in_episode":      step_in_ep,
                            "action_idx":           action_idx,
                            "action_event":         pair.get("event", ""),
                            "action_role":          pair.get("role", ""),
                            "action_label":         pair.get("event", ""),
                            "reward":               round(reward, 4),
                            "ep_rew_sum":           round(ep_rew_sum, 4),
                            "done":                 done,
                            "base_mapped":          result.get("baseMapped", ""),
                            "novelty_delta":        result.get("noveltyDelta", ""),
                            "progress_delta":       result.get("progressDelta", ""),
                            "pending_before":       result.get("pendingBefore", ""),
                            "pending_after":        result.get("pendingAfter", ""),
                            "accepting":            result.get("accepting", False),
                            "goal_reached":         result.get("goalReached", False),
                            "max_step_reached":     result.get("maxStepReached", False),
                            "illegal_traces_count": 0,
                            "episode_steps":        step_in_ep,
                            "illegal_traces_ratio": 0.0,
                            "event_cost":           result.get("eventCost", ""),
                            "event_duration":       result.get("eventDuration", ""),
                            "episode_cost":         result.get("episodeCost", ""),
                            "episode_duration":     result.get("episodeDuration", ""),
                            "action_compliant":     True,  # shield_only always picks valid actions
                            "message":              result.get("msg", ""),
                        })
                        if done:
                            break

                    if ep % 500 == 0:
                        print(f"  ep {ep}/{n_episodes} | t={global_t}")

            print(f"[OK] {csv_path}")
        finally:
            proc.terminate()
            try:    proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill(); proc.wait()


# ── Entry point ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Run one ablation condition for the Safe RL validation study."
    )
    parser.add_argument(
        "--condition", required=True,
        choices=["saferl", "rl_only", "shield_only"],
        help="Which condition to run: saferl | rl_only | shield_only",
    )
    parser.add_argument("--steps",    type=int, default=100000,
                        help="PPO timesteps per weight pair (saferl / rl_only only)")
    parser.add_argument("--episodes", type=int, default=14500,
                        help="Episodes for shield_only (match Safe RL episode count)")
    parser.add_argument("--seed",     type=int, default=1)
    args = parser.parse_args()

    print(f"=== Ablation: condition={args.condition} | seed={args.seed} ===")
    print(f"XML: {XML_FILE}")

    if args.condition == "shield_only":
        run_shield_only(n_episodes=args.episodes, seed=args.seed)
    else:
        for cost_w, dur_w in PARETO_WEIGHTS:
            run_ppo_condition(
                condition=args.condition,
                cost_w=cost_w, dur_w=dur_w,
                total_steps=args.steps, seed=args.seed,
            )
            time.sleep(2)

    print("Done.")


if __name__ == "__main__":
    main()
