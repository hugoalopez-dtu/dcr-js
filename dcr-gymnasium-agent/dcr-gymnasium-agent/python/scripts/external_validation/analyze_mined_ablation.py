"""
External validation analysis: saferl vs rl_only vs shield_only vs MiniZinc
(COP), across the Tobias mined-graph benchmark grid (size x density x
constraint-type), as requested for the professor's robustness validation.

Produces:
  Figure 1 -- illegal-action rate per training decile, small-multiples grid
              (one panel per graph), saferl vs rl_only.
  Figure 2 -- accept rate (last 20% of episodes) vs graph size, one line per
              condition (saferl / rl_only / shield_only) -- the headline plot.
  Figure 3 -- Pareto front scatter (cost vs duration) per graph with a
              MiniZinc ground truth, COP points as stars vs saferl points.
  master_table.csv -- one row per (graph, condition): size, density (paper
              formula, see GRAPH_META), dominant constraint type, COP status,
              accept rate, illegal rate (final decile), hypervolume vs COP
              ground truth where available.

Density follows Abbad-Andaloussi et al. (ESWA 2023) Eq. for declarative
process model density: max over weakly-connected components of
(constraints in component / activities in component) -- NOT a flat
relations/events ratio over the whole graph (computed once already in
tobias_converter-adjacent tooling; hardcoded below from that computation so
this script has no dependency on the dcrGraph/ nested repo).

Usage:
    cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
    python scripts/analyze_mined_ablation.py [--logs-root scripts]
"""
import argparse
import glob
import json
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SCRIPT_DIR = Path(__file__).resolve().parent

# --- Benchmark grid metadata -------------------------------------------------
# density: paper-formula (max over weakly-connected components of
# constraints/activities), computed directly from the Tobias XMLs.
# cop_pareto: ground-truth (cost, duration) points from the Phase 1 MiniZinc
# sweep (None where MiniZinc timed out, i.e. graph 09).
GRAPH_META = {
    "Mined04": {"label": "04 (BPI13 Incidents)", "num_events": 4, "density": 1.75,
                "size_cat": "small", "density_cat": "sparse", "type": "mixed",
                "cop_status": "solved", "cop_pareto": [(8, 21)]},
    "Mined01": {"label": "01 (Artificial 0-noise)", "num_events": 8, "density": 1.60,
                "size_cat": "small", "density_cat": "sparse", "type": "exclusion-heavy",
                "cop_status": "solved", "cop_pareto": [(8, 21)]},
    "Mined05": {"label": "05 (Synthetic Review Lg)", "num_events": 14, "density": 6.00,
                "size_cat": "medium", "density_cat": "moderate", "type": "condition-heavy",
                "cop_status": "solved", "cop_pareto": [(335, 410), (339, 387)]},
    "Mined03": {"label": "03 (BPI20 RFP)", "num_events": 19, "density": 10.32,
                "size_cat": "medium", "density_cat": "dense", "type": "mixed",
                "cop_status": "solved", "cop_pareto": [(50, 64)]},
    "Mined11": {"label": "11 (BPI19)", "num_events": 42, "density": 14.52,
                "size_cat": "large", "density_cat": "dense", "type": "exclusion-heavy",
                "cop_status": "solved", "cop_pareto": [(29, 52), (16, 57)]},
    "Mined09": {"label": "09 (Large Bank Txn)", "num_events": 113, "density": 12.17,
                "size_cat": "large", "density_cat": "dense", "type": "exclusion-heavy",
                "cop_status": "timeout", "cop_pareto": None},
}

GRAPH_ORDER = ["Mined04", "Mined01", "Mined05", "Mined03", "Mined11", "Mined09"]
CONDITIONS = ["saferl", "rl_only", "shield_only"]
CONDITION_COLORS = {"saferl": "#2ca02c", "rl_only": "#d62728", "shield_only": "#7f7f7f"}


def load_condition_episodes(logs_root, exp_base, condition):
    """Concatenates all weight-pair CSVs for one (graph, condition), returns
    only completed-episode rows ('done' == True), with a 'weight' column."""
    pattern = str(logs_root / f"logs_ablation_{exp_base}_{condition}" / "train_trace_exp_*.csv")
    frames = []
    for f in sorted(glob.glob(pattern)):
        try:
            df = pd.read_csv(f)
        except Exception as e:
            print(f"  [skip] {f}: {e}")
            continue
        df["source_file"] = Path(f).name
        frames.append(df)
    if not frames:
        return None
    all_df = pd.concat(frames, ignore_index=True)
    eps = all_df[all_df["done"].astype(str).str.lower().isin(["true", "1"])].copy()
    eps["accepting"] = eps["accepting"].astype(str).str.lower().isin(["true", "1"])
    eps["illegal_traces_ratio"] = pd.to_numeric(eps["illegal_traces_ratio"], errors="coerce")
    eps["episode_steps"] = pd.to_numeric(eps["episode_steps"], errors="coerce")
    return eps


def decile_curve(eps):
    """Per-source-file decile binning (so each weight-pair run contributes its
    own 0..9 progress axis), then averaged across files -- avoids one long run
    dominating the curve over several short ones."""
    curves = []
    for _, grp in eps.groupby("source_file"):
        grp = grp.reset_index(drop=True)
        n = len(grp)
        if n == 0:
            continue
        idx = np.arange(n)
        decile = np.clip(idx * 10 // n, 0, 9)
        s = pd.Series(grp["illegal_traces_ratio"].values).groupby(decile).mean()
        curves.append(s.reindex(range(10)))
    if not curves:
        return pd.Series([np.nan] * 10, index=range(10))
    return pd.concat(curves, axis=1).mean(axis=1)


def last20_per_file(eps):
    """Last 20% of episodes WITHIN each source file (weight-pair run), not the
    last 20% of rows overall -- concatenating several weight-pair CSVs and
    taking a global tail would silently only look at the last file(s) in
    sort order, not the converged end of every run."""
    parts = []
    for _, grp in eps.groupby("source_file"):
        n = len(grp)
        if n == 0:
            continue
        parts.append(grp.tail(max(1, n // 5)))
    return pd.concat(parts) if parts else eps.iloc[0:0]


def accept_rate_last20(eps):
    if len(eps) == 0:
        return np.nan
    return float(last20_per_file(eps)["accepting"].mean())


def unique_accepted_points(eps):
    accepted = eps[eps["accepting"]]
    pts = set()
    for c, d in zip(accepted.get("episode_cost", []), accepted.get("episode_duration", [])):
        try:
            pts.add((round(float(c), 1), round(float(d), 1)))
        except (TypeError, ValueError):
            continue
    return pts


def pareto_filter(points):
    """Non-dominated subset for 2D minimisation (cost, duration)."""
    pts = list(points)
    return {p for p in pts if not any(
        q != p and q[0] <= p[0] and q[1] <= p[1] and (q[0] < p[0] or q[1] < p[1])
        for q in pts
    )}


def hypervolume_2d(points, ref_point):
    """Hypervolume for a 2D minimisation front: area dominated by the front,
    bounded above-right by ref_point. Points assumed non-dominated (we filter)."""
    pts = sorted(set(points))
    # keep only non-dominated points (minimise both objectives)
    front = []
    for p in pts:
        if not any(q[0] <= p[0] and q[1] <= p[1] and q != p for q in pts):
            front.append(p)
    front.sort()
    hv = 0.0
    prev_x = ref_point[0]
    for cost, dur in front:
        if cost >= ref_point[0] or dur >= ref_point[1]:
            continue
        hv += (prev_x - cost) * (ref_point[1] - dur)
        prev_x = cost
    return hv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs-root", type=Path, default=SCRIPT_DIR)
    ap.add_argument("--out-dir", type=Path, default=SCRIPT_DIR / "logs" / "mined_ablation_analysis")
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    data = {}  # (graph, condition) -> eps dataframe
    for graph in GRAPH_ORDER:
        for cond in CONDITIONS:
            eps = load_condition_episodes(args.logs_root, graph, cond)
            if eps is None:
                print(f"[missing] {graph} / {cond} -- no CSVs found yet")
            data[(graph, cond)] = eps

    # ---------------- Figure 1: illegal-rate-per-decile small multiples ----
    fig, axes = plt.subplots(2, 3, figsize=(15, 8), sharey=True)
    for ax, graph in zip(axes.flat, GRAPH_ORDER):
        meta = GRAPH_META[graph]
        for cond in ("saferl", "rl_only"):
            eps = data[(graph, cond)]
            if eps is None:
                continue
            curve = decile_curve(eps)
            ax.plot(curve.index, curve.values, marker="o", label=cond,
                    color=CONDITION_COLORS[cond])
        ax.set_title(f"{meta['label']}\n{meta['num_events']} act, "
                      f"density={meta['density']:.1f}, {meta['type']}", fontsize=9)
        ax.set_xlabel("training decile")
        ax.set_ylim(0, 100)
    axes[0, 0].set_ylabel("illegal action rate (%)")
    axes[1, 0].set_ylabel("illegal action rate (%)")
    axes[0, 0].legend(loc="upper right", fontsize=8)
    fig.suptitle("Illegal-action rate per training decile: saferl vs rl_only, across the mined-graph grid")
    fig.tight_layout()
    fig.savefig(args.out_dir / "fig1_illegal_rate_deciles.png", dpi=150)
    plt.close(fig)

    # ---------------- Figure 2: accept rate vs graph size (headline plot) --
    # Conditions often sit exactly on top of each other (all at 1.0) until they
    # diverge -- distinct markers/linestyles/jitter/zorder make all three
    # traceable even when overlapping, instead of looking like a single line.
    COND_MARKER = {"saferl": "o", "rl_only": "^", "shield_only": "s"}
    COND_LINESTYLE = {"saferl": "-", "rl_only": "--", "shield_only": ":"}
    COND_JITTER = {"saferl": 0.0, "rl_only": 0.012, "shield_only": -0.012}
    COND_ZORDER = {"shield_only": 2, "rl_only": 3, "saferl": 4}

    fig, ax = plt.subplots(figsize=(9, 5.5))
    sizes = [GRAPH_META[g]["num_events"] for g in GRAPH_ORDER]
    for cond in CONDITIONS:
        rates = []
        xs = []
        for size, graph in zip(sizes, GRAPH_ORDER):
            eps = data[(graph, cond)]
            rate = accept_rate_last20(eps) if eps is not None else np.nan
            rates.append(rate)
            xs.append(size * (1 + COND_JITTER[cond]))
        ax.plot(xs, rates, marker=COND_MARKER[cond], linestyle=COND_LINESTYLE[cond],
                markersize=9, linewidth=2.2, label=cond, color=CONDITION_COLORS[cond],
                zorder=COND_ZORDER[cond], alpha=0.9)
        for x, r in zip(xs, rates):
            if not np.isnan(r):
                ax.annotate(cond.replace("_", " "), (x, r), textcoords="offset points",
                            xytext=(0, 8 if cond == "saferl" else (-14 if cond == "shield_only" else 14)),
                            fontsize=6, color=CONDITION_COLORS[cond], ha="center")
        # Mark explicitly-skipped runs (e.g. rl_only on graph 09 -- already
        # known to fail at least as badly as saferl, not worth ~3h of
        # cluster time to confirm) so a missing point reads as "not run by
        # design", not as a plotting gap.
        for x, size, graph in zip(xs, sizes, GRAPH_ORDER):
            eps = data[(graph, cond)]
            if eps is None:
                ax.scatter([x], [0.5], marker="x", s=70, color=CONDITION_COLORS[cond],
                           alpha=0.5, zorder=1)
                ax.annotate(f"{cond.replace('_', ' ')}\nnot run", (x, 0.5),
                            textcoords="offset points", xytext=(0, -4), fontsize=6,
                            color=CONDITION_COLORS[cond], ha="center", alpha=0.7, style="italic")
    ax.set_xscale("log")
    ax.set_xticks(sizes)
    ax.set_xticklabels([f"{s}\n({g.replace('Mined','')})" for s, g in zip(sizes, GRAPH_ORDER)])
    ax.set_xlabel("graph size (#activities)")
    ax.set_ylabel("accept rate, last 20% of episodes")
    ax.set_ylim(-0.08, 1.12)
    ax.legend(loc="lower left")
    ax.set_title("Accept rate vs graph size, by condition\n"
                  "(markers/linestyles differ + tiny horizontal jitter so overlapping lines stay visible)")
    fig.tight_layout()
    fig.savefig(args.out_dir / "fig2_accept_rate_vs_size.png", dpi=150)
    plt.close(fig)

    # ---------------- Figure 3: Pareto scatter vs COP ground truth ----------
    cop_graphs = [g for g in GRAPH_ORDER if GRAPH_META[g]["cop_pareto"]]
    fig, axes = plt.subplots(1, len(cop_graphs), figsize=(4 * len(cop_graphs), 4))
    if len(cop_graphs) == 1:
        axes = [axes]
    for ax, graph in zip(axes, cop_graphs):
        meta = GRAPH_META[graph]
        # COP stars drawn first / behind, large and hollow (outline only) so a
        # saferl point landing exactly on top is never hidden underneath it.
        cx, cy = zip(*meta["cop_pareto"])
        ax.scatter(cx, cy, marker="*", s=600, facecolors="none", edgecolors="black",
                   linewidths=1.8, label="MiniZinc (COP)", zorder=1)
        eps = data[(graph, "saferl")]
        if eps is not None:
            pts = unique_accepted_points(last20_per_file(eps))
            if pts:
                front = pareto_filter(pts)
                dominated = pts - front
                if dominated:
                    dx, dy = zip(*dominated)
                    ax.scatter(dx, dy, color="#bbbbbb", label="saferl (dominated)",
                               alpha=0.5, s=18, zorder=3)
                if front:
                    fx, fy = zip(*sorted(front))
                    ax.plot(fx, fy, color=CONDITION_COLORS["saferl"], linewidth=1.2,
                            linestyle="-", alpha=0.8, zorder=4)
                    ax.scatter(fx, fy, color=CONDITION_COLORS["saferl"], label="saferl (non-dominated)",
                               alpha=0.95, s=70, edgecolors="white", linewidths=0.6, zorder=5)
        ax.set_title(meta["label"], fontsize=9)
        ax.set_xlabel("cost")
        ax.set_ylabel("duration")
        ax.legend(fontsize=7)
    fig.suptitle("Pareto front recovered by saferl vs MiniZinc ground truth")
    fig.tight_layout()
    fig.savefig(args.out_dir / "fig3_pareto_vs_cop.png", dpi=150)
    plt.close(fig)

    # ---------------- Master table -------------------------------------
    rows = []
    for graph in GRAPH_ORDER:
        meta = GRAPH_META[graph]
        for cond in CONDITIONS:
            eps = data[(graph, cond)]
            row = {
                "graph": graph, "label": meta["label"], "num_events": meta["num_events"],
                "size_cat": meta["size_cat"], "density": meta["density"],
                "density_cat": meta["density_cat"], "type": meta["type"],
                "cop_status": meta["cop_status"], "condition": cond,
            }
            if eps is not None:
                row["accept_rate_last20"] = accept_rate_last20(eps)
                row["illegal_rate_final_decile"] = decile_curve(eps).iloc[-1] if len(eps) else np.nan
                row["n_episodes"] = len(eps)
                if meta["cop_pareto"]:
                    pts = unique_accepted_points(last20_per_file(eps))
                    ref = (max(c for c, _ in meta["cop_pareto"]) * 1.5,
                           max(d for _, d in meta["cop_pareto"]) * 1.5)
                    row["hypervolume"] = hypervolume_2d(pts, ref) if pts else 0.0
                    row["hypervolume_cop"] = hypervolume_2d(set(meta["cop_pareto"]), ref)
            rows.append(row)
    table = pd.DataFrame(rows)
    table.to_csv(args.out_dir / "master_table.csv", index=False)

    print(f"Wrote figures and master_table.csv to {args.out_dir}")
    print(table.to_string(index=False))


if __name__ == "__main__":
    main()
