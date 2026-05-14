# Thesis Status (last updated: 2026-05-14)

**Title:** Multi-objective Optimisation of Business Processes via Reinforcement Learning
**Institution:** DTU (Technical University of Denmark)
**Key reference:** Diaz, López, Quesada, Rosero — "Pareto-Optimal Trace Generation from Declarative Process Models", DEC2H 2023. They use CSP+COP in MiniZinc; this thesis uses RL as a scalable alternative.

---

## Experimental Results

### Experiment 1 — Prescribe Medicine (small graph, pipeline validation)
- 4 events, L_min ≈ 3
- Result: 1 Pareto point — confirms the end-to-end pipeline works
- Conclusion: graph too simple for real trade-offs; useful only as a sanity check

### Experiment 2 — BPI Challenge 2017 Offer log (X10)
- L_min = 3, graph mined from real event log
- Result: trivial acceptance (agent reaches acceptance in 1–2 steps)
- Cause: empty pendingResponses in mined DCR graphs
- Conclusion: **discarded** — mined graphs not suitable without manual modification

### Experiment 3 — RequestForPayment (X12)
- L_min = 1
- Result: trivial acceptance in 1 step
- Conclusion: **discarded** — L_min too low

### Experiment 4 — Synthetic Review (X51) — main experiment ✓
- 14 events, L_min = 11, 4118 trace variants
- Cost/duration design v2 (designed to force trade-offs):
  - get review 1: cost=80, duration=5 (expensive, fast reviewer)
  - get review 2/3: cost=0, duration=60 (free, slow)
  - get review X: cost=0, duration=90
  - time-out 1/2/3/X: cost=5, duration=90
  - invite reviewers: cost=10, duration=5
  - collect reviews: cost=10, duration=10
  - decide: cost=20, duration=15
  - accept/reject: cost=0, duration=5
- Training: PPO (Stable Baselines 3), 6 weight pairs (α,β): (0,0),(1,0),(0,1),(0.5,0.5),(2,0.5),(0.5,2)
- Reward: r = r_structural - α·cost - β·duration
- **2 Pareto points found**, both from α=0.0 β=1.0:
  - cost=35, duration=325, steps=8 (time-out path)
  - cost=110, duration=145, steps=6 (uses get review 1)
  - Trade-off: paying +75 cost saves 180 duration — real trade-off confirmed ✓

---

## Sections Written
- None formally written yet — still in experimental phase

---

## Pending

### Experiments
- [ ] Find additional graphs from tutor's PDF with L_min ≥ 5 to train with cost/duration
- [ ] Design cost/duration for those new graphs and run training
- [ ] Evaluate whether new graphs produce richer Pareto fronts (more than 2 points)

### Model Extensions (agreed with supervisor)
- [ ] Add **roles** to EDCR model: cost/duration per (event, role) — e.g. student vs senior
  - Agent will choose which event to execute AND which role executes it
  - Expands action space: event × role
  - Priority: MEDIUM-HIGH (next few weeks)
- [ ] **Agent capacity** (calendars, bottlenecks) — supervisor's idea for future work
  - Each agent has X hours/week; overload → reassignment to another (possibly more expensive) agent
  - Too complex for current TFM scope
  - Priority: future work / conclusions section

### Writing
- [ ] Introduction
- [ ] Related Work (centred on Diaz et al. 2023 and RL for BPM)
- [ ] Methodology (EDCR model, reward shaping, PPO setup)
- [ ] Experiments & Results
- [ ] Conclusions & Future Work

---

## Design Decisions

- **Discarded mined graphs from real event logs** — empty pendingResponses cause trivial acceptance
- **Graph selection criterion: L_min ≥ 5** — minimum trace length must be long enough for the agent to face real decisions
- **Excluded baseline (α=0,β=0) from Pareto computation** — trivially dominates with shortest paths
- **Convergence detection via rolling std/mean ratio** (window=500, threshold=0.05) before filtering traces for Pareto
- **Discarded A3C** — PPO is more stable in small discrete environments like DCR graphs
- **Cost design v2** — in v1 all reviews had the same cost → all (α,β) pairs converged to the same point (cost=40, duration=135), 0 trade-offs; v2 introduces deliberate asymmetry between reviewers

---

## Infrastructure

- Training: DTU HPC cluster (`s252277@login.hpc.dtu.dk`)
- Logs: `~/dcr-js/dcr-gymnasium-agent/.../scripts/logs/`
- Analysis notebook: `dcr-gymnasium-agent/.../scripts/analysis.ipynb`
- Repo: `Sofiaortizarce/dcr-js`, active branch `feature/cost-duration-ui`
- Modeller UI: robot button → POST /load → node adapter → `staging/current_graph.xml`
