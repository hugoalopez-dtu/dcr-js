# Analysis 2 — Temporal Generalisation Gap (sec:policy_generalisation)

## Setup recap

- Source log: `LoanApp_junior_senior.csv` (1000 cases), sorted by `start_timestamp`.
- Temporal split (no shuffling, no k-fold): **calibration = first 800 cases**, **test = last 200 cases**.
- Per-activity mean duration estimated separately on each split (see `duration_tables.json`, full table below).
- Costs and graph structure (events, conditions/responses, role multipliers) are **identical** in calib and test XMLs — only `<duration>` values differ, derived from the respective split.
- For each of the 6 headline (α, β) configs:
  1. Train PPO from scratch (seed=1, shield ON / Safe RL, 100k timesteps, ent_coef=0.1, same protocol as `run_experiments.py`) on the **calibration**-parameterised graph.
  2. Freeze the policy (`deterministic=True`).
  3. Evaluate 500 episodes against the **calibration** environment.
  4. Evaluate the *same frozen policy* for 500 episodes against the **test** (held-out) environment — no retraining.
- α/β configs: (0,0), (1,0), (0,1), (0.5,0.5), (2,0.5), (0.5,2) — same set as the main Pareto sweep.
- Reward: `r = r_structural - α·cost - β·duration`, STEP_PENALTY=-1.5, MAX_EPISODE_STEPS=300.

## Per-activity duration tables (calibration vs test, mean minutes)

| Activity | Calib mean | Test mean | Δ% |
|---|---|---|---|
| Check application form completeness | 54.52 | 54.22 | -0.5% |
| Appraise property | 240.03 | 259.55 | +8.1% |
| Check credit history | 83.16 | 86.24 | +3.7% |
| AML check | 251.79 | 284.83 | +13.1% |
| Assess loan risk | 178.50 | 163.04 | -8.7% |
| Design loan offer | 18.79 | 21.13 | +12.4% |
| Approve loan offer | 183.36 | 186.91 | +1.9% |
| Approve application | 15.44 | 13.60 | -11.9% |
| Reject application | 28.43 | 29.78 | +4.7% |
| Cancel application | 13.36 | 14.31 | +7.1% |
| Return application back to applicant | 15.70 | 14.41 | -8.2% |
| Applicant completes form | 490.49 | 437.65 | -10.8% |

(Median values also computed and stored in `duration_tables.json`, not used for environment parameterisation — means were used.)

## Per-config results (500 episodes each, deterministic policy)

| Config | Calib: cost / duration / steps / accept% | Test: cost / duration / steps / accept% | Gap cost | Gap duration | Gap accept |
|---|---|---|---|---|---|
| α=0.0, β=0.0 (baseline) | 2307.90 / 914.50 / 6.0 / 100% | 2307.90 / 987.50 / 6.0 / 100% | +0.0% | +8.0% | +0.0% |
| α=1.0, β=0.0 | 1106.70 / 1648.00 / 6.0 / 100% | 1106.70 / 1724.00 / 6.0 / 100% | +0.0% | +4.6% | +0.0% |
| α=0.0, β=1.0 | 3162.00 / 412.00 / 6.0 / 100% | 3162.00 / 431.00 / 6.0 / 100% | +0.0% | +4.6% | +0.0% |
| α=0.5, β=0.5 | 1134.00 / 1624.00 / 6.0 / 100% | 1134.00 / 1703.00 / 6.0 / 100% | +0.0% | +4.9% | +0.0% |
| α=2.0, β=0.5 | 1106.70 / 1648.00 / 6.0 / 100% | 1106.70 / 1724.00 / 6.0 / 100% | +0.0% | +4.6% | +0.0% |
| α=0.5, β=2.0 | 3162.00 / 412.00 / 6.0 / 100% | 3162.00 / 431.00 / 6.0 / 100% | +0.0% | +4.6% | +0.0% |

All 6 configs are fully deterministic: across 500 episodes, `steps` has min=max=mean=6.0 for every config in both calib and test environments — zero variance, single fixed trace per policy.

## Policy collapse — 6 configs → 3 distinct policies

| Distinct policy (calib cost, calib duration) | Configs mapping to it |
|---|---|
| (2307.9, 914.5) — trivial/short trace, baseline only | α=0.0,β=0.0 |
| (1106.7, 1648.0) — cost-minimising trace | α=1.0,β=0.0 ; α=2.0,β=0.5 |
| (1134.0, 1624.0) — near-cost-minimising, slightly cheaper-duration trade | α=0.5,β=0.5 |
| (3162.0, 412.0) — duration-minimising trace | α=0.0,β=1.0 ; α=0.5,β=2.0 |

## Pooled Pareto fronts (excluding baseline α=0,β=0, per existing convention)

**Calibration:**
- (1106.70, 1648.00)
- (1134.00, 1624.00)
- (3162.00, 412.00)

**Test (held-out):**
- (1106.70, 1724.00)
- (1134.00, 1703.00)
- (3162.00, 431.00)

Same 3 points, same dominance ordering, each shifted by +4.6% to +4.9% in duration only. The Pareto front structure (3 non-dominated trade-off points, cost ranging ~1107–3162, duration ranging ~412–1724) is preserved under the temporal split.

## Open items

None outstanding for Analysis 2 — all 6 configs trained, evaluated (calib + test), and aggregated. Raw per-episode CSVs remain on the cluster only (not pulled locally) but are not needed further: zero variance across episodes was confirmed directly above.
