#!/bin/bash
### LSF job for seed robustness (tab:seed_variance, sec:policy_generalisation)
###
### Same self-resubmitting pattern as submit_gengap.sh: the cluster kills
### jobs after ~12-13 min regardless of -W/-R, so run_seed_robustness.py
### trains ONE (seed, config) pair per invocation (3 seeds x 6 configs = 18
### total) and exits. This script resubmits itself until all 18 are done,
### then runs aggregate_seed_robustness.py.
#BSUB -J seedrob
#BSUB -q hpc
#BSUB -W 24:00
#BSUB -n 4
#BSUB -R "rusage[mem=8GB] span[hosts=1]"
#BSUB -o seedrob_%J.out
#BSUB -e seedrob_%J.err

set -e
cd ~/dcr-js
source ~/.nvm/nvm.sh && nvm use 20
cd node-adapter && npm run bundle && cd ..

cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/run_seed_robustness.py

GAP_DIR=scripts/logs/generalisation_gap
TRAIN_LOGS_DIR=models/scripts/logs
TAGS="a0p0_b0p0 a1p0_b0p0 a0p0_b1p0 a0p5_b0p5 a2p0_b0p5 a0p5_b2p0"
SEEDS="2 3 4"
ALL_DONE=1
for seed in $SEEDS; do
  for tag in $TAGS; do
    if ! ls "$TRAIN_LOGS_DIR"/train_trace_exp_Seed_s${seed}_${tag}_*.csv >/dev/null 2>&1; then
      ALL_DONE=0
      break 2
    fi
  done
done

if [ "$ALL_DONE" -eq 1 ]; then
  python scripts/aggregate_seed_robustness.py
else
  cd ~/dcr-js
  bsub < dcr-gymnasium-agent/dcr-gymnasium-agent/python/scripts/logs/generalisation_gap/submit_seedrob.sh
fi
