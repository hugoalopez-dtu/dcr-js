"""
Loan Application (role-conditioned) figures, rewritten in matplotlib for
consistency with the rest of the thesis pipeline (the originals were built
in Plotly inside scripts/notebooks/analysis_loanapp_roles.ipynb). Same data,
same computations -- only the rendering backend changes.

Produces:
  - LoanApp_pareto_balanced.png        (referenced in Chapter6)
  - loanapp_cost_boxplot.png           (referenced in Chapter6)
  - loanapp_dur_boxplot.png            (referenced in Chapter6)
  - LoanApp_reward_convergence.png     (Appendix, fig:app_loanapp_reward)
  - LoanApp_accept_rate.png            (Appendix, fig:app_loanapp_accept)
  - LoanApp_shielding_activity.png     (Appendix, fig:app_loanapp_shielding)
  - LoanApp_clean_episodes.png         (Appendix, fig:app_loanapp_clean)

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/internal_validation/figures_loanapp_roles.py
"""
import csv
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOGS_DIR = Path("/Users/sofia/Desktop/loanapp_roles_logs")
OUT_DIR = Path(__file__).resolve().parent / "loanapp_roles_figures"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SMOOTH_W = 200

COLORS = {
    "a=0.0 b=0.0": "#2196F3", "a=1.0 b=0.0": "#4CAF50",
    "a=0.0 b=1.0": "#F44336", "a=0.5 b=0.5": "#FF9800",
    "a=2.0 b=0.5": "#9C27B0", "a=0.5 b=2.0": "#00BCD4",
}
LABELS_ORDER = ["a=0.0 b=0.0", "a=1.0 b=0.0", "a=0.0 b=1.0",
                "a=0.5 b=0.5", "a=2.0 b=0.5", "a=0.5 b=2.0"]


def parse_weights(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", stem)
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
    for p in sorted(logs_dir.glob("train_trace_exp_LoanApp_roles_*.csv")):
        a, b = parse_weights(p.stem)
        if a is None:
            continue
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
                        "cost": float(row["episode_cost"]) if row.get("episode_cost") not in ("", "None", None) else None,
                        "duration": float(row["episode_duration"]) if row.get("episode_duration") not in ("", "None", None) else None,
                        "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                        "illegal": int(row.get("illegal_traces_count", 0)),
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


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


def tail_20pct(grp):
    return grp.iloc[int(len(grp) * 0.8):]


def plot_pareto_balanced(df):
    acc = df[df["accepting"] & df["cost"].notna() & df["duration"].notna()]
    acc_nb = acc[~((acc["alpha"] == 0.0) & (acc["beta"] == 0.0))]
    tail_acc = acc_nb.groupby("label", group_keys=False).apply(tail_20pct)
    points = tail_acc[["label", "cost", "duration"]].to_dict("records")
    rl_front = pareto_front(points)
    if not rl_front:
        print("No Pareto front found for LoanApp roles.")
        return

    costs = np.array([p["cost"] for p in rl_front])
    durs = np.array([p["duration"] for p in rl_front])
    c_min, c_max = costs.min(), costs.max()
    d_min, d_max = durs.min(), durs.max()
    c_norm = (costs - c_min) / (c_max - c_min) if c_max > c_min else np.zeros_like(costs)
    d_norm = (durs - d_min) / (d_max - d_min) if d_max > d_min else np.zeros_like(durs)
    distances = np.sqrt(c_norm ** 2 + d_norm ** 2)
    idx_bal = int(np.argmin(distances))
    balanced = rl_front[idx_bal]

    fig, ax = plt.subplots(figsize=(9, 7))
    for label in LABELS_ORDER:
        grp = acc[acc["label"] == label]
        if grp.empty:
            continue
        tail = tail_20pct(grp)
        ax.scatter(tail["cost"], tail["duration"], color=COLORS.get(label, "#888"),
                   s=14, alpha=0.25, label=label)

    fx = [p["cost"] for p in rl_front]
    fy = [p["duration"] for p in rl_front]
    ax.plot(fx, fy, color="black", linestyle=":", linewidth=1.2, zorder=4)
    ax.scatter(fx, fy, color="black", s=140, marker="*", zorder=5, label="Pareto front (PPO)")
    ax.scatter([balanced["cost"]], [balanced["duration"]], color="#FF6F00", s=220,
               marker="D", edgecolors="black", linewidths=1.2, zorder=6, label="Most balanced")

    ax.set_xlabel("Total cost")
    ax.set_ylabel("Total duration")
    ax.set_title("Pareto front recovered by the full PPO+DCR framework\n"
                  "on the role-conditioned Loan Application benchmark")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=8, loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_pareto_balanced.png", dpi=200)
    ax.set_xlim(0, 4000)
    ax.set_ylim(0, 1800)
    ax.set_title("Pareto front recovered by the full PPO+DCR framework\n"
                  "on the role-conditioned Loan Application benchmark (zoom)")
    fig.savefig(OUT_DIR / "LoanApp_pareto_balanced_zoom.png", dpi=200)
    plt.close(fig)
    print(f"Pareto front: {len(rl_front)} points, cost {min(fx):.0f}-{max(fx):.0f}, "
          f"duration {min(fy):.0f}-{max(fy):.0f}; balanced=({balanced['cost']:.0f},{balanced['duration']:.0f})")


def plot_boxplots(df):
    acc_tail = df[df["accepting"] & df["cost"].notna() & df["duration"].notna()]
    acc_tail = acc_tail.groupby("label", group_keys=False).apply(tail_20pct)
    both_values = pd.concat([acc_tail["cost"], acc_tail["duration"]])
    global_min = np.percentile(both_values, 1)
    global_max = np.percentile(both_values, 99)
    margin = (global_max - global_min) * 0.05
    yrange = (global_min - margin, global_max + margin)

    for metric, fname, title in [
        ("cost", "loanapp_cost_boxplot.png", "Distribution of total cost across accepting traces"),
        ("duration", "loanapp_dur_boxplot.png", "Distribution of total duration across accepting traces"),
    ]:
        fig, ax = plt.subplots(figsize=(9, 5))
        data, labels, colors = [], [], []
        for label in LABELS_ORDER:
            grp = acc_tail[acc_tail["label"] == label]
            if grp.empty:
                continue
            data.append(grp[metric].values)
            labels.append(label)
            colors.append(COLORS.get(label, "#888"))
        bp = ax.boxplot(data, labels=labels, patch_artist=True, showmeans=True)
        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.5)
        ax.set_ylim(*yrange)
        ax.set_ylabel("Value")
        ax.set_title(f"{title}\n(final 20% of training, grouped by scalarisation weight pair)")
        ax.grid(True, axis="y", color="#eee")
        fig.tight_layout()
        fig.savefig(OUT_DIR / fname, dpi=200)
        plt.close(fig)


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
    ax.set_title("Reward convergence on the role-conditioned Loan Application\nbenchmark across scalarisation weight pairs")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_reward_convergence.png", dpi=200)
    plt.close(fig)


def plot_accept_and_shielding(df):
    fig, ax = plt.subplots(figsize=(9, 5))
    for label in LABELS_ORDER:
        grp = df[df["label"] == label].sort_values("timestep").copy()
        if grp.empty:
            continue
        rate = (grp["illegal"] / grp["steps"].replace(0, np.nan) * 100).fillna(0).values
        n = len(rate)
        mean, std = smooth_stats(rate, SMOOTH_W)
        sx = np.linspace((n - len(mean)) / n * 100, 100, len(mean))
        color = COLORS.get(label, "#888")
        ax.fill_between(sx, mean - std, mean + std, color=color, alpha=0.10, linewidth=0)
        ax.plot(sx, mean, color=color, linewidth=2, label=label)
    ax.set_xlabel("Training progress (%)")
    ax.set_ylabel("Illegal attempt rate (%)")
    ax.set_ylim(bottom=0)
    ax.set_title("Shielding activity over training, measured as the percentage\nof steps that were illegal action attempts")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_shielding_activity.png", dpi=200)
    plt.close(fig)

    fig2, ax2 = plt.subplots(figsize=(9, 4.2))
    for label in LABELS_ORDER:
        grp = df[df["label"] == label].sort_values("timestep").copy()
        if grp.empty:
            continue
        acc = grp["accepting"].astype(float).values * 100
        n = len(acc)
        mean, _ = smooth_stats(acc, SMOOTH_W)
        sx = np.linspace((n - len(mean)) / n * 100, 100, len(mean))
        ax2.plot(sx, mean, color=COLORS.get(label, "#888"), linewidth=2, label=label)
    ax2.axhline(100, color="#2E7D32", linestyle=":", linewidth=1)
    ax2.annotate("100% acceptance", xy=(2, 100), xytext=(2, 101.5), fontsize=8, color="#2E7D32")
    ax2.set_xlabel("Training progress (%)")
    ax2.set_ylabel("Accept rate (%)")
    ax2.set_ylim(0, 106)
    ax2.set_title("Accept rate over training on the role-conditioned\nLoan Application benchmark")
    ax2.grid(True, color="#eee")
    ax2.legend(fontsize=9, loc="lower right")
    fig2.tight_layout()
    fig2.savefig(OUT_DIR / "LoanApp_accept_rate.png", dpi=200)
    plt.close(fig2)


def plot_clean_episodes(df):
    fig, ax = plt.subplots(figsize=(9, 5))
    for label in LABELS_ORDER:
        grp = df[df["label"] == label].sort_values("timestep")
        if grp.empty:
            continue
        zero_ill = (grp["illegal"] == 0).astype(float).values
        n = len(zero_ill)
        mean, std = smooth_stats(zero_ill, SMOOTH_W)
        mean_pct = mean * 100
        upper = np.minimum(mean_pct + std * 100, 100)
        lower = np.maximum(mean_pct - std * 100, 0)
        sx = np.linspace((n - len(mean)) / n * 100, 100, len(mean))
        color = COLORS.get(label, "#888")
        ax.fill_between(sx, lower, upper, color=color, alpha=0.12, linewidth=0)
        ax.plot(sx, mean_pct, color=color, linewidth=2, label=label)
    ax.axhline(100, color="green", linestyle=":", linewidth=1)
    ax.annotate("100% target", xy=(98, 100), xytext=(98, 101.5), fontsize=8, color="green", ha="right")
    ax.set_xlabel("Training progress (%)")
    ax.set_ylabel("% clean episodes")
    ax.set_ylim(0, 106)
    ax.set_title("Percentage of accepting episodes with zero illegal action\nattempts on the role-conditioned Loan Application benchmark")
    ax.grid(True, color="#eee")
    ax.legend(fontsize=9, loc="lower right")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_clean_episodes.png", dpi=200)
    plt.close(fig)

    print("\nFinal 20% -- % episodes with zero illegal actions:")
    for label in LABELS_ORDER:
        grp = df[df["label"] == label]
        if grp.empty:
            continue
        tail = tail_20pct(grp)
        pct_clean = (tail["illegal"] == 0).mean() * 100
        print(f"  {label}: {pct_clean:.1f}%")


def main():
    df = load_data(LOGS_DIR)
    if df.empty:
        print(f"No CSVs found in {LOGS_DIR}")
        return
    print(f"{len(df):,} episodes, {df['label'].nunique()} weight pairs")
    plot_pareto_balanced(df)
    plot_boxplots(df)
    plot_reward_convergence(df)
    plot_accept_and_shielding(df)
    plot_clean_episodes(df)
    print(f"\nWrote figures to {OUT_DIR}")


if __name__ == "__main__":
    main()
