"""
plot_training.py — Custom training visualisation from train_trace CSVs.

Aggregates data at episode level (one point per complete trace) and plots:
  1. Episode reward over episode number — convergence per weight pair
  2. Episode cost over episode number   — cost learning (accepting traces only)
  3. Episode duration over episode number — duration learning (accepting traces only)
  4. Trace length over episode number   — how long each trace is

Each weight pair (α, β) is a distinct color. Smoothing applied for readability.

Usage:
    python scripts/plot_training.py [--logs-dir PATH] [--out-dir PATH] [--smooth N]
"""

import argparse
import csv
import re
from pathlib import Path
from collections import defaultdict

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WEIGHT_COLORS = {
    "α=0.0, β=0.0": "#2196F3",   # blue   — baseline
    "α=1.0, β=0.0": "#4CAF50",   # green  — minimise cost
    "α=0.0, β=1.0": "#F44336",   # red    — minimise duration
    "α=0.5, β=0.5": "#FF9800",   # orange — balanced
    "α=2.0, β=0.5": "#9C27B0",   # purple — cost-heavy
    "α=0.5, β=2.0": "#00BCD4",   # cyan   — duration-heavy
}

DEFAULT_COLOR = "#888888"


def parse_weights(exp_id: str):
    match = re.search(r'_a([\dp]+)_b([\dp]+)', exp_id)
    if match:
        a = float(match.group(1).replace("p", "."))
        b = float(match.group(2).replace("p", "."))
        return a, b
    return None, None


def weight_label(a, b):
    if a is None:
        return "unknown"
    return f"α={a:.1f}, β={b:.1f}"


def smooth(values, window):
    if window <= 1 or len(values) < window:
        return values
    kernel = np.ones(window) / window
    return np.convolve(values, kernel, mode='valid')


def smooth_x(n, window):
    """X indices after convolution shrink by window-1."""
    if window <= 1:
        return list(range(n))
    half = window - 1
    return list(range(half, n))


# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

def load_episodes(logs_dir: Path):
    """
    Returns dict: label → list of episode dicts.
    One dict per complete episode (last step where done=True).
    """
    runs = defaultdict(list)

    for csv_path in sorted(logs_dir.glob("train_trace_*.csv")):
        exp_id = csv_path.stem.replace("train_trace_exp_", "")
        a, b = parse_weights(exp_id)
        label = weight_label(a, b)

        current_ep = {}
        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                current_ep = row
                if str(row.get("done", "")).lower() in ("true", "1"):
                    try:
                        runs[label].append({
                            "episode":          int(row.get("episode", 0)),
                            "ep_rew_sum":       float(row.get("ep_rew_sum", 0)),
                            "episode_steps":    int(row.get("episode_steps", 0)),
                            "episode_cost":     float(row["episode_cost"])     if row.get("episode_cost")     not in ("", None) else None,
                            "episode_duration": float(row["episode_duration"]) if row.get("episode_duration") not in ("", None) else None,
                            "accepting":        str(row.get("accepting", "")).lower() in ("true", "1"),
                        })
                    except (ValueError, KeyError):
                        pass
    return runs


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

def plot_metric(runs, metric, ylabel, title, out_path, smooth_w, accepting_only=False):
    fig, ax = plt.subplots(figsize=(10, 5))

    for label, episodes in sorted(runs.items()):
        if accepting_only:
            eps = [e for e in episodes if e["accepting"] and e.get(metric) is not None]
        else:
            eps = [e for e in episodes if e.get(metric) is not None]

        if not eps:
            continue

        values = [e[metric] for e in eps]
        color = WEIGHT_COLORS.get(label, DEFAULT_COLOR)

        # Raw (faint)
        ax.plot(range(len(values)), values,
                color=color, alpha=0.15, linewidth=0.8)

        # Smoothed
        sv = smooth(values, smooth_w)
        sx = smooth_x(len(values), smooth_w)
        ax.plot(sx, sv, label=label, color=color, linewidth=2)

    ax.set_xlabel("Episode (trace)", fontsize=11)
    ax.set_ylabel(ylabel, fontsize=11)
    ax.set_title(title, fontsize=13)
    ax.legend(title="Weight (α=cost, β=duration)", fontsize=9,
              title_fontsize=9, loc="best", framealpha=0.9)
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"{int(x):,}"))
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Written: {out_path}")


def plot_all(runs, out_dir, smooth_w):
    out_dir.mkdir(parents=True, exist_ok=True)

    plot_metric(runs, "ep_rew_sum", "Episode reward (sum)",
                "Reward convergence per weight pair",
                out_dir / "1_reward_convergence.png", smooth_w)

    plot_metric(runs, "episode_steps", "Trace length (steps)",
                "Trace length per episode",
                out_dir / "2_trace_length.png", smooth_w)

    plot_metric(runs, "episode_cost", "Total cost (episode)",
                "Episode cost — accepting traces only",
                out_dir / "3_episode_cost.png", smooth_w, accepting_only=True)

    plot_metric(runs, "episode_duration", "Total duration (episode)",
                "Episode duration — accepting traces only",
                out_dir / "4_episode_duration.png", smooth_w, accepting_only=True)

    # Combined cost + duration on accepting episodes (2 subplots)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    for label, episodes in sorted(runs.items()):
        eps = [e for e in episodes if e["accepting"]
               and e.get("episode_cost") is not None
               and e.get("episode_duration") is not None]
        if not eps:
            continue
        color = WEIGHT_COLORS.get(label, DEFAULT_COLOR)
        costs = [e["episode_cost"] for e in eps]
        durs  = [e["episode_duration"] for e in eps]

        for ax, vals, lbl in [(ax1, costs, "Cost"), (ax2, durs, "Duration")]:
            ax.plot(range(len(vals)), vals, color=color, alpha=0.15, linewidth=0.8)
            sv = smooth(vals, smooth_w)
            sx = smooth_x(len(vals), smooth_w)
            ax.plot(sx, sv, label=label, color=color, linewidth=2)

    for ax, lbl in [(ax1, "Total cost"), (ax2, "Total duration")]:
        ax.set_xlabel("Accepting episode", fontsize=11)
        ax.set_ylabel(lbl, fontsize=11)
        ax.grid(True, alpha=0.3)
        ax.legend(title="α=cost, β=duration", fontsize=8, title_fontsize=8)

    fig.suptitle("Cost and Duration of accepting traces per weight pair", fontsize=13)
    fig.tight_layout()
    fig.savefig(out_dir / "5_cost_duration_combined.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Written: {out_dir / '5_cost_duration_combined.png'}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-dir", type=Path,
                        default=Path(__file__).resolve().parent / "logs")
    parser.add_argument("--out-dir", type=Path,
                        default=Path(__file__).resolve().parent / "training_plots")
    parser.add_argument("--smooth", type=int, default=50,
                        help="Smoothing window in episodes (default 50)")
    args = parser.parse_args()

    print(f"Loading CSVs from: {args.logs_dir}")
    runs = load_episodes(args.logs_dir)

    if not runs:
        print("No data found. Check --logs-dir path.")
        return

    for label, eps in sorted(runs.items()):
        accepting = sum(1 for e in eps if e["accepting"])
        print(f"  {label}: {len(eps)} episodes, {accepting} accepting")

    plot_all(runs, args.out_dir, args.smooth)
    print(f"\nAll plots saved to: {args.out_dir}")


if __name__ == "__main__":
    main()
