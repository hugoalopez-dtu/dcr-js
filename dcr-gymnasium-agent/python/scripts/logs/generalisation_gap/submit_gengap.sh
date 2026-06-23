#!/bin/bash
### LSF job for Analysis 2 (temporal generalisation gap, sec:policy_generalisation)
### Adjust -q/-W/-n to your cluster's queue policy.
###
### The cluster appears to kill this job ~12-13 min in regardless of -W,
### memory, etc. Each invocation now trains/evaluates ONE config and exits
### (run_generalisation_gap.py picks the first not-yet-done config). This
### script checks whether all 6 configs are done; if not, it resubmits
### itself for the next config. Once all 6 are done, it runs the final
### aggregation step.
#BSUB -J gengap
#BSUB -q hpc
#BSUB -W 24:00
#BSUB -n 4
#BSUB -R "rusage[mem=8GB] span[hosts=1]"
#BSUB -o gengap_%J.out
#BSUB -e gengap_%J.err

set -e
cd ~/dcr-js
source ~/.nvm/nvm.sh && nvm use 20
cd node-adapter && npm run bundle && cd ..

cd dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/run_generalisation_gap.py

GAP_DIR=scripts/logs/generalisation_gap
TAGS="a0p0_b0p0 a1p0_b0p0 a0p0_b1p0 a0p5_b0p5 a2p0_b0p5 a0p5_b2p0"
ALL_DONE=1
for tag in $TAGS; do
  if [ ! -f "$GAP_DIR/eval_GenGap_s1_${tag}_calib.csv" ] || [ ! -f "$GAP_DIR/eval_GenGap_s1_${tag}_test.csv" ]; then
    ALL_DONE=0
    break
  fi
done

if [ "$ALL_DONE" -eq 1 ]; then
  python scripts/compute_generalisation_gap.py
else
  cd ~/dcr-js
  bsub < dcr-gymnasium-agent/python/scripts/logs/generalisation_gap/submit_gengap.sh
fi
