#!/bin/bash
### Final step of the seed robustness chain (tab:seed_variance):
### runs aggregate_seed_robustness.py once all 18 train_trace CSVs exist,
### producing seed_robustness.json. Submitted as the last job in the
### dependency chain by submit_seedrob_chain.sh.
#BSUB -J seedrob_agg
#BSUB -q hpc
#BSUB -W 1:00
#BSUB -n 1
#BSUB -R "rusage[mem=4GB] span[hosts=1]"
#BSUB -o seedrob_agg_%J.out
#BSUB -e seedrob_agg_%J.err

set -e
cd ~/dcr-js/dcr-gymnasium-agent/dcr-gymnasium-agent/python
source .venv/bin/activate
python scripts/aggregate_seed_robustness.py
