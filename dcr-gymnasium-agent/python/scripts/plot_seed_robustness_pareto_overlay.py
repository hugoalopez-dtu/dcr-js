"""Regenerates seed_robustness_pareto_overlay.png (fig:pareto_overlay,
sec:policy_generalisation) in the original Chapter 7 style, with the
recovered Pareto point count per seed added to the legend.

Source: seed_robustness_roles.json, the authoritative aggregation whose
summary stats (26.25 +/- 0.5 points, 1.13 +/- 0.34% illegal rate) match
Table tab:seed_variance exactly.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOGS_DIR = Path(__file__).parent / "logs" / "generalisation_gap"
OUT_DIR = LOGS_DIR

with open(LOGS_DIR / "seed_robustness_roles.json") as f:
    data = json.load(f)

per_seed = data["per_seed"]
seeds = sorted(per_seed.keys(), key=int)

markers = ["o", "s", "^", "D"]
colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]

fig, ax = plt.subplots(figsize=(8, 6.5))
for i, seed in enumerate(seeds):
    points = sorted(per_seed[seed]["pareto_points"], key=lambda p: p["cost"])
    n_pts = per_seed[seed]["n_pareto_points"]
    costs = [p["cost"] for p in points]
    durations = [p["duration"] for p in points]
    ax.plot(costs, durations, marker=markers[i % len(markers)], color=colors[i % len(colors)],
            markersize=6, linewidth=1.5, alpha=0.85,
            label=f"seed {seed} ({n_pts} pts)")

ax.set_xlabel("Cost")
ax.set_ylabel("Duration")
ax.set_title("Pareto fronts across seeds (near-perfect overlap)")
ax.legend(loc="upper right")
ax.grid(True, color="#eee")
fig.tight_layout()
fig.savefig(OUT_DIR / "seed_robustness_pareto_overlay.png", dpi=200)
plt.close(fig)
print(f"Wrote {OUT_DIR / 'seed_robustness_pareto_overlay.png'}")
