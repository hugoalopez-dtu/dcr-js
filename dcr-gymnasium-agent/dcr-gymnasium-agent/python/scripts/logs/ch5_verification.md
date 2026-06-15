# Chapter 5 Verification Report

Working directory: `/Users/sofia/dcr-js` (branch `feature/cost-roles`). Read-only investigation.

---

## 1. Training budget (timesteps) per experiment

File: `dcr-gymnasium-agent/dcr-gymnasium-agent/python/scripts/run_experiments.py`

The `EXPERIMENTS` list (lines 52-140) defines all configured runs. Most entries are commented out; **only one experiment is currently active**:

```python
# --- Loan Application — Kirchdorfer et al. (BPM 2026), Junior/Expert roles ---
{
    "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml"),
    "exp_id": "LoanApp_roles",
    "total_steps": int(os.environ.get("DCR_STEPS", 100000)),
    "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
},
```
(`run_experiments.py:70-75`)

This is the **LoanApp_junior_senior** ablation (Chapter 6 roles experiment) and runs with **`total_steps = 100000`** (via `DCR_STEPS` env var, default 100000).

The Expense Report and (no-roles) Loan Application experiments are commented out (`run_experiments.py:53-67`):

```python
# {
#     "xml_file": ... "Expense_Report_Diaz.xml",
#     "exp_id": "ExpenseReport_Diaz",
#     "total_steps": int(os.environ.get("DCR_STEPS", 100000)),
#     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
# },

# {
#     "xml_file": ... "Loan_Application_Diaz.xml",
#     "exp_id": "LoanApp_Diaz",
#     "total_steps": int(os.environ.get("DCR_STEPS", 50000)),
#     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
# },
```
(`run_experiments.py:54-67`)

Git history of `run_experiments.py` shows the evolution of the `ExpenseReport_Diaz` default:

- `d43212f` — "Add Loan Application DCR (Diaz et al.) and switch experiment to LoanApp_Diaz" — original default was 30000.
- `241e090` — "Reduce LoanApp_Diaz steps to 50k (simpler graph, L_min=3)" — LoanApp_Diaz set to 50000.
- `f049ea7` — "Increase ExpenseReport_Diaz steps to 100k for better convergence" — changed `ExpenseReport_Diaz` default from `30000` → `100000`:

```diff
-        "total_steps": int(os.environ.get("DCR_STEPS", 30000)),
+        "total_steps": int(os.environ.get("DCR_STEPS", 100000)),
```
(diff of `run_experiments.py`, commit `f049ea7`)

- `b1db123` — "Activate LoanApp_roles experiment; add LoanApp_junior_senior.xml with costs and Junior/Expert roles" — this commit comments out both the Expense Report and LoanApp_Diaz blocks and activates `LoanApp_roles` with `total_steps=100000` (current state, line 73).

**Resolving the discrepancy:** the thesis-text claim "Expense=100k, Loan=50k" describes an *intermediate* state of the codebase (after `f049ea7` but before `b1db123`): at that point ExpenseReport_Diaz=100k and LoanApp_Diaz (no-roles)=50k were both configured (though it's unclear whether LoanApp_Diaz at 50k was ever actually executed to completion — see note below). The **currently active / actually-run-for-the-ablation configuration (LoanApp_junior_senior, "LoanApp_roles")** uses **100000**, set in `b1db123` and unchanged since.

No other config/yaml/json files override `total_steps`; `train_agent.py --steps` (line 271, default 30000) is fed directly from `run_experiments.py`'s `total_steps` (line 223: `steps = int(exp["total_steps"])`, passed at line 277 `"--steps", str(steps)`).

> **VERDICT (§1):** Expense Report = 100,000 (per `run_experiments.py` commit `f049ea7`, though this experiment block is now commented out / not the active config); Loan Application WITHOUT roles = 50,000 (per `run_experiments.py` commit `241e090`, also now commented out); Loan Application WITH roles (LoanApp_junior_senior / "LoanApp_roles", the currently active experiment and the one used in the Chapter 6 ablation) = **100,000** (`run_experiments.py:73`). The thesis "Expense=100k, Loan=50k" line describes an earlier codebase state; the actual ablation graph (LoanApp_junior_senior) used 100k, not 50k — confirming the known discrepancy.

---

## 2. MAX_EPISODE_STEPS per experiment

Default in node-adapter: `node-adapter/src/server.ts:33`:
```ts
const MAX_EPISODE_STEPS = Number(process.env.MAX_EPISODE_STEPS || 100);
```
Used for truncation at `server.ts:220`:
```ts
const maxStepReached = episodeSteps >= MAX_EPISODE_STEPS;
```

However, `run_experiments.py` — the script that drives **all** of the EXPERIMENTS entries (Expense Report, LoanApp_Diaz, and the active LoanApp_roles) — explicitly overrides this env var for **every** run:

```python
env["MAX_EPISODE_STEPS"] = "300"
```
(`run_experiments.py:242`, inside `run_experiment()`, applied unconditionally before launching the node adapter subprocess)

This means **every experiment launched via `run_experiments.py` (Expense Report, LoanApp without roles, LoanApp_junior_senior with roles) uses `MAX_EPISODE_STEPS=300`**, not the server-side default of 100.

The "generalisation gap" run (`run_generalisation_gap.py:93`) and the seed-robustness run (`run_seed_robustness.py:90`) and the ablation script (`run_ablation.py:54,98`) also set `MAX_EPISODE_STEPS=300` — i.e. 300 is used consistently across the *entire* family of run scripts, not just the "generalisation" run. The 100 default in `server.ts:33` is therefore effectively never used in any of the documented experiments; it would only apply if the node adapter were started manually without setting `MAX_EPISODE_STEPS`.

This matches the prior finding recorded in `dcr-gymnasium-agent/dcr-gymnasium-agent/python/scripts/logs/ch4_verification.md:206`:
> `MAX_EPISODE_STEPS` env var, default `100` (server.ts:33); set to `300` in the Analysis 2 / generalisation-gap runs.

That ch4 note frames 300 as specific to "generalisation-gap runs," but the evidence here (`run_experiments.py:242`) shows 300 is also the value used for the main Chapter 5/6 experiments (Expense Report, LoanApp no-roles, LoanApp_roles) — i.e. 300 is the universal value across all run scripts found in the repo, and the "default 100" is essentially a server-side fallback that is overridden everywhere it matters.

> **VERDICT (§2):** All three experiments (Expense Report, LoanApp without roles, LoanApp_junior_senior with roles) use **MAX_EPISODE_STEPS = 300** via `run_experiments.py:242` (`env["MAX_EPISODE_STEPS"] = "300"`), not the server.ts default of 100. The 100 default (`server.ts:33`) is not used by any run-script-driven experiment found in this repo.

---

## 3. Are LoanApp base durations derived from the event log?

**`LoanApp_junior_senior.xml`** location: `app/public/examples/diagrams/LoanApp_junior_senior.xml`.

Extracted `<cost>`/`<duration>` per event (lines 6-125), with label mappings (lines 143-154):

| Event | Label | XML cost | XML duration |
|---|---|---|---|
| Event_1 | Check application form completeness | 76 | 55 |
| Event_2 | Appraise property | 509 | 244 |
| Event_3 | Check credit history | 118 | 84 |
| Event_4 | AML check | 539 | 258 |
| Event_5 | Assess loan risk | 318 | 175 |
| Event_6 | Design loan offer | 35 | 19 |
| Event_7 | Approve loan offer | 767 | 184 |
| Event_8 | Approve application | 20 | 15 |
| Event_9 | Reject application | 40 | 29 |
| Event_10 | Cancel application | 20 | 14 |
| Event_11 | Return application back to applicant | 21 | 15 |
| Event_12 | Applicant completes form | 1 | 478 |

**No `<roleOptions>` elements exist anywhere in `LoanApp_junior_senior.xml`** (`grep -c "roleOptions"` → 0). Instead, the file defines **global role multipliers** (`LoanApp_junior_senior.xml:158-161`):

```xml
<roles>
  <role name="Junior" costMultiplier="0.7" durationMultiplier="2.0"/>
  <role name="Expert" costMultiplier="2.0" durationMultiplier="0.5"/>
</roles>
```

These multiply the base `<cost>`/`<duration>` values above (per the comment at `LoanApp_junior_senior.xml:156-157`: "Global role multipliers: effective_cost = base_cost × costMultiplier, effective_duration = base_duration × durationMultiplier"). This is a **different mechanism** from the per-event `<roleOptions>` design described in `CLAUDE.md` (which applies to `Synthetic_review_roles.xml`, not LoanApp).

**`LoanApp_junior_senior.csv` event log — NOT FOUND.** A repo-wide search (`find ... -iname "*.csv"` filtered for "loan") returned no results. The only LoanApp-related files in `dcr-gymnasium-agent/.../scripts/` are `analysis_loanapp.ipynb`, `analysis_loanapp_roles.ipynb`, and `cost_loanapp.png` (plus generalisation-gap calibration/test XMLs under `scripts/logs/generalisation_gap/`). Neither analysis notebook references any `.csv` file containing "loan" in its name (checked via `grep -o '"[^"]*\.csv"'` over both notebooks — zero matches).

Because the source CSV event log does not exist in this repo checkout, the per-activity mean-duration comparison requested in the task **cannot be computed** — there is nothing to compute it from. No throwaway Python analysis was performed since there is no input data.

Given the absence of any event-log CSV, and the presence of hand-written `<cost>`/`<duration>` values plus a hand-authored global role-multiplier table (with a code comment explicitly describing the multiplier formula), the most defensible conclusion is that **both costs and durations in `LoanApp_junior_senior.xml` are hand-assigned**, not derived from a mined event log. (The graph's title — "Loan Application (Kirchdorfer et al. — Junior/Expert roles)" — and the absence of any log file in the repo are consistent with this being a literature-derived/synthetic graph with manually authored cost/duration parameters, possibly adapted from the Kirchdorfer et al. paper's published figures rather than from a raw log file checked into this repo.)

> **VERDICT (§3):** Cannot confirm "durations = log means" — **no `LoanApp_junior_senior.csv` event log exists anywhere in the repo**, so the XML-vs-CSV duration comparison could not be performed (GAP). Costs: **hand-assigned** (no cost column possible to check against, since no CSV exists; XML costs + global role-multiplier table at `LoanApp_junior_senior.xml:158-161` are manually authored values, not derived from `roleOptions`/per-event log statistics as described for the Synthetic Review graph).

---

## 4. The "1,000 episodes" evaluation claim

Searched `train_agent.py`, `run_experiments.py`, `run_ablation.py`, `run_generalisation_gap.py`, `run_seed_robustness.py` for a post-training evaluation loop (e.g., `model.predict` in a loop over N episodes, `evaluate_policy`, or any `for ... in range(1000)` construct).

`train_agent.py` (full file read, lines 1-295):
- Defines `StepDebugCallback` (lines 24-196), which logs **every training step** to `train_trace_{run_name}.csv` (line 225) during `model.learn(...)` (lines 257-261).
- After `model.learn()` completes, the script **only saves the model** (`model.save(...)`, line 264) and exits. There is **no `evaluate_policy` call, no `model.predict` loop, and no post-training episode-rollout loop** anywhere in this file.
- No import of `stable_baselines3.common.evaluation.evaluate_policy`.

`run_experiments.py` (full file read, lines 1-360): only orchestrates training subprocess calls and extracts TensorBoard scalars (`rollout/ep_rew_mean`, `rollout/ep_len_mean`, `train/explained_variance` — `TB_TAGS`, lines 144-148). No evaluation-episode loop.

No standalone "eval" script (e.g., `evaluate.py`, `run_eval.py`) was found in `dcr-gymnasium-agent/dcr-gymnasium-agent/python/`.

This confirms the alternative hypothesis: per `CLAUDE.md`'s "Analysis Notebook" section, the analysis notebook's cell 4 (`box_last_20pct`, ID `fc64bdf4`) computes box plots of cost/duration from **the final 20% of TRAINING episodes** (drawn from the `train_trace_*.csv` files written by `StepDebugCallback` during `model.learn`), and the Pareto scatter (cell 5, `b5eaecc4`, `find_convergence_timestep`) similarly operates on training-trace data, not a separate evaluation rollout. There is no evidence of any "run the trained policy for 1,000 fresh episodes" step — all reported cost/duration/Pareto statistics derive from the **tail of the training run itself** (last 20% of training episodes, post-convergence).

> **VERDICT (§4):** No 1,000-episode (or any post-training) evaluation loop exists in `train_agent.py`, `run_experiments.py`, or any other script in the repo. The reported Pareto front / cost-duration statistics are computed from the **last 20% of TRAINING episodes** in `train_trace_*.csv` (via the analysis notebook's `box_last_20pct` / Pareto-scatter cells), not from a separate 1,000-episode evaluation.

---

## 5. Observation / action space dimensions per benchmark

`dcr_env.py` (`dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/envs/dcr_env.py`), constructor lines 36-58:

```python
self.event_role_pairs = init.get("eventRolePairs") or [{"event": ev, "role": ""} for ev in events]
self.roles = init.get("roles", [])
self.n_roles = init.get("nRoles", 1)

n_events = len(self.event_list)
n_actions = len(self.event_role_pairs)
obs_dim = n_events * 3  # observation stays per-event: included/executed/pending
self.observation_space = spaces.Box(low=0, high=1, shape=(obs_dim,), dtype=np.int8)
self.action_space = spaces.Discrete(n_actions)
```
(lines 46-54)

The server (`node-adapter/src/server.ts`) builds `eventRolePairs` via `getEventRolePairs()` (lines 67-78): if the graph has **no roles** (`getRoles()` returns empty, line 62-63: `Object.keys(graph.roleMultipliers || {}).sort()`), pairs = one per event (role=""); if roles exist, pairs = **all events × all roles**.

### Expense Report (`app/public/examples/diagrams/Expense_Report_Diaz.xml`)
- Events (lines 6, 16, 26, 36, 46 — `E_fillout`, `E_approve`, `E_reject`, `E_payout`, `E_withdraw`): **5 events**.
- No `<roles>` element in this XML (not checked explicitly but Expense_Report_Diaz is the original cost/duration-only graph per CLAUDE.md "feature/cost-duration-ui" — role multipliers were introduced for LoanApp/Synthetic Review only).
- `n_events = 5` → `obs_dim = 5 * 3 = 15`
- `n_actions = 5` (no roles → 1 pair per event) → `action_space = Discrete(5)`

### LoanApp_junior_senior (`app/public/examples/diagrams/LoanApp_junior_senior.xml`)
- Events Event_1..Event_12 (lines 6-125): **12 events**.
- Global `<roles>` block (lines 158-161) defines **2 roles**: "Junior", "Expert" (no "System"/3rd role here — unlike the Synthetic_review_roles 3-role design described in CLAUDE.md).
- `getRoles()` → `["Expert", "Junior"]` (sorted, 2 roles) → `getEventRolePairs()` produces 12 events × 2 roles = **24 pairs**.
- `n_events = 12` → `obs_dim = 12 * 3 = 36`
- `n_actions = 24` → `action_space = Discrete(24)`

Note: this differs from the CLAUDE.md "Roles Extension" description (event × role via per-event `<roleOptions>`, 3 roles: Expert/Junior/System, 14 events × 3 = 42 actions for Synthetic Review). LoanApp_junior_senior uses the **global role-multiplier** mechanism (2 roles: Junior/Expert) rather than per-event `<roleOptions>` (3 roles), giving 12 × 2 = 24 actions, not 12 × 3 = 36.

> **VERDICT (§5):** Expense Report — obs_dim=15 (5 events × 3), action_space=Discrete(5) (no roles). LoanApp_junior_senior — obs_dim=36 (12 events × 3), action_space=Discrete(24) (12 events × 2 global roles: Junior, Expert — not 3 roles as the generic CLAUDE.md roles description implies).

---

## 6. SB3 version

File: `dcr-gymnasium-agent/dcr-gymnasium-agent/python/requirements.txt` (full contents, 7 lines):

```
gymnasium
stable-baselines3
sb3-contrib
tensorboard
torch
requests
numpy
```

**No version is pinned** — `stable-baselines3` (line 2) has no version specifier at all (not even `>=`).

> **VERDICT (§6):** No SB3 version is pinned in `requirements.txt` (`stable-baselines3` listed unversioned at line 2) — GAP, exact version used cannot be determined from the repo alone (would require checking the installed environment / lockfile on the HPC cluster, none of which is present in this checkout).

---

## 7. LoanApp relation table

Source: `app/public/examples/diagrams/LoanApp_junior_senior.xml`, `<constraints>` block (lines 169-904). XML tag names used: `<conditions><condition sourceId=... targetId=...>` (lines 170-442), `<responses><response sourceId=... targetId=...>` (lines 443-579), `<coresponces/>` (empty, line 580), `<excludes><exclude sourceId=... targetId=...>` (lines 581-899), `<includes/>` (empty, line 900), `<milestones/>` (empty, line 901).

Label mapping (event ID → activity name) from lines 143-154:
Event_1=Check application form completeness, Event_2=Appraise property, Event_3=Check credit history, Event_4=AML check, Event_5=Assess loan risk, Event_6=Design loan offer, Event_7=Approve loan offer, Event_8=Approve application, Event_9=Reject application, Event_10=Cancel application, Event_11=Return application back to applicant, Event_12=Applicant completes form.

### Conditions (23 total, lines 171-441)

| Source | Target | Relation |
|---|---|---|
| Event_1 | Event_2 | condition |
| Event_1 | Event_3 | condition |
| Event_1 | Event_4 | condition |
| Event_2 | Event_5 | condition |
| Event_3 | Event_5 | condition |
| Event_4 | Event_5 | condition |
| Event_12 | Event_5 | condition |
| Event_5 | Event_6 | condition |
| Event_1 | Event_6 | condition |
| Event_6 | Event_7 | condition |
| Event_2 | Event_7 | condition |
| Event_3 | Event_7 | condition |
| Event_4 | Event_7 | condition |
| Event_7 | Event_8 | condition |
| Event_1 | Event_8 | condition |
| Event_5 | Event_8 | condition |
| Event_5 | Event_9 | condition |
| Event_11 | Event_9 | condition |
| Event_7 | Event_10 | condition |
| Event_1 | Event_10 | condition |
| Event_5 | Event_10 | condition |
| Event_1 | Event_11 | condition |
| Event_11 | Event_12 | condition |

### Responses (11 total, lines 444-578)

| Source | Target | Relation |
|---|---|---|
| Event_1 | Event_2 | response |
| Event_1 | Event_3 | response |
| Event_1 | Event_4 | response |
| Event_2 | Event_5 | response |
| Event_3 | Event_5 | response |
| Event_4 | Event_5 | response |
| Event_6 | Event_7 | response |
| Event_11 | Event_12 | response |
| Event_12 | Event_1 | response |
| Event_12 | Event_5 | response |
| Event_12 | Event_9 | response |

### Excludes (27 total, lines 582-898)

| Source | Target | Relation |
|---|---|---|
| Event_2 | Event_11 | exclude |
| Event_2 | Event_12 | exclude |
| Event_3 | Event_11 | exclude |
| Event_3 | Event_12 | exclude |
| Event_4 | Event_11 | exclude |
| Event_4 | Event_12 | exclude |
| Event_5 | Event_1 | exclude |
| Event_6 | Event_9 | exclude |
| Event_6 | Event_2 | exclude |
| Event_6 | Event_3 | exclude |
| Event_6 | Event_4 | exclude |
| Event_7 | Event_5 | exclude |
| Event_8 | Event_10 | exclude |
| Event_8 | Event_6 | exclude |
| Event_9 | Event_6 | exclude |
| Event_9 | Event_7 | exclude |
| Event_9 | Event_8 | exclude |
| Event_9 | Event_10 | exclude |
| Event_9 | Event_3 | exclude |
| Event_9 | Event_2 | exclude |
| Event_9 | Event_4 | exclude |
| Event_10 | Event_8 | exclude |
| Event_10 | Event_6 | exclude |
| Event_11 | Event_6 | exclude |
| Event_11 | Event_7 | exclude |
| Event_11 | Event_8 | exclude |
| Event_11 | Event_10 | exclude |

(27 `<exclude ...>` entries, `Relation_35` through `Relation_61`.)

### Includes / Milestones / Coresponses

`<includes/>` (line 900), `<milestones/>` (line 901), and `<coresponces/>` (line 580) are all **empty self-closing tags** — 0 relations of each type.

### Totals

- conditions: 23 (`Relation_1` through `Relation_23`)
- responses: 11 (`Relation_24` through `Relation_34`)
- excludes: 27 (`Relation_35` through `Relation_61`)
- includes: 0
- milestones: 0
- coresponces (co-responses): 0

> **VERDICT (§7):** 23 conditions, 11 responses, 27 excludes, 0 includes, 0 milestones, 0 co-responses (total 61 relations, `Relation_1`–`Relation_61`).
