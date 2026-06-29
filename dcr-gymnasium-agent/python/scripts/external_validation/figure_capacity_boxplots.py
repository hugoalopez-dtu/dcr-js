"""
Cost/duration distribution boxplots for the capacity-constrained Loan
Application experiment, one panel per Expert budget k in {1, 2, 3},
grouped by scalarisation weight pair. Same computation as
internal_validation/figures_loanapp_roles.py's plot_boxplots, applied to
the capacity-constrained logs instead of the unlimited-capacity ones, to
show how the cost-duration trade-off compresses under scarcity.

Produces:
  - loanapp_capacity_cost_boxplot.png
  - loanapp_capacity_dur_boxplot.png

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/figure_capacity_boxplots.py
"""
import csv
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOGS_DIR = Path(__file__).resolve().parent / "loanapp_roles_capacity"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

COLORS = {
    "a=0.0 b=0.0": "#2196F3", "a=1.0 b=0.0": "#4CAF50",
    "a=0.0 b=1.0": "#F44336", "a=0.5 b=0.5": "#FF9800",
    "a=2.0 b=0.5": "#9C27B0", "a=0.5 b=2.0": "#00BCD4",
}
LABELS_ORDER = ["a=0.0 b=0.0", "a=1.0 b=0.0", "a=0.0 b=1.0",
                "a=0.5 b=0.5", "a=2.0 b=0.5", "a=0.5 b=2.0"]
BUDGETS = [1, 2, 3]


def parse_weights_and_k(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)(?:_k(\d+))?_", stem)
    if not m:
        return None, None, None
    a = float(m.group(1).replace("p", "."))
    b = float(m.group(2).replace("p", "."))
    k = int(m.group(3)) if m.group(3) else None
    return a, b, k


def wlabel(a, b):
    return f"a={a:.1f} b={b:.1f}"


def load_data(logs_dir):
    rows = []
    for p in sorted(logs_dir.glob("train_trace_exp_LoanApp_roles_*.csv")):
        a, b, k = parse_weights_and_k(p.stem)
        if a is None or k is None:
            continue
        label = wlabel(a, b)
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                if str(row.get("done", "")).lower() not in ("true", "1"):
                    continue
                try:
                    rows.append({
                        "label": label, "alpha": a, "beta": b, "k": k,
                        "episode": int(row.get("episode", 0)),
                        "timestep": int(row.get("global_timestep", 0)),
                        "cost": float(row["episode_cost"]) if row.get("episode_cost") not in ("", "None", None) else None,
                        "duration": float(row["episode_duration"]) if row.get("episode_duration") not in ("", "None", None) else None,
                        "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def tail_20pct(grp):
    return grp.sort_values("timestep").iloc[int(len(grp) * 0.8):]


def plot_capacity_boxplots(df):
    acc = df[df["accepting"] & df["cost"].notna() & df["duration"].notna()]
    acc_tail = acc.groupby(["k", "label"], group_keys=False).apply(tail_20pct)

    for metric, fname, title in [
        ("cost", "loanapp_capacity_cost_boxplot.png", "Distribution of total cost across accepting traces"),
        ("duration", "loanapp_capacity_dur_boxplot.png", "Distribution of total duration across accepting traces"),
    ]:
        both_values = acc_tail[metric]
        global_min, global_max = np.percentile(both_values, 1), np.percentile(both_values, 99)
        margin = (global_max - global_min) * 0.05
        yrange = (global_min - margin, global_max + margin)

        fig, axes = plt.subplots(1, len(BUDGETS), figsize=(13, 5), sharey=True)
        for ax, k in zip(axes, BUDGETS):
            sub = acc_tail[acc_tail["k"] == k]
            data, labels, colors = [], [], []
            for label in LABELS_ORDER:
                grp = sub[sub["label"] == label]
                if grp.empty:
                    continue
                data.append(grp[metric].values)
                labels.append(label)
                colors.append(COLORS.get(label, "#888"))
            bp = ax.boxplot(data, labels=labels, patch_artist=True, showmeans=True)
            for patch, color in zip(bp["boxes"], colors):
                patch.set_facecolor(color)
                patch.set_alpha(0.5)
            ax.set_title(f"$k={k}$")
            ax.tick_params(axis="x", rotation=45, labelsize=8)
            ax.grid(True, axis="y", color="#eee")
        axes[0].set_ylabel("Value")
        axes[0].set_ylim(*yrange)
        fig.suptitle(f"{title}\n(final 20% of training, grouped by scalarisation weight pair, per Expert budget $k$)")
        fig.tight_layout()
        fig.savefig(OUT_DIR / fname, dpi=200)
        plt.close(fig)
        print(f"Wrote {OUT_DIR / fname}")


def main():
    df = load_data(LOGS_DIR)
    if df.empty:
        print(f"No CSVs found in {LOGS_DIR}")
        return
    print(f"{len(df):,} episodes, k values: {sorted(df['k'].unique())}")
    plot_capacity_boxplots(df)


if __name__ == "__main__":
    main()
