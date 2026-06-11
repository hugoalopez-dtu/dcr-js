#!/bin/bash
### LSF job for Analysis 2 (temporal generalisation gap, sec:policy_generalisation)
### Adjust -q/-W/-n to your cluster's queue policy.
#BSUB -J gengap
#BSUB -q hpc
#BSUB -W 24:00
#BSUB -n 4
#BSUB -R "rusage[mem=4GB]"
#BSUB -o gengap_%J.out
#BSUB -e gengap_%J.err

set -e
cd ~/dcr-js
source ~/.nvm/nvm.sh && nvm use 20
cd node-adapter && npm run bundle && cd ..

cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/run_generalisation_gap.py
python scripts/compute_generalisation_gap.py
