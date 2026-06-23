"""
Aggregate train_trace_exp_*.csv across seeds 1-4 into seed_robustness.json
for tab:seed_variance (sec:policy_generalisation).

seed=1 reuses the existing GenGap_s1_* training traces from Analysis 2.
seeds 2-4 come from run_seed_robustness.py (Seed_s{seed}_* traces).

For each seed, computes:
  - final_illegal_rate: mean illegal_traces_ratio over the last decile of
    episodes, per config, plus a pooled mean across the 6 configs.
  - n_pareto_points: size of the Pareto front recovered from the pooled
    accepting episodes of the last 20% of training, across the 5
    non-baseline configs (excluding alpha=0,beta=0, per existing convention).
  - mean_cost_a1b0: mean episode_cost over accepting episodes (last 20%) for
    alpha=1.0, beta=0.0.
  - mean_duration_a0b1: mean episode_duration over accepting episodes
    (last 20%) for alpha=0.0, beta=1.0.

Then reports mean +/- (sample) std across the 4 seeds for these 4 metrics.
"""
import json
import statistics
from pathlib import Path

from seed_metrics import summarize_run, pareto_front

PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
TRAIN_LOGS_DIR = PYTHON_PROJECT_DIR / "models" / "scripts" / "logs"
GAP_DIR = Path(__file__).resolve().parent / "logs" / "generalisation_gap"

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


def find_trace(exp_id):
    matches = sorted(TRAIN_LOGS_DIR.glob(f"train_trace_exp_{exp_id}_*.csv"))
    if not matches:
        raise FileNotFoundError(f"No train_trace CSV found for {exp_id} in {TRAIN_LOGS_DIR}")
    return matches[-1]


def seed_exp_id(seed, alpha, beta):
    tag = weight_tag(alpha, beta)
    if seed == 1:
        return f"GenGap_s1_{tag}"
    return f"Seed_s{seed}_{tag}"


def main():
    per_seed = {}

    for seed in [1, 2, 3, 4]:
        per_config = {}
        illegal_rates = []
        pooled_points = []
        mean_cost_a1b0 = None
        mean_duration_a0b1 = None

        for alpha, beta in PARETO_WEIGHTS:
            exp_id = seed_exp_id(seed, alpha, beta)
            trace = find_trace(exp_id)
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

    out_path = GAP_DIR / "seed_robustness.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[OK] Wrote {out_path}")


if __name__ == "__main__":
    main()
