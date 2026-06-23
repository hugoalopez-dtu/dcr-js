"""
Aggregate eval_*_calib.csv / eval_*_test.csv produced by run_generalisation_gap.py
into generalisation_gap.json, a scatter figure (calib vs test Pareto fronts),
and a config x metric x gap table.
"""
import csv
import json
import re
from pathlib import Path

import matplotlib.pyplot as plt

GAP_DIR = Path(__file__).resolve().parent / "logs" / "generalisation_gap"

PARETO_WEIGHTS = [
    (0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (0.5, 0.5), (2.0, 0.5), (0.5, 2.0),
]


def dominates(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and (a[0] < b[0] or a[1] < b[1])


def pareto_front(points):
    seen = {}
    for p in points:
        key = (round(p["cost"], 3), round(p["duration"], 3))
        if key not in seen:
            seen[key] = p
    unique = list(seen.values())
    front = []
    for c in unique:
        if not any(dominates((p["cost"], p["duration"]), (c["cost"], c["duration"])) for p in unique if p is not c):
            front.append(c)
    return sorted(front, key=lambda p: p["cost"])


def load_episodes(csv_path: Path):
    if not csv_path.exists():
        return []
    with open(csv_path, newline="") as f:
        return list(csv.DictReader(f))


def summarize(episodes):
    n = len(episodes)
    if n == 0:
        return {"mean_cost": None, "mean_duration": None, "acceptance_rate": None, "pareto_points": []}
    accepting = [e for e in episodes if str(e["accepting"]).strip().lower() in ("true", "1")]
    mean_cost = sum(float(e["episode_cost"]) for e in episodes) / n
    mean_duration = sum(float(e["episode_duration"]) for e in episodes) / n
    acceptance_rate = len(accepting) / n
    points = [{"cost": float(e["episode_cost"]), "duration": float(e["episode_duration"])} for e in accepting]
    return {
        "mean_cost": mean_cost,
        "mean_duration": mean_duration,
        "acceptance_rate": acceptance_rate,
        "pareto_points": pareto_front(points),
    }


def rel_gap(test_val, calib_val):
    if test_val is None or calib_val is None or calib_val == 0:
        return None
    return (test_val - calib_val) / calib_val


def main():
    results = {}
    for alpha, beta in PARETO_WEIGHTS:
        tag = f"a{alpha}_b{beta}".replace(".", "p")
        exp_id = f"GenGap_s1_{tag}"
        calib_eps = load_episodes(GAP_DIR / f"eval_{exp_id}_calib.csv")
        test_eps = load_episodes(GAP_DIR / f"eval_{exp_id}_test.csv")
        calib_summary = summarize(calib_eps)
        test_summary = summarize(test_eps)

        results[f"alpha={alpha},beta={beta}"] = {
            "calibration": calib_summary,
            "test": test_summary,
            "gap": {
                "mean_cost": rel_gap(test_summary["mean_cost"], calib_summary["mean_cost"]),
                "mean_duration": rel_gap(test_summary["mean_duration"], calib_summary["mean_duration"]),
                "acceptance_rate": rel_gap(test_summary["acceptance_rate"], calib_summary["acceptance_rate"]),
                "n_pareto_points": rel_gap(len(test_summary["pareto_points"]), len(calib_summary["pareto_points"])),
            },
        }

    # Pooled (excluding baseline alpha=0,beta=0, consistent with existing convention)
    def pooled(env):
        pts = []
        for k, v in results.items():
            if k == "alpha=0.0,beta=0.0":
                continue
            pts.extend(v[env]["pareto_points"])
        return pareto_front(pts)

    results["pooled"] = {
        "calibration_pareto_points": pooled("calibration"),
        "test_pareto_points": pooled("test"),
    }

    out_json = GAP_DIR / "generalisation_gap.json"
    out_json.write_text(json.dumps(results, indent=2))
    print(f"[OK] Wrote {out_json}")

    # --- Markdown table ---
    rows = ["| Config | Mean cost (calib→test, gap) | Mean duration (calib→test, gap) | Acceptance rate (calib→test, gap) | Pareto points (calib→test) |",
            "|---|---|---|---|---|"]
    for (alpha, beta) in PARETO_WEIGHTS:
        k = f"alpha={alpha},beta={beta}"
        r = results[k]
        c, t, g = r["calibration"], r["test"], r["gap"]

        def fmt(cv, tv, gv, pct=True):
            if cv is None or tv is None:
                return "n/a"
            gap_str = f"{gv*100:+.1f}%" if gv is not None else "n/a"
            return f"{cv:.2f} → {tv:.2f} ({gap_str})"

        rows.append(
            f"| α={alpha}, β={beta} | {fmt(c['mean_cost'], t['mean_cost'], g['mean_cost'])} "
            f"| {fmt(c['mean_duration'], t['mean_duration'], g['mean_duration'])} "
            f"| {fmt(c['acceptance_rate'], t['acceptance_rate'], g['acceptance_rate'])} "
            f"| {len(c['pareto_points'])} → {len(t['pareto_points'])} |"
        )
    (GAP_DIR / "generalisation_gap_table.md").write_text("\n".join(rows) + "\n")
    print(f"[OK] Wrote {GAP_DIR / 'generalisation_gap_table.md'}")

    # --- Scatter figure: calib vs test Pareto fronts (pooled, excl. baseline) ---
    fig, ax = plt.subplots(figsize=(6, 5))
    calib_pts = results["pooled"]["calibration_pareto_points"]
    test_pts = results["pooled"]["test_pareto_points"]
    if calib_pts:
        ax.scatter([p["cost"] for p in calib_pts], [p["duration"] for p in calib_pts],
                    c="#4C72B0", label="Calibration env", marker="o", s=60)
    if test_pts:
        ax.scatter([p["cost"] for p in test_pts], [p["duration"] for p in test_pts],
                    c="#C44E52", label="Test env (held-out)", marker="x", s=60)
    ax.set_xlabel("Episode cost")
    ax.set_ylabel("Episode duration")
    ax.set_title("Pareto front: calibration vs. held-out temporal split")
    ax.legend()
    fig.tight_layout()
    fig_path = GAP_DIR / "generalisation_gap_scatter.png"
    fig.savefig(fig_path, dpi=150)
    print(f"[OK] Wrote {fig_path}")


if __name__ == "__main__":
    main()
