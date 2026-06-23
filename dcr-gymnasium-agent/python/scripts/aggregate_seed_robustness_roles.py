"""
Aggregate train_trace_exp_LoanApp_roles_s{1..4}_*.csv across seeds into
seed_robustness_roles.json, the role-conditioned counterpart of
aggregate_seed_robustness.py (sec:loanapp_roles, "Stability across seeds" TODO).

seed=1 reuses the existing unlimited-capacity LoanApp_roles_s1_* traces
(scripts/internal_validation/figures_loanapp_roles.py's LOGS_DIR).
seeds 2-4 come from run_seed_robustness_roles.py, copied locally from the
cluster into SEEDROB_DIR.

Computes the same four metrics as the non-role version, per seed:
  - final_illegal_rate (pooled across the 6 configs)
  - n_pareto_points (front recovered from pooled accepting episodes, last 20%,
    excluding the alpha=0,beta=0 baseline)
  - mean_cost_a1b0, mean_duration_a0b1

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/aggregate_seed_robustness_roles.py
"""
import json
import statistics
from pathlib import Path

from seed_metrics import summarize_run, pareto_front

SEED1_DIR = Path("/Users/sofia/Desktop/loanapp_roles_logs")
SEEDROB_DIR = Path("/Users/sofia/Desktop/loanapp_roles_seedrob_logs")
OUT_DIR = Path(__file__).resolve().parent / "logs" / "generalisation_gap"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]


def weight_tag(alpha, beta):
    return f"a{alpha}_b{beta}".replace(".", "p")


def find_trace(seed, alpha, beta):
    tag = weight_tag(alpha, beta)
    exp_id = f"LoanApp_roles_s{seed}_{tag}"
    search_dir = SEED1_DIR if seed == 1 else SEEDROB_DIR
    matches = sorted(search_dir.glob(f"train_trace_exp_{exp_id}_*.csv"))
    if not matches:
        raise FileNotFoundError(f"No train_trace CSV found for {exp_id} in {search_dir}")
    # pick the most complete file (highest line count) in case of partial
    # leftovers from runs killed mid-training on the cluster.
    matches.sort(key=lambda p: sum(1 for _ in open(p)))
    return matches[-1]


def main():
    per_seed = {}

    for seed in [1, 2, 3, 4]:
        per_config = {}
        illegal_rates = []
        pooled_points = []
        mean_cost_a1b0 = None
        mean_duration_a0b1 = None

        for alpha, beta in PARETO_WEIGHTS:
            trace = find_trace(seed, alpha, beta)
            summary = summarize_run(trace)

            per_config[f"alpha={alpha},beta={beta}"] = {
                "final_illegal_rate": summary["final_illegal_rate"],
                "mean_cost_last20": summary["mean_cost_last20"],
                "mean_duration_last20": summary["mean_duration_last20"],
                "n_accepting_last20": len(summary["accepting_last20_points"]),
            }
            illegal_rates.append(summary["final_illegal_rate"])

            if (alpha, beta) != (0.0, 0.0):
                pooled_points.extend(summary["accepting_last20_points"])

            if (alpha, beta) == (1.0, 0.0):
                mean_cost_a1b0 = summary["mean_cost_last20"]
            if (alpha, beta) == (0.0, 1.0):
                mean_duration_a0b1 = summary["mean_duration_last20"]

        front = pareto_front(pooled_points)

        per_seed[str(seed)] = {
            "per_config": per_config,
            "final_illegal_rate_pooled": sum(illegal_rates) / len(illegal_rates),
            "pareto_points": front,
            "n_pareto_points": len(front),
            "mean_cost_a1b0": mean_cost_a1b0,
            "mean_duration_a0b1": mean_duration_a0b1,
        }

    seeds = [1, 2, 3, 4]

    def mean_std(values):
        return {"mean": statistics.mean(values), "std": statistics.stdev(values)}

    summary = {
        "final_illegal_rate": mean_std([per_seed[str(s)]["final_illegal_rate_pooled"] for s in seeds]),
        "n_pareto_points": mean_std([per_seed[str(s)]["n_pareto_points"] for s in seeds]),
        "mean_cost_a1b0": mean_std([per_seed[str(s)]["mean_cost_a1b0"] for s in seeds]),
        "mean_duration_a0b1": mean_std([per_seed[str(s)]["mean_duration_a0b1"] for s in seeds]),
    }

    out = {"per_seed": per_seed, "summary_across_seeds": summary}

    out_path = OUT_DIR / "seed_robustness_roles.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[OK] Wrote {out_path}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
