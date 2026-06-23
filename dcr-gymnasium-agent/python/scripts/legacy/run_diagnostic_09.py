"""
Diagnostic gate for graph 09 (Tobias mined "Large Bank Transaction Process",
113 events, L_min_structural=0, L_min_nontrivial=51 -- see compute_lmin.py).

This graph's non-trivial accepting trace requires chaining 51 sequential
events with no terminal reward until the end -- a hard exploration problem
for PPO. Before committing to the full 6-weight x 100k-step sweep (which is
the actual experiment of interest, since MiniZinc cannot enumerate its
Pareto front within 300s), run this single cheap baseline (alpha=0, beta=0,
structural reward only) for a reduced step budget and check whether the
accept rate ever rises above 0 in the last 20% of episodes.

If it does not: don't scale up the budget blindly. Either the entropy
coefficient needs raising further, or this chain length is out of reach for
vanilla PPO + the existing shaping (+2 first-time pending-resolution bonus),
which is itself a reportable finding.

Usage (on the cluster, same conventions as run_experiments.py):
    cd dcr-gymnasium-agent/python
    source .venv/bin/activate
    python scripts/run_diagnostic_09.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from run_experiments import run_experiment, ROOT  # noqa: E402

GRAPH_XML = ROOT / "app" / "public" / "examples" / "diagrams" / "Mined_09_LargeBankTransaction.xml"

exp = {
    "xml_file": str(GRAPH_XML),
    "exp_id": "Mined09_diag",
    "total_steps": 50000,
    # Raised from the established 0.1 default: 113 actions is a much larger
    # action space than any prior graph (Expense Report=5, LoanApp=12,
    # Synthetic Review=14), so extra entropy is needed just to keep exploring
    # long enough to stumble on a 51-step chain at all.
    "ent_coef": 0.2,
}

if __name__ == "__main__":
    assert GRAPH_XML.exists(), f"Graph XML not found: {GRAPH_XML}"
    run_experiment(exp, seed=1, cost_weight=0.0, duration_weight=0.0, expert_budget_k=None)
