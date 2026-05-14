# DCR-JS — TFM Project Context

**Thesis:** "Multi-objective Optimisation of Business Processes via Reinforcement Learning" (DTU)

## Methodology

- DCR graphs extended with cost/duration per event (EDCR model, Diaz et al. DEC2H 2023)
- PPO agent (Stable Baselines 3), scalarized reward: `r = r_structural - α·cost - β·duration`
- Weight sweep over 6 (α,β) pairs: (0,0), (1,0), (0,1), (0.5,0.5), (2,0.5), (0.5,2)
- Post-training: extract Pareto front from accepting episode traces
- Reference: Diaz et al. use CSP+COP in MiniZinc — this thesis uses RL as a scalable alternative

## Main Test Graph — Synthetic Review (X51)

14 events, L_min=11, 4118 trace variants. Cost/duration design (v2):

| Event | cost | duration |
|---|---|---|
| get review 1 | 80 | 5 (expensive, fast) |
| get review 2/3 | 0 | 60 (free, slow) |
| get review X | 0 | 90 |
| time-out 1/2/3/X | 5 | 90 |
| invite reviewers | 10 | 5 |
| collect reviews | 10 | 10 |
| decide | 20 | 15 |
| accept/reject | 0 | 5 |

**Graph selection rule:** only use graphs with L_min ≥ 5. Graphs with L_min=1 produce trivial acceptance (no real trade-off). Mined DCR graphs from event logs have empty pendingResponses → trivial acceptance.

## Current Results (Synthetic Review v2)

2 Pareto points, both from α=0.0 β=1.0 (pure duration minimiser):
- `cost=35, duration=325, steps=8` — uses time-out path
- `cost=110, duration=145, steps=6` — uses get review 1 (fast expensive reviewer)

Trade-off confirmed: paying +75 cost saves 180 duration.

## Analysis Notebook

`dcr-gymnasium-agent/dcr-gymnasium-agent/python/scripts/analysis.ipynb`

| Cell | ID | Content |
|---|---|---|
| 1 | 8432db60 | imports, `load_data`, COLORS config — set `LOGS_DIR` |
| 2 | fda2550d | summary table: accept_rate, cost_final, duration_final per weight pair |
| 3 | 765da72c | `plot_reward_normalized` — X axis 0–100% training progress |
| 4 | fc64bdf4 | `box_last_20pct` — box plots cost/duration, last 20% of episodes |
| 5 | b5eaecc4 | Pareto scatter — `find_convergence_timestep`, excludes baseline |
| 6 | 9dd1ae2e | `load_episode_sequence` — step-by-step event sequences for Pareto traces |

Key analysis decisions:
- Exclude baseline (α=0,β=0) from Pareto computation — trivially short paths dominate
- `find_convergence_timestep` uses rolling std/mean ratio with window=500, threshold=0.05
- Logs path on local Mac: `/Users/sofia/Desktop/synthetic_review_logs`

## Infrastructure

- **HPC cluster:** `s252277@login.hpc.dtu.dk` — training runs, logs in `~/dcr-js/.../scripts/logs/`
- **SSH tunnel:** port 5001, connects browser → cluster node adapter
- **Node adapter:** `node-adapter/src/server.ts`, `/load` endpoint persists XML to `staging/current_graph.xml`
- **Modeler UI:** robot button sends current graph to node adapter via POST /load
- **Remotes:** `origin` = hugoalopez-dtu/dcr-js (no push access), `mine` = Sofiaortizarce/dcr-js
- **Active branch:** `feature/cost-duration-ui`
- **Cluster git tip:** set `GIT_TMPDIR=/tmp` before git pull (disk nearly full)

## Thesis Framing

Contribution: (1) DCR modeler extended with cost/duration UI, (2) reward shaping for multi-objective RL, (3) empirical evaluation on Synthetic Review showing RL+scalarization finds Pareto trade-offs when graph structure allows it.
