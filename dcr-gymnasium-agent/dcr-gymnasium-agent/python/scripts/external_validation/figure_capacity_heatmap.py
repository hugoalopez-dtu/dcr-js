"""
Heatmap alternative to capacity_allocation_per_event.png: events x budget k,
colour = Expert-assignment rate. Easier to read than overlapping lines for
12 events x 4 k-levels -- the three qualitative patterns (monotonic
increasing, role-indifferent, front-loaded under scarcity) show up as
left-to-right colour gradients, flat rows, or reversed gradients
respectively, instead of requiring the reader to disentangle 12 lines.

Usage:
    cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
    python scripts/external_validation/figure_capacity_heatmap.py
"""
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

IN_CSV = Path(__file__).resolve().parent / "loanapp_capacity_results" / "capacity_role_allocation.csv"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"

K_ORDER = ["k=1", "k=2", "k=3", "k=inf"]


def main():
    df = pd.read_csv(IN_CSV)
    pivot = df.pivot(index="event", columns="k", values="expert_rate")[K_ORDER]

    # Sort rows by net change (k=1 -> k=inf) purely for visual readability --
    # NOT a strict 3-way taxonomy, some events (e.g. Approve loan offer)
    # fluctuate non-monotonically and don't fit a clean increasing/flat/
    # decreasing bucket. The sort just groups similar-looking rows together.
    delta = pivot["k=inf"] - pivot["k=1"]
    pivot = pivot.loc[delta.sort_values(ascending=False).index]

    fig, ax = plt.subplots(figsize=(7, 7))
    im = ax.imshow(pivot.values, cmap="RdYlGn_r", vmin=0, vmax=1, aspect="auto")

    ax.set_xticks(range(len(K_ORDER)))
    ax.set_xticklabels(K_ORDER)
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index, fontsize=9)

    for i in range(pivot.shape[0]):
        for j in range(pivot.shape[1]):
            val = pivot.values[i, j]
            ax.text(j, i, f"{val*100:.0f}%", ha="center", va="center",
                    fontsize=8.5, color="black")

    ax.set_xlabel("Expert budget (k)")
    ax.set_title("Expert-assignment rate per event, by capacity limit\n(Loan Application, final 20% of training)")
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.18)
    cbar.set_label("Expert-assignment rate")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "capacity_allocation_heatmap.png", dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {OUT_DIR / 'capacity_allocation_heatmap.png'}")


if __name__ == "__main__":
    main()
