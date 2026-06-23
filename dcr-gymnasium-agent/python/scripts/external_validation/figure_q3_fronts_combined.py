"""
Combined view of how the recovered Pareto front shrinks/shifts as the
Expert capacity budget k tightens, for the role-conditioned Loan
Application benchmark. Reuses the exact data-loading and Pareto-filtering
logic of analyze_q3_heuristics.py (verified against tab:q3_heuristics in
Chapter6_Results_REVISED.tex) -- this script only adds a single overlaid
figure across all four budgets, which that script does not produce (it
only writes one separate learned-vs-heuristics figure per k).

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/figure_q3_fronts_combined.py
"""
import glob
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LEARNED_DIR = Path(__file__).resolve().parent / "loanapp_roles_capacity"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

K_VALUES = [None, 1, 2, 3]
K_LABEL = {None: "k=inf", 1: "k=1", 2: "k=2", 3: "k=3"}
K_COLOR = {None: "#1f77b4", 1: "#d62728", 2: "#ff7f0e", 3: "#2ca02c"}


def pareto_filter(points):
    pts = list(set(points))
    return [p for p in pts if not any(
        q != p and q[0] <= p[0] and q[1] <= p[1] and (q[0] < p[0] or q[1] < p[1])
        for q in pts
    )]


def last20_accepted_points(csv_path):
    df = pd.read_csv(csv_path, low_memory=False)
    eps = df[df["done"] == True].copy()
    n = len(eps)
    if n == 0:
        return []
    last20 = eps.tail(max(1, n // 5))
    accepted = last20[last20["accepting"].astype(str).str.lower() == "true"]
    pts = []
    for c, d in zip(accepted["episode_cost"], accepted["episode_duration"]):
        try:
            pts.append((round(float(c), 1), round(float(d), 1)))
        except (TypeError, ValueError):
            continue
    return pts


def learned_front_for_k(k):
    if k is None:
        pattern = str(LEARNED_DIR / "train_trace_exp_LoanApp_roles_s1_a*_b*_2*.csv")
        files = [f for f in glob.glob(pattern) if not re.search(r"_k\d_", f)]
    else:
        pattern = str(LEARNED_DIR / f"train_trace_exp_LoanApp_roles_s1_a*_b*_k{k}_*.csv")
        files = glob.glob(pattern)
    all_pts = set()
    for f in files:
        all_pts.update(last20_accepted_points(f))
    return pareto_filter(all_pts)


def main():
    # Single panel, learned policy only: this is the same 26-point front shown
    # at k=inf in fig:loanapp_pareto_balanced (start of the section), here
    # extended to show how it contracts as the Expert budget k tightens (Q1).
    # The learned-vs-greedy comparison (Q3) is a separate question, already
    # covered by the per-k figures from analyze_q3_heuristics.py.
    fig, ax = plt.subplots(figsize=(7.5, 6))

    for k in K_VALUES:
        label = K_LABEL[k]
        color = K_COLOR[k]
        lw = 2.2 if k is None else 1.5
        learned = learned_front_for_k(k)
        if learned:
            lx, ly = zip(*sorted(learned))
            ax.plot(lx, ly, "o-", color=color, label=f"{label} ({len(learned)} pts)",
                     linewidth=lw, markersize=5)

    ax.set_xlabel("Total cost")
    ax.set_ylabel("Total duration")
    ax.set_title("Recovered Pareto front under each Expert capacity budget k\n"
                 "(role-conditioned Loan Application benchmark)")
    ax.grid(True, color="#eee")
    ax.legend(title="Expert budget", fontsize=8.5)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "LoanApp_capacity_pareto_combined.png", dpi=200)
    plt.close(fig)
    print(f"Wrote {OUT_DIR / 'LoanApp_capacity_pareto_combined.png'}")


if __name__ == "__main__":
    main()
