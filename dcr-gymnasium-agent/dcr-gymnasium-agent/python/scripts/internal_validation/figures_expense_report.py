"""
Expense Report figures, rewritten in matplotlib for consistency with the
rest of the thesis pipeline (the originals were built in Plotly inside
scripts/notebooks/analysis_expense_report.ipynb). Same data, same
computations -- only the rendering backend changes.

Produces, matching the filenames already referenced in
Chapter6_Results_REVISED.tex:
  - Expense_Report_reward_convergence.png
  - Expense_Report_illegal_curves_normalisation.png
  - expense_pareto_scatter.png

Usage:
    cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
    python scripts/internal_validation/figures_expense_report.py
"""
import csv
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOGS_DIR = Path("/Users/sofia/Desktop/expense_report_logs")
OUT_DIR = Path(__file__).resolve().parent / "expense_report_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SMOOTH_W = 300

CSP_PARETO = [
    {"cost": 50, "duration": 10500, "trace": "FillOut -> Approve -> PayOut"},
    {"cost": 710, "duration": 2700, "trace": "FillOut -> Withdraw"},
]

COLORS = {
    "a=0.0 b=0.0": "#2196F3", "a=1.0 b=0.0": "#4CAF50",
    "a=0.0 b=1.0": "#F44336", "a=0.5 b=0.5": "#FF9800",
    "a=2.0 b=0.5": "#9C27B0", "a=0.5 b=2.0": "#00BCD4",
}
LABELS_ORDER = ["a=0.0 b=0.0", "a=1.0 b=0.0", "a=0.0 b=1.0",
                "a=0.5 b=0.5", "a=2.0 b=0.5", "a=0.5 b=2.0"]


def parse_weights(exp_id):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", exp_id)
    if m:
        return float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
    return None, None


def wlabel(a, b):
    return f"a={a:.1f} b={b:.1f}" if a is not None else "unknown"


def smooth_stats(v, w):
    v = np.array(v, dtype=float)
    if w <= 1 or len(v) < w:
        return v, np.zeros(len(v))
    cs = np.cumsum(np.insert(v, 0, 0))
    cs2 = np.cumsum(np.insert(v ** 2, 0, 0))
    mean = (cs[w:] - cs[:-w]) / w
    var = np.maximum((cs2[w:] - cs2[:-w]) / w - mean ** 2, 0)
    return mean, np.sqrt(var)


def load_data(logs_dir):
    rows = []
    for p in sorted(logs_dir.glob("train_trace_exp_ExpenseReport_Diaz_*.csv")):
        exp_id = p.stem.replace("train_trace_exp_", "")
        a, b = parse_weights(exp_id)
        label = wlabel(a, b)
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                if str(row.get("done", "")).lower() not in ("true", "1"):
                    continue
                try:
                    rows.append({
                        "label": label, "alpha": a, "beta": b,
                        "episode": int(row.get("episode", 0)),
                        "timestep": int(row.get("global_timestep", 0)),
                        "reward": float(row.get("ep_rew_sum", 0)),
                        "steps": int(row.get("episode_steps", 0)),
                        "illegal_count": int(row.get("illegal_traces_count", 0)),
                        "cost": float(row["episode_cost"]) if row.get("episode_cost") not in ("", "None", None) else None,
                        "duration": float(row["episode_duration"]) if row.get("episode_duration") not in ("", "None", None) else None,
                        "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def plot_reward_convergence(df):
    fig, ax = plt.subplots(figsize=(9, 5))
    for label in LABELS_ORDER:
        grp = df[df["label"] == label].sort_values("timestep")
        if grp.empty:
            continue
        vals = grp["reward"].values
        n = len(vals)
        mean, std = smooth_stats(vals, SMOOTH_W)
        sx = np.linspace((n - len(mean)) / n * 100, 100, len(mean))
        color = COLORS.get(label, "#888")
        ax.fill_between(sx, mean - std, mean + std, color=color, alpha=0.12, linewidth=0)
        ax.plot(sx, mean, color=color, linewidth=2, label=label)
    ax.set_xlabel("Training progress (%)")
    ax.set_ylabel("Episode reward")
    ax.set_title("Reward convergence across weight configurations\nafter reward normalisation")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "Expense_Report_reward_convergence.png", dpi=200)
    plt.close(fig)


def plot_illegal_curves(df):
    fig, ax = plt.subplots(figsize=(9, 5))
    for label in LABELS_ORDER:
        grp = df[df["label"] == label].sort_values("timestep")
        if grp.empty:
            continue
        zero_illegal = (grp["illegal_count"] == 0).astype(float).values
        n = len(zero_illegal)
        mean, std = smooth_stats(zero_illegal, SMOOTH_W)
        mean_pct, std_pct = mean * 100, std * 100
        sx = np.linspace((n - len(mean)) / n * 100, 100, len(mean))
        color = COLORS.get(label, "#888")
        upper = np.minimum(mean_pct + std_pct, 100)
        lower = np.maximum(mean_pct - std_pct, 0)
        ax.fill_between(sx, lower, upper, color=color, alpha=0.12, linewidth=0)
        ax.plot(sx, mean_pct, color=color, linewidth=2, label=label)
    ax.axhline(100, color="green", linestyle=":", linewidth=1)
    ax.annotate("100% target", xy=(98, 100), xytext=(98, 101.5), fontsize=8, color="green", ha="right")
    ax.set_xlabel("Training progress (%)")
    ax.set_ylabel("% episodes with zero illegal actions")
    ax.set_ylim(0, 106)
    ax.set_title("Evolution of the illegal-action ratio during training\nafter reward normalisation, across all weight configurations")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=9, loc="lower right")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "Expense_Report_illegal_curves_normalisation.png", dpi=200)
    plt.close(fig)


def dominates(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and (a[0] < b[0] or a[1] < b[1])


def pareto_front(points):
    seen, unique = {}, []
    for p in points:
        k = (round(p["cost"], 1), round(p["duration"], 1))
        if k not in seen:
            seen[k] = p
            unique.append(p)
    front = [c for c in unique if not any(
        dominates((p["cost"], p["duration"]), (c["cost"], c["duration"]))
        for p in unique if p is not c)]
    return sorted(front, key=lambda x: x["cost"])


def plot_pareto_scatter(df):
    acc = df[df["accepting"] & df["cost"].notna() & df["duration"].notna()]
    acc_nb = acc[~((acc["alpha"] == 0.0) & (acc["beta"] == 0.0))]
    points = acc_nb[["label", "cost", "duration"]].to_dict("records")
    rl_front = pareto_front(points)

    fig, ax = plt.subplots(figsize=(8, 6))
    for label in LABELS_ORDER:
        grp = acc[acc["label"] == label]
        if grp.empty:
            continue
        ax.scatter(grp["cost"], grp["duration"], color=COLORS.get(label, "#888"),
                   s=14, alpha=0.2, label=label)

    ax.scatter([p["cost"] for p in CSP_PARETO], [p["duration"] for p in CSP_PARETO],
               color="red", s=260, marker="D", edgecolors="darkred", linewidths=1.5,
               label="CSP+COP (exact)", zorder=4)
    if rl_front:
        ax.scatter([p["cost"] for p in rl_front], [p["duration"] for p in rl_front],
                   color="black", s=180, marker="*", label="RL Pareto (PPO)", zorder=5)

    ax.set_xlabel("Total cost (EUR)")
    ax.set_ylabel("Total duration (min)")
    ax.set_title("Cost-duration distribution of accepting episodes\nafter reward normalisation, across all weight configurations")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "expense_pareto_scatter.png", dpi=200)
    plt.close(fig)
    print(f"RL Pareto points found: {len(rl_front)} | CSP+COP points: {len(CSP_PARETO)}")


def main():
    df = load_data(LOGS_DIR)
    if df.empty:
        print(f"No CSVs found in {LOGS_DIR}")
        return
    print(f"{len(df):,} episodes, {df['label'].nunique()} weight pairs")
    plot_reward_convergence(df)
    plot_illegal_curves(df)
    plot_pareto_scatter(df)
    print(f"Wrote figures to {OUT_DIR}")


if __name__ == "__main__":
    main()
