"""
Full Pareto weight sweep for graph 09, run AFTER run_diagnostic_09.py shows a
rising accept rate. No expert-budget-k loop here: this graph has no roles,
so that axis doesn't apply (kept separate from run_experiments.py's
LoanApp_roles k-sweep on purpose, to avoid touching that active experiment).

Usage:
    cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
    source .venv/bin/activate
    python scripts/run_full_sweep_09.py [--steps 100000]
"""
import sys
import time
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from run_experiments import run_experiment, ROOT, PARETO_WEIGHTS  # noqa: E402

GRAPH_XML = ROOT / "app" / "public" / "examples" / "diagrams" / "Mined_09_LargeBankTransaction.xml"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=100_000)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    assert GRAPH_XML.exists(), f"Graph XML not found: {GRAPH_XML}"
    exp = {
        "xml_file": str(GRAPH_XML),
        "exp_id": "Mined09_LargeBank",
        "total_steps": args.steps,
        "ent_coef": 0.2,
    }
    for cost_w, dur_w in PARETO_WEIGHTS:
        run_experiment(exp, seed=args.seed, cost_weight=cost_w, duration_weight=dur_w,
                        expert_budget_k=None)
        time.sleep(2)


if __name__ == "__main__":
    main()
