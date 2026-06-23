"""
Cost/duration assignment policy sensitivity (the professor's question):
does training convergence or the recovered front's geometry depend on
how cost/duration are assigned to activities -- uniform_random
(independent draw), linear (cost increases with duration), or inverse
(cost decreases with duration)? All three share identical durations
(same seeded draw); only the cost mapping differs (see
tobias_converter.assign_cost_duration).

Run on graph 05 (saferl only, 6 weight pairs, 100k steps each).

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/analyze_policy_sensitivity.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_mined_ablation import (
    load_condition_episodes, last20_per_file, decile_curve,
    unique_accepted_points, pareto_filter, accept_rate_last20,
)

DATA_ROOT = Path(__file__).resolve().parent / "policy_results"
OUT_DIR = Path(__file__).resolve().parent / "policy_results" / "analysis"
OUT_DIR.mkdir(parents=True, exist_ok=True)

POLICIES = {
    "random": "Mined05policyrandom",
    "linear": "Mined05policylinear",
    "inverse": "Mined05policyinverse",
}
COLORS = {"random": "#1f77b4", "linear": "#2ca02c", "inverse": "#d62728"}

# Ground truth (MiniZinc) is policy-specific: cost differs per policy even
# though duration doesn't, so the optimal cost/duration points differ too.
# We don't have a separate COP run per policy, so this script reports
# convergence + front geometry only (no COP comparison).


def main():
    rows = []
    fig1, ax1 = plt.subplots(figsize=(7, 5))
    fig2, ax2 = plt.subplots(figsize=(7, 5))

    for policy, exp_base in POLICIES.items():
        eps = load_condition_episodes(DATA_ROOT, exp_base, "saferl")
        if eps is None:
            print(f"[missing] {policy}")
            continue

        accept_rate = accept_rate_last20(eps)
        curve = decile_curve(eps)
        illegal_final = curve.iloc[-1]

        last20 = last20_per_file(eps)
        pts = unique_accepted_points(last20)
        front = pareto_filter(pts)

        rows.append({
            "policy": policy,
            "n_episodes": len(eps),
            "accept_rate_last20": accept_rate,
            "illegal_rate_final_decile": illegal_final,
            "pareto_points": len(front),
            "cost_min": min(p[0] for p in front) if front else np.nan,
            "cost_max": max(p[0] for p in front) if front else np.nan,
            "dur_min": min(p[1] for p in front) if front else np.nan,
            "dur_max": max(p[1] for p in front) if front else np.nan,
        })

        ax1.plot(curve.index, curve.values, marker="o", label=policy, color=COLORS[policy])

        if front:
            dominated = pts - set(front)
            if dominated:
                dx, dy = zip(*dominated)
                ax2.scatter(dx, dy, color=COLORS[policy], alpha=0.15, s=12)
            fx, fy = zip(*sorted(front))
            ax2.plot(fx, fy, color=COLORS[policy], marker="o", label=f"{policy} (front)", linewidth=1.5)

    ax1.set_xlabel("training decile")
    ax1.set_ylabel("illegal action rate (%)")
    ax1.set_title("Convergence speed by cost/duration assignment policy\n(graph 05, saferl, pooled across 6 weight pairs)")
    ax1.legend()
    fig1.tight_layout()
    fig1.savefig(OUT_DIR / "policy_convergence.png", dpi=150)

    ax2.set_xlabel("cost")
    ax2.set_ylabel("duration")
    ax2.set_title("Recovered front geometry by cost/duration assignment policy\n(graph 05, saferl, final 20% of training)")
    ax2.legend()
    fig2.tight_layout()
    fig2.savefig(OUT_DIR / "policy_front_geometry.png", dpi=150)

    table = pd.DataFrame(rows)
    table.to_csv(OUT_DIR / "policy_sensitivity_table.csv", index=False)
    print(table.to_string(index=False))
    print(f"\nWrote {OUT_DIR}")


if __name__ == "__main__":
    main()
