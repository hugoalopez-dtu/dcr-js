#!/bin/bash
### Submit the role-conditioned seed robustness training chain as a sequence
### of LSF jobs with explicit dependencies, so exactly one job runs at a
### time. Mirrors submit_seedrob_chain.sh exactly, for the roles experiment.
###
### Run this ONCE from the login node (NOT via bsub):
###   bash submit_seedrob_roles_chain.sh
###
### N defaults to 18 (3 seeds x 6 configs). If a training job finds nothing
### left to do, run_seed_robustness_roles.py exits quickly (no-op), so a few
### extra jobs in the chain are harmless.
set -e
cd ~/dcr-js/dcr-gymnasium-agent/python/scripts

N=${1:-18}

prev_jid=""
for i in $(seq 1 "$N"); do
  if [ -z "$prev_jid" ]; then
    out=$(bsub < submit_seedrob_roles.sh)
  else
    out=$(bsub -w "ended($prev_jid)" < submit_seedrob_roles.sh)
  fi
  echo "$out"
  jid=$(echo "$out" | grep -o '[0-9]\+' | head -1)
  prev_jid=$jid
done

echo "Submitted $N chained jobs, last jid=$prev_jid. No aggregation job queued -- run scripts/aggregate_seed_robustness.py manually (adapted for roles) once all finish."
