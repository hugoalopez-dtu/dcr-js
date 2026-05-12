"""
Pareto front extraction from multi-objective DCR experiment logs.

Reads the train_trace CSVs produced by train_agent.py, collects all
accepting episodes with their (episode_cost, episode_duration), computes
the Pareto front (minimising both), and writes results + plots.

Usage:
    python scripts/pareto_analysis.py [--logs-dir PATH] [--out-dir PATH]
"""

import argparse
import csv
import json
from pathlib import Path
import matplotlib.pyplot as plt


# ---------------------------------------------------------------------------
# Pareto computation
# ---------------------------------------------------------------------------

def dominates(a, b):
    """Return True if point a dominates b (minimisation, both objectives)."""
    return a[0] <= b[0] and a[1] <= b[1] and (a[0] < b[0] or a[1] < b[1])


def compute_pareto_front(points):
    """
    Given a list of dicts with keys 'cost', 'duration' (and any extra metadata),
    return the unique Pareto-optimal points (not dominated by any other).
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
    Return a list of dicts for rows where accepting=True and
    episode_cost/episode_duration are numeric.
    """
    records = []
    for csv_path in sorted(logs_dir.glob("train_trace_*.csv")):
        exp_id = csv_path.stem.replace("train_trace_exp_", "")
        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                accepting = str(row.get("accepting", "")).strip().lower()
                if accepting not in ("true", "1"):
                    continue
                try:
                    cost = float(row["episode_cost"])
                    duration = float(row["episode_duration"])
                except (KeyError, ValueError, TypeError):
                    continue  # skip rows without cost/duration data
                records.append({
                    "exp_id":          exp_id,
                    "episode":         row.get("episode", ""),
                    "global_timestep": row.get("global_timestep", ""),
                    "episode_steps":   row.get("episode_steps", ""),
                    "cost":            cost,
                    "duration":        duration,
                })
    return records


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_results(all_points, front, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)

    # All accepting episodes
    all_csv = out_dir / "pareto_all_accepting.csv"
    with open(all_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["exp_id", "episode", "global_timestep", "episode_steps", "cost", "duration"])
        writer.writeheader()
        writer.writerows(all_points)
    print(f"Written: {all_csv}  ({len(all_points)} accepting episodes)")

    # Pareto front
    front_csv = out_dir / "pareto_front.csv"
    with open(front_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["exp_id", "episode", "global_timestep", "episode_steps", "cost", "duration"])
        writer.writeheader()
        writer.writerows(front)
    print(f"Written: {front_csv}  ({len(front)} Pareto-optimal points)")

    # JSON summary
    summary = {
        "total_accepting_episodes": len(all_points),
        "pareto_front_size": len(front),
        "pareto_front": [{"cost": p["cost"], "duration": p["duration"], "exp_id": p["exp_id"]} for p in front],
    }
    summary_json = out_dir / "pareto_summary.json"
    summary_json.write_text(json.dumps(summary, indent=2))
    print(f"Written: {summary_json}")

    return all_csv, front_csv


def plot_pareto(all_points, front, out_dir: Path):
    if not all_points:
        print("No data to plot.")
        return

    fig, ax = plt.subplots(figsize=(8, 6))

    # All accepting episodes (background)
    ax.scatter(
        [p["cost"] for p in all_points],
        [p["duration"] for p in all_points],
        c="lightblue", alpha=0.5, s=30, label="Accepting episodes",
    )

    if front:
        # Pareto front points
        ax.scatter(
            [p["cost"] for p in front],
            [p["duration"] for p in front],
            c="red", s=80, zorder=5, label="Pareto front",
        )
        # Connect Pareto front with a step line
        front_sorted = sorted(front, key=lambda p: p["cost"])
        ax.step(
            [p["cost"] for p in front_sorted],
            [p["duration"] for p in front_sorted],
            where="post", color="red", linewidth=1.5, alpha=0.7,
        )

    ax.set_xlabel("Total Cost (episode)")
    ax.set_ylabel("Total Duration (episode)")
    ax.set_title("Pareto Front — Cost vs Duration (accepting traces)")
    ax.legend()
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

    front = compute_pareto_front(all_points)
    print(f"Pareto front size: {len(front)}")

    for p in front:
        print(f"  cost={p['cost']:.1f}  duration={p['duration']:.1f}  [{p['exp_id']}]")

    write_results(all_points, front, args.out_dir)
    plot_pareto(all_points, front, args.out_dir)


if __name__ == "__main__":
    main()
