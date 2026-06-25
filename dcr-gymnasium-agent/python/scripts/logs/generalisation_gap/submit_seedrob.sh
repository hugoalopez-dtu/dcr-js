#!/bin/bash
### LSF job for seed robustness (tab:seed_variance, sec:policy_generalisation)
###
### Trains ONE (seed, config) pair (the first not-yet-done one, per
### run_seed_robustness.py's is_done() check) and exits. No self-resubmit
### logic here -- chaining is handled externally by submit_seedrob_chain.sh
### via LSF job dependencies (-w "ended(...)"), since the in-job
### self-resubmit pattern is too fragile (no time slack after ~11min
### training within the ~12-13min job kill window, and race conditions
### when multiple jobs check "is another seedrob job running" at the same
### wall-clock time caused a resubmit storm).
#BSUB -J seedrob
#BSUB -q hpc
#BSUB -W 1:00
#BSUB -n 4
#BSUB -R "rusage[mem=8GB] span[hosts=1]"
#BSUB -o seedrob_%J.out
#BSUB -e seedrob_%J.err

set -ex
export PYTHONUNBUFFERED=1
export DCR_SEEDS=4
cd ~/dcr-js
source ~/.nvm/nvm.sh && nvm use 20
cd node-adapter && npm run bundle && cd ..

cd dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/run_seed_robustness.py
echo "[submit_seedrob.sh] python exited with code $?"
