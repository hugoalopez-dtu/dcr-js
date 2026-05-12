"""
Pareto front extraction from multi-objective DCR experiment logs.

Reads the train_trace CSVs produced by train_agent.py, collects all
accepting episodes with their (episode_cost, episode_duration), computes
the Pareto front (minimising both), and writes results + plots.

Each CSV is expected to come from a run with a specific (alpha, beta) weight
pair encoded in the filename as _a{alpha}_b{beta}_ (dots replaced by p).

Usage:
    python scripts/pareto_analysis.py [--logs-dir PATH] [--out-dir PATH]
"""

import argparse
import csv
import json
import re
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np


# ---------------------------------------------------------------------------
# Weight parsing
# ---------------------------------------------------------------------------

# Distinct colors for up to 8 weight combinations
WEIGHT_COLORS = [
    "#4C72B0",  # blue
    "#DD8452",  # orange
    "#55A868",  # green
    "#C44E52",  # red
    "#8172B3",  # purple
    "#937860",  # brown
    "#DA8BC3",  # pink
    "#8C8C8C",  # grey
]

def parse_weights_from_exp_id(exp_id: str):
    """Extract (alpha, beta) from exp_id like 'Exp_s1_a1p0_b0p5_...'."""
    match = re.search(r'_a([\dp]+)_b([\dp]+)', exp_id)
    if match:
        alpha = float(match.group(1).replace("p", "."))
        beta  = float(match.group(2).replace("p", "."))
        return alpha, beta
    return None, None


def weight_label(alpha, beta):
    if alpha is None:
        return "unknown"
    return f"α={alpha:.1f}, β={beta:.1f}"


# ---------------------------------------------------------------------------
# Pareto computation
# ---------------------------------------------------------------------------

def dominates(a, b):
    """Return True if point a dominates b (minimisation, both objectives)."""
    return a[0] <= b[0] and a[1] <= b[1] and (a[0] < b[0] or a[1] < b[1])


def compute_pareto_front(points):
    """
    Return the unique Pareto-optimal points across all runs.
    Keeps the earliest occurrence of each unique (cost, duration) pair.
    """
    seen = {}
    for p in points:
        key = (p["cost"], p["duration"])
        if key not in seen:
            seen[key] = p
    unique = list(seen.values())

    front = []
    for candidate in unique:
        dominated = any(
            dominates((p["cost"], p["duration"]), (candidate["cost"], candidate["duration"]))
            for p in unique
            if p is not candidate
        )
        if not dominated:
            front.append(candidate)
    return sorted(front, key=lambda p: p["cost"])


# ---------------------------------------------------------------------------
# CSV parsing
# ---------------------------------------------------------------------------

def load_accepting_episodes(logs_dir: Path):
    """
    Scan all train_trace_*.csv files in logs_dir.
    Returns a list of episode dicts, each tagged with its (alpha, beta) pair.
    """
    records = []
    for csv_path in sorted(logs_dir.glob("train_trace_*.csv")):
        exp_id = csv_path.stem.replace("train_trace_exp_", "")
        alpha, beta = parse_weights_from_exp_id(exp_id)
        label = weight_label(alpha, beta)

        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                accepting = str(row.get("accepting", "")).strip().lower()
                if accepting not in ("true", "1"):
                    continue
                try:
                    cost     = float(row["episode_cost"])
                    duration = float(row["episode_duration"])
                except (KeyError, ValueError, TypeError):
                    continue
                records.append({
                    "exp_id":          exp_id,
                    "episode":         row.get("episode", ""),
                    "global_timestep": row.get("global_timestep", ""),
                    "episode_steps":   row.get("episode_steps", ""),
                    "cost":            cost,
                    "duration":        duration,
                    "alpha":           alpha,
                    "beta":            beta,
                    "weight_label":    label,
                })
    return records


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_results(all_points, front, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)

    fields = ["exp_id", "episode", "global_timestep", "episode_steps",
              "cost", "duration", "alpha", "beta", "weight_label"]

    all_csv = out_dir / "pareto_all_accepting.csv"
    with open(all_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_points)
    print(f"Written: {all_csv}  ({len(all_points)} accepting episodes)")

    front_csv = out_dir / "pareto_front.csv"
    with open(front_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(front)
    print(f"Written: {front_csv}  ({len(front)} Pareto-optimal points)")

    summary = {
        "total_accepting_episodes": len(all_points),
        "pareto_front_size":        len(front),
        "pareto_front": [
            {"cost": p["cost"], "duration": p["duration"],
             "alpha": p["alpha"], "beta": p["beta"], "exp_id": p["exp_id"]}
            for p in front
        ],
    }
    summary_json = out_dir / "pareto_summary.json"
    summary_json.write_text(json.dumps(summary, indent=2))
    print(f"Written: {summary_json}")


def plot_pareto(all_points, front, out_dir: Path):
    if not all_points:
        print("No data to plot.")
        return

    # --- Assign a color to each unique weight combination ---
    unique_labels = sorted(set(p["weight_label"] for p in all_points))
    color_map = {label: WEIGHT_COLORS[i % len(WEIGHT_COLORS)]
                 for i, label in enumerate(unique_labels)}

    fig, ax = plt.subplots(figsize=(9, 6))

    # --- Background: all accepting episodes, colored by (α, β) run ---
    for label in unique_labels:
        pts = [p for p in all_points if p["weight_label"] == label]
        ax.scatter(
            [p["cost"] for p in pts],
            [p["duration"] for p in pts],
            c=color_map[label],
            alpha=0.25,
            s=20,
            label=label,
            zorder=2,
        )

    # --- Pareto front ---
    if front:
        front_sorted = sorted(front, key=lambda p: p["cost"])
        ax.scatter(
            [p["cost"] for p in front_sorted],
            [p["duration"] for p in front_sorted],
            c="black", s=100, zorder=5, label="Pareto front", marker="*",
        )
        # Step line connecting Pareto points
        xs = [p["cost"] for p in front_sorted]
        ys = [p["duration"] for p in front_sorted]
        ax.step(xs, ys, where="post", color="black", linewidth=1.5, alpha=0.6)

    ax.set_xlabel("Total Cost (episode)", fontsize=12)
    ax.set_ylabel("Total Duration (episode)", fontsize=12)
    ax.set_title("Pareto Front — Cost vs Duration\n(coloured by weight pair α, β)", fontsize=13)
    ax.legend(title="Weight (α=cost, β=duration)", fontsize=9, title_fontsize=9,
              loc="upper right", framealpha=0.9)
    ax.grid(True, alpha=0.3)

    plot_path = out_dir / "pareto_front.png"
    fig.savefig(plot_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Written: {plot_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Extract Pareto front from DCR experiment logs")
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "logs",
        help="Directory containing train_trace_*.csv files",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "pareto_results",
        help="Output directory for Pareto results and plots",
    )
    args = parser.parse_args()

    print(f"Scanning logs in: {args.logs_dir}")
    all_points = load_accepting_episodes(args.logs_dir)

    if not all_points:
        print("No accepting episodes with cost/duration data found.")
        print("Make sure events in the DCR graph have cost/duration set and experiments have run.")
        return

    print(f"Found {len(all_points)} accepting episodes with cost+duration data.")

    # Show breakdown by weight pair
    from collections import Counter
    counts = Counter(p["weight_label"] for p in all_points)
    for label, n in sorted(counts.items()):
        print(f"  {label}: {n} episodes")

    front = compute_pareto_front(all_points)
    print(f"\nPareto front ({len(front)} unique points):")
    for p in front:
        print(f"  cost={p['cost']:.1f}  duration={p['duration']:.1f}  [{p['weight_label']}]")

    write_results(all_points, front, args.out_dir)
    plot_pareto(all_points, front, args.out_dir)


if __name__ == "__main__":
    main()
