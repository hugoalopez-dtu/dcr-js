"""
Ablation: Shielding-only (random policy constrained by DCR engine).

No PPO learning. At each step, sample uniformly from the valid action mask
returned by the DCR engine. The shield guarantees 100% compliance; the agent
makes no progress beyond random chance.

Run the same number of episodes as the Safe RL runs (~14 k) so the Pareto
clouds are directly comparable in density.

Logs written to: <repo>/dcr-gymnasium-agent/.../scripts/logs_shield_only/
Usage:
    python run_shielding_only.py [--episodes 14500] [--node-url http://localhost:5001]
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
LOGS_DIR = PYTHON_PROJECT_DIR / "scripts" / "logs_shield_only"
PORT = "5001"
NODE_URL_DEFAULT = f"http://localhost:{PORT}"

XML_FILE = str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml")
EXP_ID   = "LoanApp_roles_shield_only"
MAX_STEPS_PER_EPISODE = 300

# Shielding-only doesn't optimise cost/duration, but we still log them.
# Run once (weights irrelevant — agent ignores reward).
COST_WEIGHT     = 0.0
DURATION_WEIGHT = 0.0


def wait_for_adapter(url, timeout=25):
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


def free_port(port: str):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    if result.returncode != 0:
        return
    for pid_str in result.stdout.split():
        try:
            os.kill(int(pid_str), 9)
        except Exception:
            pass


def reset(node_url):
    r = requests.post(f"{node_url}/reset", timeout=5)
    r.raise_for_status()
    return r.json()


def step(node_url, action_idx):
    r = requests.post(f"{node_url}/action", json={"action": action_idx}, timeout=5)
    r.raise_for_status()
    return r.json()


def run_episodes(node_url: str, n_episodes: int, csv_path: Path):
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "global_timestep", "episode", "step_in_episode",
        "action_idx", "action_event", "action_role", "action_label",
        "reward", "ep_rew_sum", "done",
        "base_mapped", "novelty_delta", "progress_delta",
        "pending_before", "pending_after",
        "accepting", "goal_reached", "max_step_reached",
        "illegal_traces_count", "episode_steps", "illegal_traces_ratio",
        "event_cost", "event_duration", "episode_cost", "episode_duration",
        "message",
    ]

    global_t = 0
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for ep in range(1, n_episodes + 1):
            init = reset(node_url)
            action_mask = init.get("actionMask", [])
            ep_reward_sum = 0.0
            step_in_ep = 0

            for _ in range(MAX_STEPS_PER_EPISODE):
                valid_indices = [i for i, m in enumerate(action_mask) if m == 1]
                if not valid_indices:
                    # No valid actions — should not happen in a well-formed graph
                    break

                action_idx = random.choice(valid_indices)
                resp = step(node_url, action_idx)
                result = resp.get("result", {})
                reward = result.get("stepReward", result.get("reward", 0))
                done   = bool(result.get("done", False))
                action_mask = resp.get("actionMask", [])
                global_t += 1
                step_in_ep += 1
                ep_reward_sum += reward

                # Resolve event/role label
                pairs = init.get("eventRolePairs", [])
                pair  = pairs[action_idx] if action_idx < len(pairs) else {}

                row = {
                    "global_timestep":      global_t,
                    "episode":              ep,
                    "step_in_episode":      step_in_ep,
                    "action_idx":           action_idx,
                    "action_event":         pair.get("event", ""),
                    "action_role":          pair.get("role", ""),
                    "action_label":         pair.get("event", ""),
                    "reward":               round(reward, 4),
                    "ep_rew_sum":           round(ep_reward_sum, 4),
                    "done":                 done,
                    "base_mapped":          result.get("baseMapped", ""),
                    "novelty_delta":        result.get("noveltyDelta", ""),
                    "progress_delta":       result.get("progressDelta", ""),
                    "pending_before":       result.get("pendingBefore", ""),
                    "pending_after":        result.get("pendingAfter", ""),
                    "accepting":            result.get("accepting", False),
                    "goal_reached":         result.get("goalReached", False),
                    "max_step_reached":     result.get("maxStepReached", False),
                    "illegal_traces_count": result.get("illegalTracesCount", 0),
                    "episode_steps":        result.get("episodeSteps", step_in_ep),
                    "illegal_traces_ratio": 0.0,  # random-valid agent: no illegal attempts
                    "event_cost":           result.get("eventCost", ""),
                    "event_duration":       result.get("eventDuration", ""),
                    "episode_cost":         result.get("episodeCost", ""),
                    "episode_duration":     result.get("episodeDuration", ""),
                    "message":              result.get("msg", ""),
                }
                writer.writerow(row)

                if done:
                    break

            if ep % 500 == 0:
                print(f"  episode {ep}/{n_episodes} | t={global_t}")

    print(f"Wrote {csv_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=int, default=14500,
                        help="Number of episodes to run (match Safe RL episode count)")
    parser.add_argument("--node-url", type=str, default=NODE_URL_DEFAULT)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    random.seed(args.seed)

    ts = time.strftime("%Y%m%dT%H%M%S")
    csv_path = LOGS_DIR / f"train_trace_exp_{EXP_ID}_s{args.seed}_a0p0_b0p0_{ts}.csv"

    env = os.environ.copy()
    env["DCR_XML"]             = XML_FILE
    env["PORT"]                = PORT
    env["GOAL_LABEL"]          = ""
    env["MAX_EPISODE_STEPS"]   = str(MAX_STEPS_PER_EPISODE)
    env["COST_WEIGHT"]         = str(COST_WEIGHT)
    env["DURATION_WEIGHT"]     = str(DURATION_WEIGHT)
    env["STEP_PENALTY"]        = "-1.5"
    env["RESET_NOVELTY_ON_RESET"] = "0"
    env["STRICT_GOAL_TERMINATION"] = "0"

    free_port(PORT)
    run_log = LOGS_DIR / f"run_{EXP_ID}_{int(time.time())}.log"
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== Shielding-only ablation ===")
    print(f"XML: {XML_FILE}")
    print(f"Episodes: {args.episodes} | Seed: {args.seed}")

    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"],
            cwd=str(NODE_ADAPTER_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=lf,
        )
        try:
            if not wait_for_adapter(args.node_url, timeout=30):
                proc.terminate()
                proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            run_episodes(args.node_url, args.episodes, csv_path)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()

    print("Done.")


if __name__ == "__main__":
    main()
