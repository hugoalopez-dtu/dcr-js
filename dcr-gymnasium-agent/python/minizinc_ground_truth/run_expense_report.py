"""
Run Diaz et al. CSP+COP solver on the Expense Report (DcrGraph_Ex2.dzn).
Produces the exact Pareto front for comparison with the RL approach.

Usage:
    cd dcrGraph/source
    python run_expense_report.py
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))

import pymzn_MultiObj_AsFunct as solver

# ── Expense Report — DcrGraph_Ex2.dzn (Diaz et al.) ──────────────────────────
# Features: costs (€), time (minutes)  |  K=5 (max trace length)
expense_report = {
    "K": 5,
    "feats": ["costs", "time"],
    "agg":   ["sumVal", "sumVal"],
    "events": ["dummyEv", "evnt1", "evnt2", "evnt3", "evnt4", "evnt5"],
    "Act":    ["dummyAct", "FillOutExpenseReport", "Approve", "Reject",
               "PayOut", "WithdrawExpenseReport"],
    "InitialM": [
        [False, False, False],   # dummyEv
        [False, True,  False],   # FillOutExpenseReport
        [False, True,  False],   # Approve
        [False, True,  False],   # Reject
        [False, True,  False],   # PayOut
        [False, True,  False],   # WithdrawExpenseReport
    ],
    "conditions": [
        ["evnt1", "evnt4"],  # FillOut  → PayOut
        ["evnt1", "evnt2"],  # FillOut  → Approve
        ["evnt1", "evnt3"],  # FillOut  → Reject
        ["evnt1", "evnt5"],  # FillOut  → Withdraw
        ["evnt2", "evnt4"],  # Approve  → PayOut
    ],
    "responses": [
        ["evnt1", "evnt4"],  # FillOut → PayOut (pending)
        ["evnt1", "evnt2"],  # FillOut → Approve (pending)
        ["evnt3", "evnt2"],  # Reject  → Approve (pending)
    ],
    "inclusions": [
        ["evnt1", "evnt1"],  # FillOut self-includes
    ],
    "exclusions": [
        ["evnt4", "evnt1"], ["evnt4", "evnt2"], ["evnt4", "evnt3"],
        ["evnt4", "evnt4"], ["evnt4", "evnt5"],  # PayOut ends process
        ["evnt5", "evnt1"], ["evnt5", "evnt2"], ["evnt5", "evnt3"],
        ["evnt5", "evnt4"], ["evnt5", "evnt5"],  # Withdraw ends process
    ],
    "l": ["dummyAct", "FillOutExpenseReport", "Approve", "Reject",
          "PayOut", "WithdrawExpenseReport"],
    # cost[event][feature]:  feature 0 = costs (€), feature 1 = time (min)
    "cost": [
        [0,   0   ],   # dummyAct
        [10,  1500],   # FillOutExpenseReport
        [25,  7200],   # Approve
        [30,  7200],   # Reject
        [15,  1800],   # PayOut
        [700, 1200],   # WithdrawExpenseReport
    ],
}

print("=" * 60)
print("Expense Report — Diaz et al. Ex2")
print("Objectives: minimize costs (€) and time (min)")
print("K =", expense_report["K"])
print("=" * 60)

t0 = time.time()
result = solver.solveExtendedDcrGraph(expense_report)
elapsed = time.time() - t0

print(f"\nTotal time: {elapsed:.2f}s")
print(f"Has solution: {result.get('hasSolution')}")
print(f"Number of Pareto-optimal traces: {result.get('numberOfOptimalTraces', '?')}")
print(f"Solve time (MiniZinc): {result.get('modelsExecutionTime', '?'):.3f}s")
print(f"Nodes explored: {result.get('exploredNodes', '?')}")

print("\n── Pareto-optimal traces ──")
for trace in result.get("paretoTraces", []):
    print(trace)
