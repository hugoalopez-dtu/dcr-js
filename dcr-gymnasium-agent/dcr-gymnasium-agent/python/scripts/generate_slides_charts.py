"""
generate_slides_charts.py
Generates 3 PNG figures for the presentation slides.

  slide1_timeline.png      – Run inventory (Slide 1: Overview)
  slide2_curves.png        – ep_rew_mean + ep_len_mean per family (Slide 2: Analysis)
  slide3_diagnosis.png     – Causal-diagnosis diagram (Slide 3: Deep dive)

Run from the scripts/ folder:
  python generate_slides_charts.py
"""

import sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
import numpy as np
from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
TB_ROOT    = SCRIPT_DIR.parent / "dcr_tensorboard"
OUT_DIR    = SCRIPT_DIR / "slides_charts"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Palette ───────────────────────────────────────────────────────────────────
C = {
    "PPO_1":           "#e07b39",   # orange
    "PPO_2":           "#e0b039",   # yellow-orange
    "B_early":         "#6baed6",   # light blue  (exp_B_2026-04-04)
    "B_late":          "#2171b5",   # dark blue   (exp_B_2026-04-06)
    "Pizza":           "#74c476",   # green
    "Pension":         "#9e9ac8",   # purple
    "MeetingNesting":  "#fd8d3c",   # coral
}

STYLE = dict(linewidth=2.2)

# ── Helper: load scalars from a TensorBoard folder ─────────────────────────────
def load_run(folder: Path, tags):
    ef = sorted(folder.rglob("events.out.tfevents.*"))
    if not ef:
        return {}
    ea = EventAccumulator(str(ef[0]), size_guidance={"scalars": 0})
    ea.Reload()
    available = set(ea.Tags().get("scalars", []))
    result = {}
    for t in tags:
        if t in available:
            vals = ea.Scalars(t)
            result[t] = ([v.step for v in vals], [v.value for v in vals])
    return result


# ── Define the runs we care about ─────────────────────────────────────────────
RUNS = {
    "PPO_1":          TB_ROOT / "PPO_1",
    "PPO_2":          TB_ROOT / "PPO_2",
    "B (04-Apr #1)":  TB_ROOT / "exp_B_20260404T133353_1",
    "B (06-Apr)":     TB_ROOT / "exp_B_20260406T114009_1",
    "Pizza (30k)":    TB_ROOT / "exp_Pizza_20260410T153707_1",
    "Pizza (100k)":   TB_ROOT / "exp_Pizza_20260410T180553_1",
    "Pension (30k)":  TB_ROOT / "exp_Pension_20260410T153832_1",
    "Pension (100k)": TB_ROOT / "exp_Pension_20260410T181021_1",
    "Meeting (30k)":  TB_ROOT / "exp_MeetingNesting_20260410T153957_1",
    "Meeting (100k)": TB_ROOT / "exp_MeetingNesting_20260410T181448_1",
}

RUN_COLORS = {
    "PPO_1":          C["PPO_1"],
    "PPO_2":          C["PPO_2"],
    "B (04-Apr #1)":  C["B_early"],
    "B (06-Apr)":     C["B_late"],
    "Pizza (30k)":    "#41ab5d",
    "Pizza (100k)":   C["Pizza"],
    "Pension (30k)":  "#bcbddc",
    "Pension (100k)": C["Pension"],
    "Meeting (30k)":  "#fdae6b",
    "Meeting (100k)": C["MeetingNesting"],
}

TAGS = ["rollout/ep_rew_mean", "rollout/ep_len_mean"]

# Load everything once
data = {}
for label, path in RUNS.items():
    if path.exists():
        data[label] = load_run(path, TAGS)
    else:
        print(f"[WARN] folder not found: {path}", file=sys.stderr)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 – Run inventory timeline
# ══════════════════════════════════════════════════════════════════════════════
def make_slide1():
    # Groups of runs in narrative order
    groups = [
        ("Fase 1\nPruebas iniciales",   ["PPO_1", "PPO_2"],                          "#fff3cd"),
        ("Fase 2\nExperimento B",        ["B (04-Apr #1)", "B (06-Apr)"],              "#cce5ff"),
        ("Fase 3\nCasos de proceso\n(30k steps)", ["Pizza (30k)", "Pension (30k)", "Meeting (30k)"],    "#d4edda"),
        ("Fase 4\nEscalado\n(100k steps)", ["Pizza (100k)", "Pension (100k)", "Meeting (100k)"],  "#e2d9f3"),
    ]

    # Final reward for each run
    final_rewards = {}
    for label in RUNS:
        d = data.get(label, {})
        series = d.get("rollout/ep_rew_mean", ([], []))
        final_rewards[label] = round(series[1][-1], 2) if series[1] else "n/a"

    fig, ax = plt.subplots(figsize=(14, 5))
    ax.set_xlim(0, len(RUNS) + 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    fig.patch.set_facecolor("#f8f9fa")
    ax.set_facecolor("#f8f9fa")

    x_pos = 1
    for group_label, members, bg_color in groups:
        n = len(members)
        rect = mpatches.FancyBboxPatch(
            (x_pos - 0.45, 0.08), n * 1.35 - 0.1, 0.84,
            boxstyle="round,pad=0.02", linewidth=1.5,
            edgecolor="#6c757d", facecolor=bg_color, zorder=1,
        )
        ax.add_patch(rect)
        ax.text(x_pos + (n * 1.35 - 1.35) / 2, 0.96, group_label,
                ha="center", va="top", fontsize=9, fontweight="bold", color="#343a40")

        for m in members:
            color = RUN_COLORS[m]
            circle = plt.Circle((x_pos, 0.52), 0.22, color=color, zorder=3)
            ax.add_patch(circle)
            ax.text(x_pos, 0.52, str(final_rewards.get(m, "?")),
                    ha="center", va="center", fontsize=9, fontweight="bold",
                    color="white", zorder=4)
            ax.text(x_pos, 0.22, m, ha="center", va="center", fontsize=7.5,
                    color="#343a40", zorder=4, wrap=True)
            x_pos += 1.35

        x_pos += 0.15  # gap between groups

    ax.set_title(
        "Inventario de Experimentos — Recompensa final en cada run",
        fontsize=13, fontweight="bold", pad=12, color="#212529",
    )
    legend_note = ax.text(
        0.5, -0.04,
        "Número en cada círculo = ep_rew_mean final  |  Grupos de izquierda a derecha: del más exploratorio al más largo",
        ha="center", va="top", transform=ax.transAxes,
        fontsize=8, color="#6c757d",
    )

    out = OUT_DIR / "slide1_timeline.png"
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"✓  Slide 1 → {out}")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 – Reward & episode-length curves (grouped by family)
# ══════════════════════════════════════════════════════════════════════════════
def make_slide2():
    families = {
        "PPO inicial\n(10 k steps)": {
            "runs":   ["PPO_1", "PPO_2"],
            "styles": ["-", "--"],
        },
        "Experimento B\n(30 k steps)": {
            "runs":   ["B (04-Apr #1)", "B (06-Apr)"],
            "styles": ["-", "--"],
        },
        "Casos de proceso\n(100 k steps)": {
            "runs":   ["Pizza (100k)", "Pension (100k)", "Meeting (100k)"],
            "styles": ["-", "--", ":"],
        },
    }

    fig = plt.figure(figsize=(16, 8))
    fig.patch.set_facecolor("#f8f9fa")

    # 3 columns × 2 rows
    gs = gridspec.GridSpec(2, 3, hspace=0.45, wspace=0.35)

    tag_titles = {
        "rollout/ep_rew_mean": "Recompensa media (ep_rew_mean)",
        "rollout/ep_len_mean": "Longitud media de episodio (ep_len_mean)",
    }

    for col, (fam_label, fam_cfg) in enumerate(families.items()):
        for row, tag in enumerate(TAGS):
            ax = fig.add_subplot(gs[row, col])
            ax.set_facecolor("white")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

            any_data = False
            for run_label, ls in zip(fam_cfg["runs"], fam_cfg["styles"]):
                d = data.get(run_label, {}).get(tag, ([], []))
                if d[0]:
                    ax.plot(d[0], d[1],
                            color=RUN_COLORS[run_label],
                            linestyle=ls,
                            label=run_label,
                            **STYLE)
                    any_data = True

            if row == 0:
                ax.set_title(fam_label, fontsize=10, fontweight="bold", color="#343a40", pad=6)

            ax.set_ylabel(tag_titles[tag] if col == 0 else "", fontsize=8, color="#495057")
            ax.set_xlabel("Steps", fontsize=8, color="#495057")
            ax.tick_params(labelsize=8)
            ax.grid(axis="y", linestyle=":", linewidth=0.8, alpha=0.6)

            if tag == "rollout/ep_rew_mean":
                ax.axhline(-1, color="#dc3545", linestyle=":", linewidth=1.3, alpha=0.7,
                           label="Óptimo local (−1)")

            if any_data:
                ax.legend(fontsize=7, framealpha=0.7)

    fig.suptitle(
        "Evolución del Entrenamiento — ep_rew_mean y ep_len_mean por familia de experimento",
        fontsize=12, fontweight="bold", y=1.01, color="#212529",
    )

    out = OUT_DIR / "slide2_curves.png"
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"✓  Slide 2 → {out}")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 – Causal diagnosis + entropy lever
# ══════════════════════════════════════════════════════════════════════════════
def make_slide3():
    """
    Left panel : causal chain diagram (boxes + arrows)
    Right panel: conceptual curve showing effect of raising entropy
    """
    fig, (ax_diag, ax_curve) = plt.subplots(1, 2, figsize=(15, 6),
                                             gridspec_kw={"width_ratios": [1, 1.2]})
    fig.patch.set_facecolor("#f8f9fa")

    # ── Left: causal chain ────────────────────────────────────────────────────
    ax_diag.set_xlim(0, 10)
    ax_diag.set_ylim(0, 10)
    ax_diag.axis("off")
    ax_diag.set_facecolor("#f8f9fa")

    boxes = [
        (5, 8.5,  "Diseño de recompensa",      "Penalización acumulada\npor acción inválida",   "#fff3cd", "#856404"),
        (5, 6.0,  "Señal de recompensa",        "Negativa y decreciente\nsi exploro el grafo",   "#cce5ff", "#004085"),
        (5, 3.5,  "Política aprendida",         "Terminar el proceso\nen 1 paso (ep_len=1)",     "#f8d7da", "#721c24"),
        (5, 1.0,  "Métrica observada",          "ep_rew_mean ≈ −1\nLínea plana en TensorBoard",  "#d4edda", "#155724"),
    ]

    for bx, by, title, body, bg, fg in boxes:
        rect = mpatches.FancyBboxPatch(
            (bx - 2.5, by - 0.7), 5.0, 1.4,
            boxstyle="round,pad=0.1", linewidth=1.5,
            edgecolor=fg, facecolor=bg, zorder=2,
        )
        ax_diag.add_patch(rect)
        ax_diag.text(bx, by + 0.3, title, ha="center", va="center",
                     fontsize=9, fontweight="bold", color=fg, zorder=3)
        ax_diag.text(bx, by - 0.2, body, ha="center", va="center",
                     fontsize=7.5, color=fg, zorder=3)

    # Arrows between boxes
    for y_start, y_end in [(7.9, 6.7), (5.4, 4.2), (2.9, 1.7)]:
        ax_diag.annotate(
            "", xy=(5, y_end), xytext=(5, y_start),
            arrowprops=dict(arrowstyle="-|>", color="#6c757d", lw=1.5),
            zorder=4,
        )

    ax_diag.set_title("Cadena Causal del Óptimo Local",
                      fontsize=11, fontweight="bold", color="#212529", pad=8)

    # Annotation: entropy lever
    ax_diag.annotate(
        "Palanca: ↑ Entropía\n(ent_coef 0.01 → 0.1)\n= inyectar curiosidad",
        xy=(7.5, 3.5), xytext=(7.8, 5.5),
        arrowprops=dict(arrowstyle="-|>", color="#6f42c1", lw=1.5,
                        connectionstyle="arc3,rad=-0.3"),
        fontsize=8.5, color="#6f42c1", fontweight="bold",
        bbox=dict(boxstyle="round,pad=0.3", facecolor="#e9d8fd", edgecolor="#6f42c1"),
    )

    # ── Right: conceptual curves ───────────────────────────────────────────────
    ax_curve.set_facecolor("white")
    ax_curve.spines["top"].set_visible(False)
    ax_curve.spines["right"].set_visible(False)

    steps = np.linspace(0, 100000, 300)

    # Lazy policy (low entropy): converges fast to -1
    lazy = -1 + (-25 + 1) * np.exp(-steps / 3500)

    # Curious policy (high entropy): slower, eventually better
    curious = -1.5 + (-20 + 1.5) * np.exp(-steps / 18000) + 2.5 * (1 - np.exp(-steps / 60000))

    ax_curve.plot(steps / 1000, lazy,    color="#dc3545", lw=2.5, label="ent_coef=0.01  (perezoso)")
    ax_curve.plot(steps / 1000, curious, color="#6f42c1", lw=2.5, linestyle="--",
                  label="ent_coef=0.1   (curioso, hipótesis)")

    ax_curve.axhline(-1, color="#adb5bd", linestyle=":", lw=1.3, label="Óptimo local (−1)")
    ax_curve.axhline(0,  color="#198754", linestyle=":", lw=1.3, label="Objetivo (0)")

    ax_curve.fill_between(steps / 1000, curious, lazy,
                          where=curious > lazy, alpha=0.12, color="#6f42c1",
                          label="Ganancia esperada")

    ax_curve.set_xlabel("Steps de entrenamiento (×1000)", fontsize=9)
    ax_curve.set_ylabel("ep_rew_mean", fontsize=9)
    ax_curve.set_title("Efecto Esperado del Coeficiente de Entropía",
                       fontsize=11, fontweight="bold", color="#212529")
    ax_curve.legend(fontsize=8, framealpha=0.7)
    ax_curve.grid(axis="y", linestyle=":", linewidth=0.8, alpha=0.6)
    ax_curve.tick_params(labelsize=8)

    # Annotation "curvas reales de sus experimentos"
    ax_curve.annotate("Curvas reales\n(exp_B y Pizza)",
                      xy=(30, lazy[90]), xytext=(45, -8),
                      arrowprops=dict(arrowstyle="-|>", color="#dc3545", lw=1.2),
                      fontsize=8, color="#dc3545")

    fig.suptitle(
        "Diagnóstico: Óptimo Local y Palanca de Entropía en DCR + RL",
        fontsize=12, fontweight="bold", y=1.02, color="#212529",
    )

    out = OUT_DIR / "slide3_diagnosis.png"
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"✓  Slide 3 → {out}")


# ── Run all ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    make_slide1()
    make_slide2()
    make_slide3()
    print(f"\nAll charts saved to: {OUT_DIR}")
