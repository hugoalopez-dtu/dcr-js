"""Plots for §6.3 seed robustness analysis (seed_robustness.json) with Boxplots and colored seeds."""
import json
import numpy as np
from pathlib import Path

import matplotlib.pyplot as plt

LOGS_DIR = Path(__file__).parent / "logs" / "generalisation_gap"
OUT_DIR = LOGS_DIR

with open(LOGS_DIR / "seed_robustness.json") as f:
    data = json.load(f)

per_seed = data["per_seed"]
seeds = sorted(per_seed.keys(), key=int)

# Definimos colores específicos y brillantes para cada una de las 4 semillas
seed_colors = {
    "1": "#E74C3C",  # Rojo para resaltar la semilla 1
    "2": "#3498DB",  # Azul
    "3": "#F1C40F",  # Amarillo/Dorado
    "4": "#9B59B6"   # Púrpura
}

# Extraemos las configuraciones disponibles
configs = list(next(iter(per_seed.values()))["per_config"].keys())

# Semilla aleatoria interna para reproducibilidad del desplazamiento (jitter) de los puntos
rng = np.random.default_rng(42)

# --- Plot 2: Boxplot + Colored Seeds (Illegal Rate) ---
fig, ax = plt.subplots(figsize=(8, 5))

illegal_rates_data = []
for c in configs:
    rates_for_config = [per_seed[seed]["per_config"][c]["final_illegal_rate"] for seed in seeds]
    illegal_rates_data.append(rates_for_config)

# 1. Dibujar las cajas base de fondo
ax.boxplot(illegal_rates_data, patch_artist=True, showfliers=False,
           boxprops=dict(facecolor='#F4F6F7', color='#BDC3C7', alpha=0.4),
           medianprops=dict(color='#7F8C8D', linewidth=1.5),
           whiskerprops=dict(color='#BDC3C7', linestyle='--'),
           capprops=dict(color='#BDC3C7'))

# 2. Superponer los 4 puntos con colores fijos por semilla
for i, c in enumerate(configs):
    # Jitter horizontal acotado para mantener coherencia espacial
    x_positions = rng.uniform(i + 0.88, i + 1.12, size=len(seeds))
    
    for idx, seed in enumerate(seeds):
        rate = per_seed[seed]["per_config"][c]["final_illegal_rate"]
        ax.scatter(x_positions[idx], rate, color=seed_colors[seed], edgecolor='black', 
                   s=55, alpha=0.9, zorder=3, 
                   label=f"Seed {seed}" if i == 0 else "") # Leyenda solo en la primera iteración

ax.set_xticks(range(1, len(configs) + 1))
ax.set_xticklabels(configs, rotation=30, ha="right")
ax.set_ylabel("Final illegal-trace rate (%)")
ax.set_title("Distribution of Illegal-trace rate per config (Per-seed Colors)")
ax.legend(loc="upper right", frameon=True)
ax.grid(axis='y', linestyle='--', alpha=0.4)
plt.subplots_adjust(bottom=0.2) # Evita que las etiquetas inferiores se corten
fig.savefig(OUT_DIR / "seed_robustness_illegal_boxplot.png", dpi=150)
plt.close(fig)


# --- Plot 3: Boxplot + Colored Seeds (Acceptance Count) ---
fig, ax = plt.subplots(figsize=(8, 5))

acceptance_counts_data = []
for c in configs:
    counts_for_config = [per_seed[seed]["per_config"][c]["n_accepting_last20"] for seed in seeds]
    acceptance_counts_data.append(counts_for_config)

# 1. Dibujar las cajas base de fondo
ax.boxplot(acceptance_counts_data, patch_artist=True, showfliers=False,
           boxprops=dict(facecolor='#F4F6F7', color='#BDC3C7', alpha=0.4),
           medianprops=dict(color='#7F8C8D', linewidth=1.5),
           whiskerprops=dict(color='#BDC3C7', linestyle='--'),
           capprops=dict(color='#BDC3C7'))

# 2. Superponer los 4 puntos con colores fijos por semilla
for i, c in enumerate(configs):
    x_positions = rng.uniform(i + 0.88, i + 1.12, size=len(seeds))
    
    for idx, seed in enumerate(seeds):
        count = per_seed[seed]["per_config"][c]["n_accepting_last20"]
        ax.scatter(x_positions[idx], count, color=seed_colors[seed], edgecolor='black', 
                   s=55, alpha=0.9, zorder=3, 
                   label=f"Seed {seed}" if i == 0 else "")

ax.set_xticks(range(1, len(configs) + 1))
ax.set_xticklabels(configs, rotation=30, ha="right")
ax.set_ylabel("n_accepting_last20")
ax.set_title("Distribution of Accepting episodes per config (Per-seed Colors)")
ax.legend(loc="lower right", frameon=True)
ax.grid(axis='y', linestyle='--', alpha=0.4)
plt.subplots_adjust(bottom=0.2)
fig.savefig(OUT_DIR / "seed_robustness_acceptance_boxplot.png", dpi=150)
plt.close(fig)