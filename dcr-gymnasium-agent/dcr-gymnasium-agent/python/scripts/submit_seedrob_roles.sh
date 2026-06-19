#!/bin/bash
### LSF job for role-conditioned seed robustness (Chapter 6 sec:loanapp_roles
### "Stability across seeds" TODO). Trains ONE (seed, config) pair (the first
### not-yet-done one, per run_seed_robustness_roles.py's is_done() check) and
### exits. Chained externally by submit_seedrob_roles_chain.sh via LSF job
### dependencies, exactly like submit_seedrob.sh / submit_seedrob_chain.sh
### already do for the (non-role) temporal-holdout seed robustness experiment.
#BSUB -J seedrobroles
#BSUB -q hpc
#BSUB -W 1:00
#BSUB -n 4
#BSUB -R "rusage[mem=8GB] span[hosts=1]"
#BSUB -o seedrobroles_%J.out
#BSUB -e seedrobroles_%J.err

set -ex
export PYTHONUNBUFFERED=1
cd ~/dcr-js
source ~/.nvm/nvm.sh && nvm use 20
cd node-adapter && npm run bundle && cd ..

cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/run_seed_robustness_roles.py
echo "[submit_seedrob_roles.sh] python exited with code $?"
