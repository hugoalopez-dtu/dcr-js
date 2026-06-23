"""Plots for sec:loanapp_roles seed robustness (seed_robustness_roles.json),
mirroring plot_seed_robustness.py's boxplot + colored-seeds style."""
import json
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt

LOGS_DIR = Path(__file__).parent / "logs" / "generalisation_gap"
OUT_DIR = LOGS_DIR

with open(LOGS_DIR / "seed_robustness_roles.json") as f:
    data = json.load(f)

per_seed = data["per_seed"]
seeds = sorted(per_seed.keys(), key=int)

seed_colors = {
    "1": "#E74C3C",
    "2": "#3498DB",
    "3": "#F1C40F",
    "4": "#9B59B6",
}

configs = list(next(iter(per_seed.values()))["per_config"].keys())
rng = np.random.default_rng(42)


def boxplot_with_seeds(metric_fn, ylabel, title, fname, legend_loc="upper right"):
    fig, ax = plt.subplots(figsize=(8, 5))
    data_per_config = [[metric_fn(per_seed[s]["per_config"][c]) for s in seeds] for c in configs]

    ax.boxplot(data_per_config, patch_artist=True, showfliers=False,
               boxprops=dict(facecolor="#F4F6F7", color="#BDC3C7", alpha=0.4),
               medianprops=dict(color="#7F8C8D", linewidth=1.5),
               whiskerprops=dict(color="#BDC3C7", linestyle="--"),
               capprops=dict(color="#BDC3C7"))

    for i, c in enumerate(configs):
        x_positions = rng.uniform(i + 0.88, i + 1.12, size=len(seeds))
        for idx, s in enumerate(seeds):
            value = metric_fn(per_seed[s]["per_config"][c])
            ax.scatter(x_positions[idx], value, color=seed_colors[s], edgecolor="black",
                       s=55, alpha=0.9, zorder=3, label=f"Seed {s}" if i == 0 else "")

    ax.set_xticks(range(1, len(configs) + 1))
    ax.set_xticklabels(configs, rotation=30, ha="right")
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(loc=legend_loc, frameon=True)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    plt.subplots_adjust(bottom=0.2)
    fig.savefig(OUT_DIR / fname, dpi=150)
    plt.close(fig)
    print(f"Wrote {OUT_DIR / fname}")


boxplot_with_seeds(
    lambda cfg: cfg["final_illegal_rate"],
    "Final illegal-trace rate (%)",
    "Role-conditioned Loan Application: illegal-trace rate per config\n(seeds 1-4)",
    "seed_robustness_roles_illegal_boxplot.png",
)

boxplot_with_seeds(
    lambda cfg: cfg["n_accepting_last20"],
    "n_accepting_last20",
    "Role-conditioned Loan Application: accepting episodes per config\n(seeds 1-4)",
    "seed_robustness_roles_acceptance_boxplot.png",
    legend_loc="lower right",
)

# --- Pareto overlay: one front per seed, same axes ---
fig, ax = plt.subplots(figsize=(8, 6))
for s in seeds:
    front = per_seed[s]["pareto_points"]
    if not front:
        continue
    fx = [p["cost"] for p in front]
    fy = [p["duration"] for p in front]
    ax.plot(fx, fy, "o-", color=seed_colors[s], label=f"Seed {s} ({len(front)} pts)",
             linewidth=1.5, markersize=5, alpha=0.85)

ax.set_xlabel("Total cost")
ax.set_ylabel("Total duration")
ax.set_title("Recovered Pareto front per seed\n(role-conditioned Loan Application, unlimited capacity)")
ax.grid(True, color="#eee")
ax.legend(fontsize=9)
fig.tight_layout()
fig.savefig(OUT_DIR / "seed_robustness_roles_pareto_overlay.png", dpi=150)
plt.close(fig)
print(f"Wrote {OUT_DIR / 'seed_robustness_roles_pareto_overlay.png'}")
