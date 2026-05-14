import os
import sys
import time
import argparse
import csv
from pathlib import Path

# Use stable-baselines3 PPO directly (no action masking).
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.utils import set_random_seed

if __package__ is None:
    this_dir = os.path.dirname(__file__)
    src_root = os.path.abspath(os.path.join(this_dir, ".."))
    if src_root not in sys.path:
        sys.path.insert(0, src_root)

from envs.dcr_env import DCRGymEnv


class StepDebugCallback(BaseCallback):
    """Per-step debug trace: actions, rewards, and all reward components."""

    def __init__(self, env_ref, csv_path: Path, log_every: int = 500, verbose: int = 0):
        super().__init__(verbose)
        self.env_ref = env_ref
        self.csv_path = csv_path
        self.log_every = log_every
        self.episode_idx = 1
        self.step_in_episode = 0
        self._episode_reward_sum = 0.0
        self._ep_illegal_count = 0
        self._csv_file = None
        self._writer = None

    def _on_training_start(self) -> None:
        self.csv_path.parent.mkdir(parents=True, exist_ok=True)
        self._csv_file = open(self.csv_path, "w", newline="")
        self._writer = csv.DictWriter(
            self._csv_file,
            fieldnames=[
                "global_timestep",
                "episode",
                "step_in_episode",
                "action_idx",
                "action_event",
                "action_role",
                "action_label",
                "reward",
                "ep_rew_sum",
                "done",
                # Reward components
                "base_mapped",
                "novelty_delta",
                "progress_delta",
                # DCR state info
                "pending_before",
                "pending_after",
                "accepting",
                "goal_reached",
                "max_step_reached",
                # Convergence analysis
                "illegal_traces_count",
                "episode_steps",
                "illegal_traces_ratio",
                # Multi-objective metrics
                "event_cost",
                "event_duration",
                "episode_cost",
                "episode_duration",
                "message",
            ],
        )
        self._writer.writeheader()

    def _on_step(self) -> bool:
        infos = self.locals.get("infos") or []
        actions = self.locals.get("actions")
        rewards = self.locals.get("rewards")
        dones = self.locals.get("dones")

        if not infos:
            return True

        idx = 0
        info = infos[idx] if len(infos) > idx else {}
        action_idx = int(actions[idx]) if actions is not None else -1
        reward = float(rewards[idx]) if rewards is not None else 0.0
        done = bool(dones[idx]) if dones is not None else False

        engine_result = info.get("engine_result", {})
        pairs = getattr(self.env_ref, "event_role_pairs", None)
        if pairs and 0 <= action_idx < len(pairs):
            action_event = pairs[action_idx].get("event", "")
            action_role  = pairs[action_idx].get("role", "")
        elif 0 <= action_idx < len(self.env_ref.event_list):
            action_event = self.env_ref.event_list[action_idx]
            action_role  = info.get("action_role", "")
        else:
            action_event = ""
            action_role  = ""
        action_label = self.env_ref.label_map.get(action_event, action_event)

        self.step_in_episode += 1
        self._episode_reward_sum += reward

        base_mapped = engine_result.get("baseMapped", None)
        if base_mapped == -10:
            self._ep_illegal_count += 1
        
        # Get illegal traces count and episode steps from server
        illegal_traces_count = engine_result.get("illegalTracesCount", 0)
        episode_steps = engine_result.get("episodeSteps", self.step_in_episode)
        
        # Calculate illegal traces ratio (percentage of steps that were illegal)
        illegal_traces_ratio = (
            (illegal_traces_count / episode_steps * 100) if episode_steps > 0 else 0
        )
        
        row = {
            "global_timestep": int(self.num_timesteps),
            "episode": self.episode_idx,
            "step_in_episode": self.step_in_episode,
            "action_idx": action_idx,
            "action_event": action_event,
            "action_role": action_role,
            "action_label": action_label,
            "reward": reward,
            "ep_rew_sum": round(self._episode_reward_sum, 4),
            "done": done,
            "base_mapped": engine_result.get("baseMapped", ""),
            "novelty_delta": engine_result.get("noveltyDelta", ""),
            "progress_delta": engine_result.get("progressDelta", ""),
            "pending_before": engine_result.get("pendingBefore", ""),
            "pending_after": engine_result.get("pendingAfter", ""),
            "accepting": engine_result.get("accepting", ""),
            "goal_reached": engine_result.get("goalReached", ""),
            "max_step_reached": engine_result.get("maxStepReached", ""),
            "illegal_traces_count": illegal_traces_count,
            "episode_steps": episode_steps,
            "illegal_traces_ratio": round(illegal_traces_ratio, 2),
            "event_cost":       info.get("event_cost", ""),
            "event_duration":   info.get("event_duration", ""),
            "episode_cost":     info.get("episode_cost", ""),
            "episode_duration": info.get("episode_duration", ""),
            "message": engine_result.get("msg", ""),
        }
        self._writer.writerow(row)

        if (self.num_timesteps % self.log_every == 0) or done:
            print(
                f"[TRAIN] t={row['global_timestep']} ep={row['episode']} "
                f"step={row['step_in_episode']} action={action_label} "
                f"reward={reward:.2f} progress={row['progress_delta']} "
                f"pending={row['pending_before']}→{row['pending_after']} "
                f"accepting={row['accepting']} "
                f"illegal_ratio={row['illegal_traces_ratio']}%"
            )

        if done:
            illegal_traces_ratio = (
                self._ep_illegal_count / self.step_in_episode * 100
                if self.step_in_episode > 0
                else 0
            )
            self.logger.record("train/ep_rew_sum", self._episode_reward_sum)
            self.logger.record("train/illegal_traces_count", self._ep_illegal_count)
            self.logger.record("train/illegal_traces_ratio", illegal_traces_ratio)
            self.logger.record("train/episode_steps", episode_steps)

            # Multi-objective: log cost/duration on accepting episodes
            if info.get("accepting"):
                ep_cost = info.get("episode_cost")
                ep_dur  = info.get("episode_duration")
                if ep_cost is not None:
                    self.logger.record("pareto/episode_cost", ep_cost)
                if ep_dur is not None:
                    self.logger.record("pareto/episode_duration", ep_dur)

            self.logger.dump(self.num_timesteps)
            self.episode_idx += 1
            self.step_in_episode = 0
            self._episode_reward_sum = 0.0
            self._ep_illegal_count = 0

        return True

    def _on_training_end(self) -> None:
        if self._csv_file is not None:
            self._csv_file.close()


def train(
    node_url: str,
    exp_id: str,
    total_timesteps: int,
    out_dir: Path,
    ent_coef: float,
    tb_log_dir: Path,
    seed: int,
):
    ts = time.strftime("%Y%m%dT%H%M%S")
    run_name = f"exp_{exp_id}_{ts}"

    out_dir.mkdir(parents=True, exist_ok=True)
    tb_log_dir.mkdir(parents=True, exist_ok=True)

    print(f"--- Starting Experiment ---")
    print(f"Experiment ID:  {exp_id}")
    print(f"Entropy Coef:   {ent_coef}")
    print(f"Seed:           {seed}")
    print(f"Total Steps:    {total_timesteps}")
    print(f"TB Log Dir:     {tb_log_dir}")
    print(f"Policy:         PPO (no action masking)")
    print(f"---------------------------")

    logs_dir = out_dir.parent / "scripts" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    train_trace_csv = logs_dir / f"train_trace_{run_name}.csv"

    # --- Environment factory (no ActionMasker here) ---
    # The environment communicates valid actions via actionMask,
    # but the agent explores all actions and learns illegal ones by negative reward.
    def make_env(seed_offset: int):
        def _init():
            e = DCRGymEnv(node_url=node_url)
            # Ensure each env instance gets a deterministic seed.
            e.reset(seed=seed + seed_offset)
            return Monitor(e)
        return _init

    set_random_seed(seed)
    vec_env = DummyVecEnv([make_env(0)])

    # env_ref points to the inner DCRGymEnv (unwrap Monitor → DCRGymEnv)
    env_ref = vec_env.envs[0].env

    # --- PPO (standard, no action masking) ---
    model = PPO(
        "MlpPolicy",
        vec_env,
        verbose=1,
        tensorboard_log=str(tb_log_dir),
        ent_coef=ent_coef,
        seed=seed,
    )

    callback = StepDebugCallback(
        env_ref=env_ref, csv_path=train_trace_csv, log_every=500
    )
    model.learn(
        total_timesteps=total_timesteps,
        tb_log_name=run_name,
        callback=callback,
    )

    model_path = out_dir / f"ppo_{run_name}.zip"
    model.save(str(model_path))
    print(f"Model saved to: {model_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--exp-id", type=str, default="B")
    parser.add_argument("--steps", type=int, default=30000)
    parser.add_argument(
        "--node-url",
        type=str,
        default=os.environ.get("NODE_URL", "http://localhost:5001"),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("./models"))
    parser.add_argument(
        "--tb-log-dir",
        type=Path,
        default=Path(os.environ.get("TB_LOG_DIR", "./dcr_tensorboard")),
    )
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=1)

    args = parser.parse_args()
    train(
        node_url=args.node_url,
        exp_id=args.exp_id,
        total_timesteps=args.steps,
        out_dir=args.out_dir,
        ent_coef=args.ent_coef,
        tb_log_dir=args.tb_log_dir,
        seed=args.seed,
    )