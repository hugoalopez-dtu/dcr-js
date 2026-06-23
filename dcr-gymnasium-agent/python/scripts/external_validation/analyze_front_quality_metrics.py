"""
Front-quality metrics requested by the professor on top of the hypervolume
("Hyperarea") already in the master table: Averaged Hausdorff Distance,
Purity, and the Delta (spacing) metric, computed for every graph where
MiniZinc/COP produced a ground-truth front (i.e. all but graph 09).

Definitions used (standard multi-objective EA literature, e.g. Schutze et al.
2012 for AHD; Zitzler/Deb-style Purity and Delta):

  - Averaged Hausdorff Distance (AHD): with GD(A,B) = mean_{a in A} min_{b in B} ||a-b||
    (Generational Distance, "how far is the recovered front from the truth")
    and IGD(A,B) = GD(B,A) (Inverted GD, "how much of the truth is covered"),
    AHD(A,B) = max(GD(A,B), IGD(A,B)). 0 iff A == B exactly. Objectives are
    min-max normalised to [0,1] (using the union of both fronts' ranges)
    before computing Euclidean distance, so cost and duration contribute on
    comparable scales across graphs of very different absolute magnitude.

  - Purity: fraction of the recovered front's points that remain
    non-dominated when pooled with the ground-truth front. 1.0 iff every
    recovered point is itself Pareto-optimal w.r.t. the true front (it can
    be 1.0 even if the recovered front has fewer points than the truth, or
    if recovered == truth exactly; it drops below 1.0 only if the recovered
    front includes a point the true solver provably beats on every
    objective).

  - Delta (spacing, Deb 2001): measures how evenly the points populate the
    front. Sorted by cost, d_i = Euclidean distance between consecutive
    points (normalised objectives); Delta = sum|d_i - mean(d)| / (n-1) /
    mean(d) when n > 1 -- lower is more even. Undefined (reported as "--")
    for single-point fronts.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/analyze_front_quality_metrics.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_mined_ablation import (
    GRAPH_META, GRAPH_ORDER, load_condition_episodes, last20_per_file,
    unique_accepted_points, pareto_filter,
)

LOGS_ROOT = Path(__file__).resolve().parent / "cluster_results"
OUT_DIR = Path(__file__).resolve().parent
OUT_DIR.mkdir(parents=True, exist_ok=True)


def normalise(points, lo, span):
    return [((p[0] - lo[0]) / span[0] if span[0] else 0.0,
             (p[1] - lo[1]) / span[1] if span[1] else 0.0) for p in points]


def gd(a_norm, b_norm):
    """mean over a of min distance to b."""
    if not a_norm:
        return np.nan
    dists = []
    for pa in a_norm:
        dmin = min(np.hypot(pa[0] - pb[0], pa[1] - pb[1]) for pb in b_norm)
        dists.append(dmin)
    return float(np.mean(dists))


def purity(recovered, truth):
    pooled = list(set(recovered) | set(truth))
    non_dominated_pooled = set(pareto_filter(pooled))
    pure = [p for p in recovered if p in non_dominated_pooled]
    return len(pure) / len(recovered) if recovered else np.nan


def delta_spacing(points):
    if len(points) < 2:
        return np.nan
    pts = sorted(points)
    d = [np.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
         for i in range(len(pts) - 1)]
    mean_d = np.mean(d)
    if mean_d == 0:
        return 0.0
    return float(np.sum(np.abs(np.array(d) - mean_d)) / (len(d) * mean_d))


def main():
    rows = []
    for graph in GRAPH_ORDER:
        meta = GRAPH_META[graph]
        cop = meta["cop_pareto"]
        if not cop:
            rows.append({"graph": meta["label"], "note": "no COP ground truth (timeout)"})
            continue

        eps = load_condition_episodes(LOGS_ROOT, graph, "saferl")
        if eps is None:
            rows.append({"graph": meta["label"], "note": "no saferl data"})
            continue
        last20 = last20_per_file(eps)
        recovered = list(pareto_filter(unique_accepted_points(last20)))

        all_pts = recovered + cop
        lo = (min(p[0] for p in all_pts), min(p[1] for p in all_pts))
        hi = (max(p[0] for p in all_pts), max(p[1] for p in all_pts))
        span = (hi[0] - lo[0], hi[1] - lo[1])

        rec_n = normalise(recovered, lo, span)
        cop_n = normalise(cop, lo, span)

        gd_val = gd(rec_n, cop_n)       # recovered -> truth
        igd_val = gd(cop_n, rec_n)      # truth -> recovered
        ahd = max(gd_val, igd_val)
        pur = purity(recovered, cop)
        delta = delta_spacing(recovered)

        rows.append({
            "graph": meta["label"],
            "recovered_points": len(recovered),
            "cop_points": len(cop),
            "GD (recovered->COP)": round(gd_val, 4),
            "IGD (COP->recovered)": round(igd_val, 4),
            "AHD": round(ahd, 4),
            "Purity": round(pur, 4),
            "Delta": round(delta, 4) if not np.isnan(delta) else "--",
        })

    table = pd.DataFrame(rows)
    table.to_csv(OUT_DIR / "front_quality_metrics.csv", index=False)
    print(table.to_string(index=False))
    print(f"\nWrote {OUT_DIR / 'front_quality_metrics.csv'}")


if __name__ == "__main__":
    main()
