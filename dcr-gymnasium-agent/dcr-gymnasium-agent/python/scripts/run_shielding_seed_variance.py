"""
Seed variance for the Shielding-only baseline on LoanApp_junior_senior.

Runs a random-valid-action agent with the DCR shield enabled and no PPO
training. The episode budget defaults to 14,500, matching the existing
shield-only ablation script budget that produced the single-run 2,900
accepting-episode baseline.

It can also summarize existing train_trace CSVs copied back from the cluster:

    python scripts/run_shielding_seed_variance.py \
      --analyze-csv-dir /Users/sofia/Desktop/logs_ablation_shield_only
"""
import argparse
import csv
import json
import math
import os
import random
import signal
import subprocess
import time
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
SCRIPTS_DIR = Path(__file__).resolve().parent
XML_FILE = ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml"

PORT = "5001"
NODE_URL = f"http://localhost:{PORT}"
MAX_EPISODE_STEPS = 300
DEFAULT_EPISODES = 14500
DEFAULT_SEEDS = [1, 2, 3, 4]
DEFAULT_LAST_FRACTION = 0.20


def dominates(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and (a[0] < b[0] or a[1] < b[1])


def pareto_front(points):
    seen = {}
    for p in points:
        key = (round(p["cost"], 3), round(p["duration"], 3))
        if key not in seen:
            seen[key] = p
    unique = list(seen.values())
    front = []
    for candidate in unique:
        if not any(
            dominates((p["cost"], p["duration"]), (candidate["cost"], candidate["duration"]))
            for p in unique
            if p is not candidate
        ):
            front.append(candidate)
    return sorted(front, key=lambda p: (p["cost"], p["duration"]))


def sample_std(values):
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1))


def mean(values):
    return sum(values) / len(values) if values else 0.0


def free_port(port):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    for pid in result.stdout.split():
        try:
            os.kill(int(pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
    time.sleep(0.5)


def wait_for_adapter(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.post(f"{NODE_URL}/reset", timeout=2)
            if r.ok:
                return True
        except requests.RequestException:
            pass
        time.sleep(0.5)
    return False


def start_adapter(log_path):
    free_port(PORT)
    env = os.environ.copy()
    env.update({
        "DCR_XML": str(XML_FILE),
        "PORT": PORT,
        "GOAL_LABEL": "",
        "MAX_EPISODE_STEPS": str(MAX_EPISODE_STEPS),
        "COST_WEIGHT": "0",
        "DURATION_WEIGHT": "0",
        "STEP_PENALTY": "-1.5",
        "RESET_NOVELTY_ON_RESET": "0",
        "STRICT_GOAL_TERMINATION": "0",
    })
    env.pop("SHIELD_DISABLED", None)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = open(log_path, "a")
    proc = subprocess.Popen(
        ["node", "dist/server.mjs"],
        cwd=str(NODE_ADAPTER_DIR),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    if not wait_for_adapter():
        proc.kill()
        proc.wait()
        log_file.close()
        raise RuntimeError(f"node-adapter did not start; see {log_path}")
    return proc, log_file


def stop_adapter(proc, log_file):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    log_file.close()
    free_port(PORT)


def post_json(path, payload=None):
    if payload is None:
        response = requests.post(f"{NODE_URL}{path}", timeout=5)
    else:
        response = requests.post(f"{NODE_URL}{path}", json=payload, timeout=5)
    response.raise_for_status()
    return response.json()


def run_seed(seed, episodes):
    rng = random.Random(seed)
    accepting_points = []
    accepting_episodes = 0
    total_env_steps = 0

    for ep in range(1, episodes + 1):
        init = post_json("/reset")
        action_mask = init.get("actionMask", [])

        for _ in range(MAX_EPISODE_STEPS):
            valid = [i for i, mask in enumerate(action_mask) if mask == 1]
            if not valid:
                break

            action_idx = rng.choice(valid)
            resp = post_json("/action", {"action": action_idx})
            result = resp.get("result", {})
            action_mask = resp.get("actionMask", [])
            total_env_steps += 1

            if result.get("done"):
                if result.get("accepting"):
                    accepting_episodes += 1
                    accepting_points.append({
                        "episode": ep,
                        "global_timestep": total_env_steps,
                        "episode_steps": result.get("episodeSteps"),
                        "cost": float(result.get("episodeCost")),
                        "duration": float(result.get("episodeDuration")),
                    })
                break

        if ep % 500 == 0:
            print(f"seed={seed} ep={ep}/{episodes} accepting={accepting_episodes} steps={total_env_steps}", flush=True)

    front = pareto_front(accepting_points)
    costs = [p["cost"] for p in front]
    durations = [p["duration"] for p in front]

    return {
        "seed": seed,
        "episodes_sampled": episodes,
        "environment_steps": total_env_steps,
        "accepting_episodes": accepting_episodes,
        "pareto_points": len(front),
        "cost_range": [min(costs), max(costs)] if costs else None,
        "duration_range": [min(durations), max(durations)] if durations else None,
        "front_extremes": {
            "min_cost": min(costs) if costs else None,
            "min_duration": min(durations) if durations else None,
        },
        "pareto_front": [
            {
                "cost": p["cost"],
                "duration": p["duration"],
                "episode": p["episode"],
                "episode_steps": p["episode_steps"],
                "global_timestep": p["global_timestep"],
            }
            for p in front
        ],
    }


def parse_seed_from_name(path):
    stem = path.stem
    marker = "_shield_only_s"
    if marker not in stem:
        return None
    after = stem.split(marker, 1)[1]
    raw_seed = after.split("_", 1)[0]
    try:
        return int(raw_seed)
    except ValueError:
        return None


def load_done_episodes(csv_path):
    episodes = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            if row.get("done", "").strip().lower() in ("true", "1"):
                episodes.append(row)
    return episodes


def summarize_csv(csv_path, seed, last_fraction):
    episodes = load_done_episodes(csv_path)
    n_last = max(1, int(round(len(episodes) * last_fraction)))
    eval_episodes = episodes[-n_last:]

    accepting_points = []
    for row in eval_episodes:
        if row.get("accepting", "").strip().lower() not in ("true", "1"):
            continue
        if row.get("episode_cost", "") == "" or row.get("episode_duration", "") == "":
            continue
        accepting_points.append({
            "episode": int(row["episode"]),
            "global_timestep": int(row["global_timestep"]),
            "episode_steps": int(row["episode_steps"]),
            "cost": float(row["episode_cost"]),
            "duration": float(row["episode_duration"]),
        })

    front = pareto_front(accepting_points)
    costs = [p["cost"] for p in front]
    durations = [p["duration"] for p in front]

    return {
        "seed": seed,
        "source_csv": str(csv_path),
        "total_episodes_in_csv": len(episodes),
        "evaluation_fraction": last_fraction,
        "evaluation_episodes": len(eval_episodes),
        "accepting_episodes": len(accepting_points),
        "pareto_points": len(front),
        "cost_range": [min(costs), max(costs)] if costs else None,
        "duration_range": [min(durations), max(durations)] if durations else None,
        "front_extremes": {
            "min_cost": min(costs) if costs else None,
            "min_duration": min(durations) if durations else None,
        },
        "pareto_front": [
            {
                "cost": p["cost"],
                "duration": p["duration"],
                "episode": p["episode"],
                "episode_steps": p["episode_steps"],
                "global_timestep": p["global_timestep"],
            }
            for p in front
        ],
    }


def build_aggregate(per_seed, seeds, episodes_per_seed, last_fraction, source):
    pareto_counts = [r["pareto_points"] for r in per_seed]
    accepting_counts = [r["accepting_episodes"] for r in per_seed]
    min_cost_values = [r["front_extremes"]["min_cost"] for r in per_seed]
    min_duration_values = [r["front_extremes"]["min_duration"] for r in per_seed]

    return {
        "experiment": "shielding_only_seed_variance",
        "graph": "LoanApp_junior_senior",
        "xml": str(XML_FILE),
        "agent": "random_valid_action",
        "shield": "on",
        "ppo_training": False,
        "max_episode_steps": MAX_EPISODE_STEPS,
        "episodes_per_seed": episodes_per_seed,
        "evaluation_fraction": last_fraction,
        "source": source,
        "pareto_procedure": "Last 20% of completed episodes by default; accepting episodes only; unique (cost, duration); minimise both objectives; dominated points removed. Baseline weight exclusion is not applied because this shield-only baseline is not a weight sweep.",
        "seeds": seeds,
        "per_seed": per_seed,
        "aggregate": {
            "pareto_points": {
                "mean": mean(pareto_counts),
                "std": sample_std(pareto_counts),
            },
            "accepting_episodes": {
                "mean": mean(accepting_counts),
                "std": sample_std(accepting_counts),
            },
        },
        "front_extremes_stable": {
            "min_cost": len(set(min_cost_values)) == 1,
            "min_duration": len(set(min_duration_values)) == 1,
            "both": len(set(min_cost_values)) == 1 and len(set(min_duration_values)) == 1,
            "min_cost_values": min_cost_values,
            "min_duration_values": min_duration_values,
        },
    }


def analyze_csv_dir(csv_dir, seeds, last_fraction):
    per_seed = []
    for seed in seeds:
        matches = sorted(csv_dir.glob(f"train_trace_exp_*shield_only_s{seed}_*.csv"))
        if not matches:
            raise FileNotFoundError(f"No shield-only CSV found for seed {seed} in {csv_dir}")
        csv_path = matches[-1]
        per_seed.append(summarize_csv(csv_path, seed, last_fraction))
    episodes_per_seed = per_seed[0]["total_episodes_in_csv"] if per_seed else None
    return build_aggregate(
        per_seed=per_seed,
        seeds=seeds,
        episodes_per_seed=episodes_per_seed,
        last_fraction=last_fraction,
        source=f"csv_dir:{csv_dir}",
    )


def write_outputs(result, out_json, out_md):
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(result, indent=2) + "\n")

    stats = result["aggregate"]
    stable = result["front_extremes_stable"]
    summary = (
        f"Shielding-only over seeds {result['seeds']} recovered "
        f"{stats['pareto_points']['mean']:.1f} +/- {stats['pareto_points']['std']:.1f} "
        f"Pareto points and {stats['accepting_episodes']['mean']:.1f} +/- "
        f"{stats['accepting_episodes']['std']:.1f} accepting episodes.\n"
        f"Front extremes were {'stable' if stable['both'] else 'not fully stable'} "
        f"across seeds: min cost values {stable['min_cost_values']}, "
        f"min duration values {stable['min_duration_values']}.\n"
    )
    out_md.write_text(summary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=int, default=DEFAULT_EPISODES)
    parser.add_argument("--seeds", default=",".join(str(s) for s in DEFAULT_SEEDS))
    parser.add_argument("--last-fraction", type=float, default=DEFAULT_LAST_FRACTION)
    parser.add_argument(
        "--analyze-csv-dir",
        type=Path,
        help="Summarize existing shield-only train_trace CSVs instead of running the adapter.",
    )
    parser.add_argument(
        "--out-json",
        type=Path,
        default=SCRIPTS_DIR / "logs" / "shielding_seed_variance.json",
    )
    parser.add_argument(
        "--out-md",
        type=Path,
        default=SCRIPTS_DIR / "logs" / "shielding_seed_variance.md",
    )
    args = parser.parse_args()

    seeds = [int(s.strip()) for s in args.seeds.split(",") if s.strip()]

    if args.analyze_csv_dir:
        result = analyze_csv_dir(args.analyze_csv_dir, seeds, args.last_fraction)
        write_outputs(result, args.out_json, args.out_md)
        print(f"Written {args.out_json}")
        print(f"Written {args.out_md}")
        return

    run_log = args.out_json.parent / f"shielding_seed_variance_adapter_{int(time.time())}.log"

    print(f"XML: {XML_FILE}")
    print(f"MAX_EPISODE_STEPS={MAX_EPISODE_STEPS} episodes={args.episodes} seeds={seeds}")
    proc, log_file = start_adapter(run_log)
    try:
        per_seed = []
        for seed in seeds:
            print(f"\n[seed {seed}] starting", flush=True)
            per_seed.append(run_seed(seed, args.episodes))
            print(f"[seed {seed}] done: accepting={per_seed[-1]['accepting_episodes']} pareto={per_seed[-1]['pareto_points']}", flush=True)
    finally:
        stop_adapter(proc, log_file)

    result = build_aggregate(
        per_seed=per_seed,
        seeds=seeds,
        episodes_per_seed=args.episodes,
        last_fraction=1.0,
        source="fresh_adapter_run",
    )

    write_outputs(result, args.out_json, args.out_md)
    print(f"\nWritten {args.out_json}")
    print(f"Written {args.out_md}")


if __name__ == "__main__":
    main()
