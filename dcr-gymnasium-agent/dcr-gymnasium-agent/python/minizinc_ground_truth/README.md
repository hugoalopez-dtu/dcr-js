# MiniZinc Ground-Truth Verification Scripts

Backup copy of original scripts written on top of the third-party
`dcrGraph/` clone (`github.com/JuanK120/dcrGraph`, the Diaz et al.
CSP+COP reference implementation), which is itself a nested git repo
excluded from this project's `.gitignore` and therefore was not
backing up these files anywhere.

These run against the model files and pymzn helpers that remain in
`../dcrGraph/source/` (`DcrGraph_Extended.mzn`, `pareto2.mzn`,
`pymzn_MultiObj_AsFunct.py`, `pymzn_multiobj_allsolutions.py`,
`tobias_converter.py`), which are genuinely part of the upstream clone
and stay there. To run any of these scripts, copy them back into
`dcrGraph/source/` (or adjust the relative imports) and use
`dcrGraph/venv` (the MiniZinc/Gecode `minizinc` Python package is
installed there, not in the main project venv).

Key scripts:
- `dcrjs_converter.py` -- parses the DCR-JS engine XML schema (flat
  cost/duration, no roles) into the `extendedGraph` dict consumed by
  `pymzn_MultiObj_AsFunct.solveExtendedDcrGraph`.
- `run_loanapp_ground_truth.py` -- runs the CSP+COP solver on the
  flat LoanApp graph; confirms the RL-recovered minimum-cost Pareto
  point against the exact solver (Chapter 6, sec:loanapp_pareto).
- `run_graph09_incumbent.py` -- deadline-aware enumeration pattern
  (retains best incumbent instead of hanging indefinitely), reused by
  `run_loanapp_ground_truth.py`.
- `run_tobias_sweep.py`, `tobias_converter.py` (stays in `dcrGraph/`) --
  ground truth over the mined-graph suite (Chapter 8, external
  validation).
