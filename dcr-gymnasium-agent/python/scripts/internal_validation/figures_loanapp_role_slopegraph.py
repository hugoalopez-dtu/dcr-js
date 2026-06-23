"""
Role-specialisation slopegraph for the role-conditioned Loan Application
benchmark, rewritten in matplotlib for consistency with the rest of the
thesis pipeline (the original was built ad hoc inside
scripts/notebooks/analysis_loanapp_roles.ipynb, with a different visual
style from figures_loanapp_roles.py). Same data, same computation -- only
the rendering backend/style changes.

Produces:
  - LoanApp_role_slopegraph.png   (Chapter6, fig:loanapp_role_slopes)

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/internal_validation/figures_loanapp_role_slopegraph.py
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

POLE_L = "a=1.0 b=0.0"   # cost-focused
POLE_R = "a=0.0 b=1.0"   # duration-focused
FLAT_THRESHOLD = 15.0     # |%Expert_R - %Expert_L| below this -> role-indifferent

SHORT_NAME = {
    "Check application form completeness": "Application completeness",
    "Return application back to applicant": "Return application",
    "Check credit history":                 "Credit history",
    "Assess loan risk":                     "Risk assessment",
    "Appraise property":                    "Property appraisal",
}

C_LINE = "#2196F3"   # sensitive events
C_FLAT = "#AAAAAA"   # role-indifferent events
C_50 = "#888888"


def parse_weights(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", stem)
    if m:
        return float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
    return None, None


def wlabel(a, b):
    return f"a={a:.1f} b={b:.1f}" if a is not None else "unknown"


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
                        "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def load_steps(logs_dir):
    rows = []
    for p in sorted(logs_dir.glob("train_trace_exp_LoanApp_roles_*.csv")):
        a, b = parse_weights(p.stem)
        if a is None:
            continue
        label = wlabel(a, b)
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                try:
                    bm = float(row.get("base_mapped", 0))
                except ValueError:
                    continue
                if bm == -10.0:
                    continue
                role = row.get("action_role", "")
                event = row.get("action_label", "")
                if not role or not event:
                    continue
                try:
                    rows.append({
                        "label": label, "alpha": a, "beta": b,
                        "episode": int(row.get("episode", 0)),
                        "event": event, "role": role,
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def tail_20pct(grp):
    return grp.iloc[int(len(grp) * 0.8):]


def build_role_table(df, df_steps):
    role_table = {}
    for label in (POLE_L, POLE_R):
        grp_ep = df[df["label"] == label]
        if grp_ep.empty:
            role_table[label] = {}
            continue
        tail_eps = tail_20pct(grp_ep)
        acc_ep_nums = set(tail_eps[tail_eps["accepting"]]["episode"].tolist())
        grp_steps = df_steps[(df_steps["label"] == label) & (df_steps["episode"].isin(acc_ep_nums))]
        event_pct = {}
        for event, eg in grp_steps.groupby("event"):
            if len(eg) < 20:
                continue
            event_pct[event] = (eg["role"] == "Expert").mean() * 100
        role_table[label] = event_pct
    return role_table


def stagger(values, gap=4.5):
    """Nudges a list of y-values apart so text labels don't overlap, returning
    adjusted positions in the same order as `values`."""
    idx = sorted(range(len(values)), key=lambda i: values[i])
    pos = [values[i] for i in idx]
    for _ in range(200):
        moved = False
        for j in range(1, len(pos)):
            if pos[j] - pos[j - 1] < gap:
                mid = (pos[j] + pos[j - 1]) / 2
                pos[j - 1] = mid - gap / 2
                pos[j] = mid + gap / 2
                moved = True
        if not moved:
            break
    adjusted = [None] * len(values)
    for rank, i in enumerate(idx):
        adjusted[i] = pos[rank]
    return adjusted


def plot_role_slopegraph(df, df_steps):
    role_table = build_role_table(df, df_steps)
    common = sorted(set(role_table[POLE_L]) & set(role_table[POLE_R]))
    if not common:
        print("No common events between poles -- cannot build slopegraph.")
        return

    items = []
    for ev in common:
        l = role_table[POLE_L][ev]
        r = role_table[POLE_R][ev]
        items.append({
            "event": SHORT_NAME.get(ev, ev),
            "left": l, "right": r,
            "flat": abs(r - l) < FLAT_THRESHOLD,
        })
    items.sort(key=lambda x: x["left"])

    left_adj = stagger([it["left"] for it in items])
    right_adj = stagger([it["right"] for it in items])

    fig, ax = plt.subplots(figsize=(9, 7))
    for it, lpos, rpos in zip(items, left_adj, right_adj):
        color = C_FLAT if it["flat"] else C_LINE
        ax.plot([0, 1], [it["left"], it["right"]], color=color, lw=1.8,
                marker="o", markersize=6, alpha=0.85, zorder=2)
        if abs(lpos - it["left"]) > 1.0:
            ax.plot([0, 0], [it["left"], lpos], color="#D0D0D0", lw=0.75, zorder=1)
        if abs(rpos - it["right"]) > 1.0:
            ax.plot([1, 1], [it["right"], rpos], color="#D0D0D0", lw=0.75, zorder=1)
        ax.annotate(f"{it['event']}  ({it['left']:.0f}%)", xy=(0, it["left"]),
                    xytext=(-0.04, lpos), ha="right", va="center", fontsize=9)
        ax.annotate(f"{it['right']:.0f}%", xy=(1, it["right"]),
                    xytext=(1.04, rpos), ha="left", va="center", fontsize=9, fontweight="bold")

    ax.axhline(50, color=C_50, linestyle=":", linewidth=1.2)
    ax.annotate("Role-indifferent threshold (50%)", xy=(0.5, 50), xytext=(0.5, 52),
                ha="center", fontsize=8, color=C_50, style="italic")

    ax.set_xlim(-0.85, 1.55)
    ax.set_ylim(-5, 110)
    ax.set_xticks([0, 1])
    ax.set_xticklabels(["Cost-focused\n(a=1.0, b=0.0)", "Duration-focused\n(a=0.0, b=1.0)"], fontsize=10)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.set_title("Expert-assignment rate per event under cost-focused vs.\n"
                 "duration-focused optimisation (role-conditioned Loan Application)")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_role_slopegraph.png", dpi=200)
    plt.close(fig)
    print(f"Role slopegraph: {len(items)} events "
          f"({sum(1 for i in items if i['flat'])} role-indifferent)")


def main():
    df = load_data(LOGS_DIR)
    df_steps = load_steps(LOGS_DIR)
    if df.empty or df_steps.empty:
        print(f"No CSVs found in {LOGS_DIR}")
        return
    plot_role_slopegraph(df, df_steps)
    print(f"\nWrote figures to {OUT_DIR}")


if __name__ == "__main__":
    main()
