"""
Deterministic evaluation of a frozen PPO policy against a running node-adapter
environment. Used by run_generalisation_gap.py (Analysis 2, sec:policy_generalisation)
to evaluate a policy trained on calibration durations against both the
calibration and test environments.

Writes one JSON record per episode to --out-csv (jsonl-ish CSV).
"""
import argparse
import csv
import os
import sys
from pathlib import Path

from stable_baselines3 import PPO

if __package__ is None:
    this_dir = os.path.dirname(__file__)
    src_root = os.path.abspath(os.path.join(this_dir, "..", "src"))
    if src_root not in sys.path:
        sys.path.insert(0, src_root)

from envs.dcr_env import DCRGymEnv  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", type=Path, required=True)
    parser.add_argument("--node-url", type=str, default=os.environ.get("NODE_URL", "http://localhost:5001"))
    parser.add_argument("--episodes", type=int, default=500)
    parser.add_argument("--out-csv", type=Path, required=True)
    parser.add_argument("--env-tag", type=str, required=True, help="e.g. 'calib' or 'test'")
    args = parser.parse_args()

    model = PPO.load(str(args.model_path))
    env = DCRGymEnv(node_url=args.node_url)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_csv, "w", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["env_tag", "episode", "steps", "episode_cost", "episode_duration", "accepting"]
        )
        writer.writeheader()

        for ep in range(args.episodes):
            obs, _ = env.reset()
            done = False
            steps = 0
            accepting = False
            while not done and steps < 300:
                action, _ = model.predict(obs, deterministic=True)
                obs, reward, done, _, info = env.step(action)
                steps += 1
                accepting = info.get("accepting", False)

            writer.writerow({
                "env_tag": args.env_tag,
                "episode": ep,
                "steps": steps,
                "episode_cost": env.episode_cost,
                "episode_duration": env.episode_duration,
                "accepting": accepting,
            })

    print(f"[OK] Wrote {args.episodes} episodes to {args.out_csv}")


if __name__ == "__main__":
    main()
