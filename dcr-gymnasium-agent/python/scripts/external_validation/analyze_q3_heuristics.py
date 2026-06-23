"""
Q3 of the capacity-constrained role experiment: does the learned policy
beat fixed role-allocation heuristics (Always-Junior, Always-Expert,
Greedy-per-event), holding event-sequencing random as in Shielding-only?

Always-Junior and Always-Expert never use alpha/beta (no weight-based
decision), so each yields a single representative (cost,duration) point,
constant across k for Always-Junior (Junior is never budget-blocked) and
varying only with k for Always-Expert. Greedy uses alpha/beta like the
learned policy, so it produces its own front per k, directly comparable
to the learned policy's front.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/analyze_q3_heuristics.py
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
HEUR_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results" / "heuristics"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

K_VALUES = [None, 1, 2, 3]
K_LABEL = {None: "k=inf", 1: "k=1", 2: "k=2", 3: "k=3"}


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
        return [], np.nan
    last20 = eps.tail(max(1, n // 5))
    accept_rate = last20["accepting"].astype(str).str.lower().eq("true").mean()
    accepted = last20[last20["accepting"].astype(str).str.lower() == "true"]
    pts = []
    for c, d in zip(accepted["episode_cost"], accepted["episode_duration"]):
        try:
            pts.append((round(float(c), 1), round(float(d), 1)))
        except (TypeError, ValueError):
            continue
    return pts, accept_rate


def learned_front_for_k(k):
    if k is None:
        pattern = str(LEARNED_DIR / "train_trace_exp_LoanApp_roles_s1_a*_b*_2*.csv")
        files = [f for f in glob.glob(pattern) if not re.search(r"_k\d_", f)]
    else:
        pattern = str(LEARNED_DIR / f"train_trace_exp_LoanApp_roles_s1_a*_b*_k{k}_*.csv")
        files = glob.glob(pattern)
    all_pts = set()
    for f in files:
        pts, _ = last20_accepted_points(f)
        all_pts.update(pts)
    return pareto_filter(all_pts)


def heuristic_files(heuristic, k):
    k_tag = "kinf" if k is None else f"k{k}"
    pattern = str(HEUR_DIR / heuristic / f"train_trace_exp_LoanAppHeuristic_{heuristic}_s1_*_{k_tag}_*.csv")
    return glob.glob(pattern)


def median_point(pts):
    if not pts:
        return None
    return (float(np.median([p[0] for p in pts])), float(np.median([p[1] for p in pts])))


def main():
    # Always-Junior: single point, same for every k (only one file exists, k=inf, but
    # Junior is never budget-blocked so its behaviour doesn't depend on k anyway).
    # Median, not mean: the distribution is right-skewed by rework-loop episodes
    # (duration ranges 1632-15488 across accepted episodes).
    aj_files = glob.glob(str(HEUR_DIR / "always_junior" / "train_trace_exp_*.csv"))
    aj_pts = []
    aj_rate = np.nan
    for f in aj_files:
        pts, rate = last20_accepted_points(f)
        aj_pts.extend(pts)
        aj_rate = rate
    aj_point = median_point(aj_pts)

    rows = []
    figs = {}
    for k in K_VALUES:
        learned_front = learned_front_for_k(k)

        ae_files = heuristic_files("always_expert", k)
        ae_pts = []
        ae_rate = np.nan
        for f in ae_files:
            pts, rate = last20_accepted_points(f)
            ae_pts.extend(pts)
            ae_rate = rate
        ae_point = median_point(ae_pts)

        gr_files = heuristic_files("greedy", k)
        gr_pts = set()
        for f in gr_files:
            pts, _ = last20_accepted_points(f)
            gr_pts.update(pts)
        gr_front = pareto_filter(gr_pts)

        rows.append({
            "k": K_LABEL[k],
            "learned_pareto_points": len(learned_front),
            "learned_cost_range": f"{min(p[0] for p in learned_front):.0f}-{max(p[0] for p in learned_front):.0f}" if learned_front else "-",
            "learned_dur_range": f"{min(p[1] for p in learned_front):.0f}-{max(p[1] for p in learned_front):.0f}" if learned_front else "-",
            "greedy_pareto_points": len(gr_front),
            "greedy_cost_range": f"{min(p[0] for p in gr_front):.0f}-{max(p[0] for p in gr_front):.0f}" if gr_front else "-",
            "greedy_dur_range": f"{min(p[1] for p in gr_front):.0f}-{max(p[1] for p in gr_front):.0f}" if gr_front else "-",
            "always_expert_accept_rate": f"{ae_rate:.0%}" if not np.isnan(ae_rate) else "n/a",
            "always_expert_point_median": f"({ae_point[0]:.0f}, {ae_point[1]:.0f})" if ae_point else "0% accept -- never completes",
            "always_junior_accept_rate": f"{aj_rate:.0%}" if not np.isnan(aj_rate) else "n/a",
            "always_junior_point_median": f"({aj_point[0]:.0f}, {aj_point[1]:.0f})" if aj_point else "-",
        })

        fig, ax = plt.subplots(figsize=(6, 5))
        if learned_front:
            lx, ly = zip(*sorted(learned_front))
            ax.plot(lx, ly, "o-", color="#1f77b4", label="learned policy", linewidth=1.5)
        if gr_front:
            gx, gy = zip(*sorted(gr_front))
            ax.plot(gx, gy, "s--", color="#2ca02c", label="greedy heuristic", linewidth=1.5)

        # Determine a sensible x-range from the "main cluster" (learned + greedy +
        # always-junior), then clip always-expert with an annotation if it's a
        # far outlier instead of letting it stretch the axis and compress
        # everything else into a sliver.
        main_xs = list(lx) if learned_front else []
        main_xs += list(gx) if gr_front else []
        if aj_point:
            main_xs.append(aj_point[0])
        x_clip = max(main_xs) * 1.15 if main_xs else None

        if ae_point:
            if x_clip and ae_point[0] > x_clip:
                ax.scatter([x_clip * 0.97], [ae_point[1]], color="#d62728", marker="^",
                           s=100, zorder=5, clip_on=False)
                ax.annotate(f"always-expert (median)\ncost={ae_point[0]:.0f}, off-scale →",
                            xy=(x_clip * 0.97, ae_point[1]), xytext=(-90, 10),
                            textcoords="offset points", color="#d62728", fontsize=8,
                            ha="right")
            else:
                ax.scatter(*ae_point, color="#d62728", marker="^", s=100, label="always-expert (median)", zorder=5)
        else:
            ax.annotate("always-expert: 0% accept\n(never completes)", xy=(0.05, 0.92),
                        xycoords="axes fraction", color="#d62728", fontsize=9, style="italic")
        if aj_point:
            ax.scatter(*aj_point, color="#9467bd", marker="v", s=100, label="always-junior (median)", zorder=5)
        if x_clip:
            ax.set_xlim(right=x_clip)
        ax.set_xlabel("cost")
        ax.set_ylabel("duration")
        ax.set_title(f"Learned policy vs role-allocation heuristics ({K_LABEL[k]})")
        ax.legend(fontsize=8.5)
        fig.tight_layout()
        fname = OUT_DIR / f"q3_heuristics_{K_LABEL[k].replace('=', '')}.png"
        fig.savefig(fname, dpi=150)
        plt.close(fig)
        figs[K_LABEL[k]] = fname

    table = pd.DataFrame(rows)
    table.to_csv(OUT_DIR / "q3_heuristics_table.csv", index=False)
    print(table.to_string(index=False))
    print("\nFigures:")
    for k_label, fname in figs.items():
        print(f"  {k_label}: {fname}")


if __name__ == "__main__":
    main()
