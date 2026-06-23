#!/bin/bash
### Submit the seed robustness training chain (tab:seed_variance) as a
### sequence of LSF jobs with explicit dependencies, so exactly one job runs
### at a time -- LSF enforces this, avoiding the resubmit-storm problems of
### the in-job self-resubmit pattern.
###
### Run this ONCE from the login node (NOT via bsub):
###   bash submit_seedrob_chain.sh
###
### It submits N training jobs (each runs ONE not-yet-done (seed,config) via
### submit_seedrob.sh), each depending on the previous one via
### -w "ended(prevjobid)", followed by one aggregation job
### (submit_seedrob_aggregate.sh) depending on the last training job.
###
### N defaults to 16 (3 seeds x 6 configs = 18 total, 2 already done for
### seed=2/a0p0_b0p0 and seed=2/a1p0_b0p0). If a training job finds nothing
### left to do, run_seed_robustness.py exits quickly (no-op), so a few extra
### jobs in the chain are harmless.
set -e
cd ~/dcr-js/dcr-gymnasium-agent/python/scripts/logs/generalisation_gap

N=${1:-16}

prev_jid=""
for i in $(seq 1 "$N"); do
  if [ -z "$prev_jid" ]; then
    out=$(bsub < submit_seedrob.sh)
  else
    out=$(bsub -w "ended($prev_jid)" < submit_seedrob.sh)
  fi
  echo "$out"
  jid=$(echo "$out" | grep -o '[0-9]\+' | head -1)
  prev_jid=$jid
done

agg_out=$(bsub -w "ended($prev_jid)" < submit_seedrob_aggregate.sh)
echo "$agg_out"
