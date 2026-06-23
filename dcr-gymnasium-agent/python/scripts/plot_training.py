"""
plot_training.py — Interactive training visualisation from train_trace CSVs.

Generates interactive HTML plots (Plotly) with hover, zoom and pan.
Also generates static PNGs as fallback.

Plots:
  1. Reward convergence per weight pair
  2. Trace length per episode
  3. Episode cost (accepting traces only)
  4. Episode duration (accepting traces only)
  5. Cost + Duration combined (2 subplots)

Usage:
    python scripts/plot_training.py [--logs-dir PATH] [--out-dir PATH] [--smooth N]
"""

import argparse
import csv
import re
from pathlib import Path
from collections import defaultdict

import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WEIGHT_COLORS = {
    "α=0.0, β=0.0": "#2196F3",
    "α=1.0, β=0.0": "#4CAF50",
    "α=0.0, β=1.0": "#F44336",
    "α=0.5, β=0.5": "#FF9800",
    "α=2.0, β=0.5": "#9C27B0",
    "α=0.5, β=2.0": "#00BCD4",
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
        return np.array(values)
    kernel = np.ones(window) / window
    return np.convolve(values, kernel, mode='valid')


def smooth_x(n, window):
    if window <= 1:
        return list(range(n))
    return list(range(window - 1, n))


# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

def load_episodes(logs_dir: Path):
    runs = defaultdict(list)
    for csv_path in sorted(logs_dir.glob("train_trace_*.csv")):
        exp_id = csv_path.stem.replace("train_trace_exp_", "")
        a, b = parse_weights(exp_id)
        label = weight_label(a, b)

        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if str(row.get("done", "")).lower() not in ("true", "1"):
                    continue
                try:
                    runs[label].append({
                        "episode":          int(row.get("episode", 0)),
                        "ep_rew_sum":       float(row.get("ep_rew_sum", 0)),
                        "episode_steps":    int(row.get("episode_steps", 0)),
                        "episode_cost":     float(row["episode_cost"])     if row.get("episode_cost")     not in ("", None) else None,
                        "episode_duration": float(row["episode_duration"]) if row.get("episode_duration") not in ("", None) else None,
                        "accepting":        str(row.get("accepting", "")).lower() in ("true", "1"),
                        "global_timestep":  int(row.get("global_timestep", 0)),
                    })
                except (ValueError, KeyError):
                    pass
    return runs


# ---------------------------------------------------------------------------
# Plotly helpers
# ---------------------------------------------------------------------------

def make_traces(runs, metric, smooth_w, accepting_only=False):
    traces = []
    for label, episodes in sorted(runs.items()):
        eps = [e for e in episodes
               if e.get(metric) is not None
               and (not accepting_only or e["accepting"])]
        if not eps:
            continue

        values = [e[metric] for e in eps]
        x_all  = list(range(len(values)))
        color  = WEIGHT_COLORS.get(label, DEFAULT_COLOR)

        # Raw (faint)
        traces.append(go.Scatter(
            x=x_all, y=values,
            mode="lines",
            line=dict(color=color, width=1),
            opacity=0.15,
            showlegend=False,
            hoverinfo="skip",
        ))

        # Smoothed
        sv = smooth(values, smooth_w)
        sx = smooth_x(len(values), smooth_w)
        hover = [
            f"<b>{label}</b><br>Episode: {sx[i]:,}<br>{metric}: {sv[i]:.2f}"
            for i in range(len(sv))
        ]
        traces.append(go.Scatter(
            x=sx, y=sv,
            mode="lines",
            name=label,
            line=dict(color=color, width=2.5),
            hovertemplate="%{customdata}<extra></extra>",
            customdata=hover,
        ))
    return traces


def save_html(fig, path: Path):
    fig.write_html(str(path), include_plotlyjs="cdn")
    print(f"Written: {path}")


def layout(title, xlab="Episode (trace)", ylab=""):
    return dict(
        title=dict(text=title, font=dict(size=16)),
        xaxis=dict(title=xlab, showgrid=True, gridcolor="#eee"),
        yaxis=dict(title=ylab, showgrid=True, gridcolor="#eee"),
        legend=dict(title="Weight (α=cost, β=duration)", bgcolor="rgba(255,255,255,0.9)"),
        plot_bgcolor="white",
        hovermode="closest",
        height=520,
    )


# ---------------------------------------------------------------------------
# Individual plots
# ---------------------------------------------------------------------------

def plot_reward(runs, out_dir, smooth_w):
    fig = go.Figure(make_traces(runs, "ep_rew_sum", smooth_w))
    fig.update_layout(**layout(
        "Reward convergence per weight pair",
        ylab="Episode reward (sum)",
    ))
    save_html(fig, out_dir / "1_reward_convergence.html")


def plot_length(runs, out_dir, smooth_w):
    fig = go.Figure(make_traces(runs, "episode_steps", smooth_w))
    fig.update_layout(**layout(
        "Trace length per episode",
        ylab="Steps per episode",
    ))
    save_html(fig, out_dir / "2_trace_length.html")


def plot_cost(runs, out_dir, smooth_w):
    fig = go.Figure(make_traces(runs, "episode_cost", smooth_w, accepting_only=True))
    fig.update_layout(**layout(
        "Episode cost — accepting traces only",
        ylab="Total cost",
    ))
    save_html(fig, out_dir / "3_episode_cost.html")


def plot_duration(runs, out_dir, smooth_w):
    fig = go.Figure(make_traces(runs, "episode_duration", smooth_w, accepting_only=True))
    fig.update_layout(**layout(
        "Episode duration — accepting traces only",
        ylab="Total duration",
    ))
    save_html(fig, out_dir / "4_episode_duration.html")


def plot_cost_duration_combined(runs, out_dir, smooth_w):
    fig = make_subplots(rows=1, cols=2,
                        subplot_titles=("Total Cost (accepting)", "Total Duration (accepting)"))

    shown = set()
    for label, episodes in sorted(runs.items()):
        eps = [e for e in episodes
               if e["accepting"]
               and e.get("episode_cost") is not None
               and e.get("episode_duration") is not None]
        if not eps:
            continue
        color = WEIGHT_COLORS.get(label, DEFAULT_COLOR)

        for col, metric in [(1, "episode_cost"), (2, "episode_duration")]:
            values = [e[metric] for e in eps]
            x_all  = list(range(len(values)))

            fig.add_trace(go.Scatter(
                x=x_all, y=values, mode="lines",
                line=dict(color=color, width=1), opacity=0.15,
                showlegend=False, hoverinfo="skip",
            ), row=1, col=col)

            sv = smooth(values, smooth_w)
            sx = smooth_x(len(values), smooth_w)
            show = label not in shown
            shown.add(label)

            hover = [f"<b>{label}</b><br>Episode: {sx[i]:,}<br>Value: {sv[i]:.1f}"
                     for i in range(len(sv))]
            fig.add_trace(go.Scatter(
                x=sx, y=sv, mode="lines", name=label,
                line=dict(color=color, width=2.5),
                showlegend=show,
                hovertemplate="%{customdata}<extra></extra>",
                customdata=hover,
            ), row=1, col=col)

    fig.update_layout(
        title=dict(text="Cost and Duration of accepting traces per weight pair", font=dict(size=16)),
        legend=dict(title="α=cost, β=duration", bgcolor="rgba(255,255,255,0.9)"),
        plot_bgcolor="white",
        hovermode="closest",
        height=500,
    )
    save_html(fig, out_dir / "5_cost_duration_combined.html")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-dir", type=Path,
                        default=Path(__file__).resolve().parent / "logs")
    parser.add_argument("--out-dir", type=Path,
                        default=Path(__file__).resolve().parent / "training_plots")
    parser.add_argument("--smooth", type=int, default=50)
    args = parser.parse_args()

    print(f"Loading CSVs from: {args.logs_dir}")
    runs = load_episodes(args.logs_dir)

    if not runs:
        print("No data found. Check --logs-dir path.")
        return

    for label, eps in sorted(runs.items()):
        accepting = sum(1 for e in eps if e["accepting"])
        print(f"  {label}: {len(eps)} episodes, {accepting} accepting")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    plot_reward(runs, args.out_dir, args.smooth)
    plot_length(runs, args.out_dir, args.smooth)
    plot_cost(runs, args.out_dir, args.smooth)
    plot_duration(runs, args.out_dir, args.smooth)
    plot_cost_duration_combined(runs, args.out_dir, args.smooth)

    print(f"\nAll plots saved to: {args.out_dir}")


if __name__ == "__main__":
    main()
