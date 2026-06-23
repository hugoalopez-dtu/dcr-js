"""
Taxonomy figure for Chapter 3 (fig:lit_taxonomy, Pictures/lit_taxonomy.png):
a 3-circle Venn over the axes Declarative semantics / Multi-objective
optimisation / Shielded (compliance-during-learning) RL. Each cited work in
tab:lit_comparison is placed according to its Decl./M.O./RL+Safe columns;
works with RL=yes but Safe=no (Roijers, Vamplew, Abels, Hayes) fall in the
M.O.-only region since this diagram only has 3 axes, not 4 -- "RL" alone
is not one of them, only "RL with a compliance guarantee" is. Works with
neither declarative semantics, multi-objective optimisation, nor a
compliance guarantee during learning (Huang, Meneghello, Middelhuis: plain
RL-based BPM resource allocation) fall outside all three circles, in a
separate labelled box.

Works marked with a star are empirical baselines this thesis directly
compares against in Chapters 6-8 (Diaz: exact CSP+COP baseline for EQ1;
Kirchdorfer, Doumeni: role/resource-allocation comparison; Le et al.:
closest-in-spirit PrPA comparison, sec:lit_prpa); the rest are background
theory/survey citations, not direct empirical comparisons.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/figure_lit_taxonomy.py
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch

OUT_DIR = Path(__file__).resolve().parent
OUT_DIR.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica Neue", "Helvetica", "DejaVu Sans"],
})

COLOR_A = "#4C72B0"  # Declarative semantics
COLOR_B = "#DD8452"  # Multi-objective optimisation
COLOR_C = "#55A868"  # Shielded / compliance-guaranteed RL

fig, ax = plt.subplots(figsize=(10, 9.2))
ax.set_xlim(-1, 11)
ax.set_ylim(-3.1, 9.6)
ax.set_aspect("equal")
ax.axis("off")
fig.patch.set_facecolor("white")

# --- Three circles, equilateral triangle of centers ---
center_A = (3.4, 6.0)
center_B = (6.6, 6.0)
center_C = (5.0, 3.25)
radius = 3.0
centroid = ((center_A[0] + center_B[0] + center_C[0]) / 3,
            (center_A[1] + center_B[1] + center_C[1]) / 3)

for center, color in [(center_A, COLOR_A), (center_B, COLOR_B), (center_C, COLOR_C)]:
    ax.add_patch(Circle(center, radius, facecolor=color, alpha=0.20,
                         edgecolor=color, linewidth=2.2, zorder=1))

# --- Axis titles ---
ax.text(0.55, 8.75, "Declarative semantics\n(DCR, COP, SMT, SAT)",
        ha="center", va="center", fontsize=11, fontweight="bold", color=COLOR_A, linespacing=1.5)
ax.text(9.45, 8.75, "Multi-objective\noptimisation",
        ha="center", va="center", fontsize=11, fontweight="bold", color=COLOR_B, linespacing=1.5)
ax.text(5.0, -0.55, "Shielded RL\n(compliance guaranteed during learning)",
        ha="center", va="center", fontsize=11, fontweight="bold", color="#3D7A4C", linespacing=1.5)


def region_label(x, y, lines, fontsize=9.0, fontweight="normal", color="#1A1A1A", zorder=3):
    ax.text(x, y, "\n".join(lines), ha="center", va="center", fontsize=fontsize,
            fontweight=fontweight, color=color, linespacing=1.75, zorder=zorder)


# A only -- centroid of the left crescent, away from B and C
region_label(1.55, 6.55, [
    "Felli et al. '23 (SMT)",
    "Boltenhagen et al. '21 (SAT)",
    "Groefsema et al. '24",
])

# B only -- centroid of the right crescent, away from A and C
region_label(8.45, 6.55, [
    "Kirchdorfer et al. '25$^\\star$",
    "Doumeni '24$^\\star$",
    "Le et al. '26$^\\star$",
    "Deb et al. '02",
    "Roijers et al. '13  ·  Vamplew et al. '08",
    "Abels et al. '19  ·  Hayes et al. '22",
])

# C only -- centroid of the bottom crescent, away from A and B
region_label(5.0, 1.35, [
    "Altman '99  ·  García & Fernández '15",
    "Alshiekh et al. '18  ·  Achiam et al. '17",
])

# A ∩ B only (excluding C) -- the lens between the two top circles, above the centroid
region_label(5.0, 7.05, ["Diaz et al. '24$^\\star$", "(exact CSP+COP)"], fontsize=9.3, fontweight="bold")

# Center A ∩ B ∩ C -- true triangle centroid
ax.add_patch(FancyBboxPatch((centroid[0] - 0.95, centroid[1] - 0.55), 1.9, 1.1,
                             boxstyle="round,pad=0.05,rounding_size=0.15",
                             facecolor="#333333", edgecolor="none", alpha=0.92, zorder=4))
ax.text(centroid[0], centroid[1], "THIS\nTHESIS", ha="center", va="center",
        fontsize=13, fontweight="bold", color="white", linespacing=1.3, zorder=5)

# --- Outside box: RL-based BPM with neither MO, declarative semantics, nor compliance ---
box = FancyBboxPatch((0.2, -2.85), 9.6, 1.55, boxstyle="round,pad=0.05,rounding_size=0.12",
                      facecolor="#F2F2F2", edgecolor="#AAAAAA", linewidth=1.1, zorder=1)
ax.add_patch(box)
ax.text(5.0, -2.0,
        "RL-based resource allocation in BPM, single-objective, no compliance guarantee:\n"
        "Huang et al. '11  ·  Meneghello et al. '24  ·  Middelhuis et al. '25",
        ha="center", va="center", fontsize=9.3, color="#444444", linespacing=1.6, zorder=2)

ax.text(5.0, -2.65, r"$^\star$ empirical baseline directly compared against in this thesis (Chapters 6-8)",
        ha="center", va="center", fontsize=8.0, style="italic", color="#777777", zorder=2)

fig.tight_layout()
out_path = OUT_DIR / "lit_taxonomy.png"
fig.savefig(out_path, dpi=220, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"Wrote {out_path}")
