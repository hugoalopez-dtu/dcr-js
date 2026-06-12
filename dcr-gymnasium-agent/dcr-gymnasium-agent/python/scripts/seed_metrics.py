"""
Shared helpers for tab:seed_variance (sec:policy_generalisation, seed robustness).

Extracts per-episode summaries from a train_trace_exp_*.csv produced by
StepDebugCallback in train_agent.py (one row per training step; the row with
done=True carries the episode's final illegal_traces_ratio / episode_cost /
episode_duration / accepting).
"""
import csv
from pathlib import Path


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
    for c in unique:
        if not any(dominates((p["cost"], p["duration"]), (c["cost"], c["duration"])) for p in unique if p is not c):
            front.append(c)
    return sorted(front, key=lambda p: p["cost"])


def load_episodes(train_trace_csv: Path):
    """Return one dict per episode (the done=True row), in episode order."""
    episodes = []
    with open(train_trace_csv, newline="") as f:
        for row in csv.DictReader(f):
            if row["done"].strip().lower() == "true":
                episodes.append(row)
    return episodes


def last_fraction(episodes, frac):
    n = len(episodes)
    k = max(1, int(round(n * frac)))
    return episodes[-k:]


def summarize_run(train_trace_csv: Path):
    """
    Returns:
      final_illegal_rate: mean illegal_traces_ratio over the last decile of episodes
      accepting_last20: list of {"cost", "duration"} for accepting episodes in the last 20%
      mean_cost_last20: mean episode_cost over accepting_last20 (None if empty)
      mean_duration_last20: mean episode_duration over accepting_last20 (None if empty)
      n_episodes: total episode count
    """
    episodes = load_episodes(train_trace_csv)
    n = len(episodes)

    last_decile = last_fraction(episodes, 0.10)
    final_illegal_rate = sum(float(e["illegal_traces_ratio"]) for e in last_decile) / len(last_decile)

    last20 = last_fraction(episodes, 0.20)
    accepting = [e for e in last20 if e["accepting"].strip().lower() in ("true", "1")]
    points = [
        {"cost": float(e["episode_cost"]), "duration": float(e["episode_duration"])}
        for e in accepting
        if e["episode_cost"] != "" and e["episode_duration"] != ""
    ]

    mean_cost = sum(p["cost"] for p in points) / len(points) if points else None
    mean_duration = sum(p["duration"] for p in points) / len(points) if points else None

    return {
        "n_episodes": n,
        "final_illegal_rate": final_illegal_rate,
        "accepting_last20_points": points,
        "mean_cost_last20": mean_cost,
        "mean_duration_last20": mean_duration,
    }
