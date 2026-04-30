import argparse
import csv
import os
import sys
from pathlib import Path

from stable_baselines3 import PPO

# Allow running as script from scripts/
SCRIPT_DIR = Path(__file__).resolve().parent
PY_ROOT = SCRIPT_DIR.parent
SRC_ROOT = PY_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from envs.dcr_env import DCRGymEnv


def _state_to_str_list(state_obj, key):
    vals = state_obj.get(key, []) if isinstance(state_obj, dict) else []
    if vals is None:
        vals = []
    return sorted([str(v) for v in vals])


def export_trace(model_path: Path, node_url: str, episodes: int, max_steps: int, out_csv: Path, deterministic: bool):
    env = DCRGymEnv(node_url=node_url)
    model = PPO.load(str(model_path))

    out_csv.parent.mkdir(parents=True, exist_ok=True)

    with open(out_csv, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "episode",
                "step",
                "action_idx",
                "action_event",
                "action_label",
                "reward",
                "done",
                "accepting",
                "goal_reached",
                "max_step_reached",
                "engine_reward",
                "base_mapped",
                "novelty_delta",
                "included",
                "executed",
                "pending",
            ],
        )
        writer.writeheader()

        for ep in range(1, episodes + 1):
            obs, _ = env.reset()

            for t in range(1, max_steps + 1):
                action, _ = model.predict(obs, deterministic=deterministic)
                action_idx = int(action)
                action_event = env.event_list[action_idx]
                action_label = env.label_map.get(action_event, action_event)

                obs, reward, done, truncated, info = env.step(action_idx)
                result = info.get("engine_result", {})
                state = result.get("state", {})

                writer.writerow(
                    {
                        "episode": ep,
                        "step": t,
                        "action_idx": action_idx,
                        "action_event": action_event,
                        "action_label": action_label,
                        "reward": reward,
                        "done": bool(done),
                        "accepting": result.get("accepting", ""),
                        "goal_reached": result.get("goalReached", ""),
                        "max_step_reached": result.get("maxStepReached", ""),
                        "engine_reward": result.get("reward", ""),
                        "base_mapped": result.get("baseMapped", ""),
                        "novelty_delta": result.get("noveltyDelta", ""),
                        "included": "|".join(_state_to_str_list(state, "included")),
                        "executed": "|".join(_state_to_str_list(state, "executed")),
                        "pending": "|".join(_state_to_str_list(state, "pending")),
                    }
                )

                if done or truncated:
                    break

    env.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export per-step state trace for a trained PPO model.")
    parser.add_argument("--model", type=Path, required=True, help="Path to PPO .zip model")
    parser.add_argument("--node-url", type=str, default="http://localhost:5001", help="Node adapter URL")
    parser.add_argument("--episodes", type=int, default=5, help="Number of evaluation episodes")
    parser.add_argument("--max-steps", type=int, default=200, help="Max steps per episode")
    parser.add_argument("--out", type=Path, default=SCRIPT_DIR / "logs" / "state_trace.csv", help="Output CSV")
    parser.add_argument("--stochastic", action="store_true", help="Use stochastic action selection instead of deterministic policy")
    args = parser.parse_args()

    export_trace(
        model_path=args.model,
        node_url=args.node_url,
        episodes=args.episodes,
        max_steps=args.max_steps,
        out_csv=args.out,
        deterministic=not args.stochastic,
    )

    print(f"State trace exported to: {args.out}")
