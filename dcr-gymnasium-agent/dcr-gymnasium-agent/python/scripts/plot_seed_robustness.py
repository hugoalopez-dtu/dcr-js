"""Plots for §6.3 seed robustness analysis (seed_robustness.json)."""
import json
from pathlib import Path

import matplotlib.pyplot as plt

LOGS_DIR = Path(__file__).parent / "logs" / "generalisation_gap"
OUT_DIR = LOGS_DIR

with open(LOGS_DIR / "seed_robustness.json") as f:
    data = json.load(f)

per_seed = data["per_seed"]
seeds = sorted(per_seed.keys(), key=int)
colors = plt.cm.tab10.colors

# --- Plot 1: Pareto front overlay ---
fig, ax = plt.subplots(figsize=(6, 5))
markers = ["o", "s", "^", "D"]
for i, seed in enumerate(seeds):
    points = per_seed[seed]["pareto_points"]
    points = sorted(points, key=lambda p: p["cost"])
    costs = [p["cost"] for p in points]
    durations = [p["duration"] for p in points]
    ax.plot(costs, durations, marker=markers[i], color=colors[i], label=f"seed {seed}",
            markersize=6, linewidth=1.5, alpha=0.5, markerfacecolor="none", markeredgewidth=1.5)

ax.set_xlabel("Cost")
ax.set_ylabel("Duration")
ax.set_title("Pareto fronts across seeds (near-perfect overlap)")
ax.legend()
fig.tight_layout()
fig.savefig(OUT_DIR / "seed_robustness_pareto_overlay.png", dpi=150)
plt.close(fig)

# --- Plot 2: illegal rate per config x seed ---
configs = list(next(iter(per_seed.values()))["per_config"].keys())
fig, ax = plt.subplots(figsize=(8, 5))
for i, seed in enumerate(seeds):
    rates = [per_seed[seed]["per_config"][c]["final_illegal_rate"] for c in configs]
    ax.scatter(range(len(configs)), rates, color=colors[i], label=f"seed {seed}", s=40, zorder=3)

ax.set_xticks(range(len(configs)))
ax.set_xticklabels(configs, rotation=30, ha="right")
ax.set_ylabel("Final illegal-trace rate (%)")
ax.set_title("Illegal-trace rate per config, across seeds")
ax.legend()
fig.tight_layout()
fig.savefig(OUT_DIR / "seed_robustness_illegal_rate.png", dpi=150)
plt.close(fig)

# --- Plot 3: acceptance count per config x seed ---
fig, ax = plt.subplots(figsize=(8, 5))
for i, seed in enumerate(seeds):
    counts = [per_seed[seed]["per_config"][c]["n_accepting_last20"] for c in configs]
    ax.scatter(range(len(configs)), counts, color=colors[i], label=f"seed {seed}", s=40, zorder=3)

ax.set_xticks(range(len(configs)))
ax.set_xticklabels(configs, rotation=30, ha="right")
ax.set_ylabel("n_accepting_last20")
ax.set_title("Accepting episodes (last 20%) per config, across seeds")
ax.legend()
fig.tight_layout()
fig.savefig(OUT_DIR / "seed_robustness_acceptance.png", dpi=150)
plt.close(fig)

print("Saved:")
for name in ["seed_robustness_pareto_overlay.png", "seed_robustness_illegal_rate.png", "seed_robustness_acceptance.png"]:
    print(" -", OUT_DIR / name)
