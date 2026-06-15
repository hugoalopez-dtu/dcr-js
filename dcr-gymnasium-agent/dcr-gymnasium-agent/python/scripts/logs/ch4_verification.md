# Chapter 4 (Methodology) — Verification Report

No code was modified for this report. All evidence is quoted from the
repository at the current `feature/cost-roles` HEAD, plus one local log file
(`/Users/sofia/Desktop/loanapp_roles_logs/train_trace_exp_LoanApp_roles_s1_a0p0_b0p0_20260520T204402.csv`).

---

## 1. PPO class and action mask

**1.1 — Agent class used**

[train_agent.py:9](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py#L9):
```python
from stable_baselines3 import PPO
```
[train_agent.py:245-252](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py#L245-L252):
```python
model = PPO(
    "MlpPolicy",
    vec_env,
    verbose=1,
    tensorboard_log=str(tb_log_dir) if tb_log_dir and str(tb_log_dir) else None,
    ent_coef=ent_coef,
    seed=seed,
)
```
This is `stable_baselines3.PPO`, the vanilla (unmasked) class. A repo-wide
search confirms `MaskablePPO` / `sb3_contrib` / `ActionMasker` / `action_masks`
do not appear anywhere except as a comment in `train_agent.py`:

```
$ grep -rln "MaskablePPO\|sb3_contrib\|ActionMasker\|action_masks" /Users/sofia/dcr-js
/Users/sofia/dcr-js/dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py
```
The only hit is [train_agent.py:227](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py#L227):
```python
    # --- Environment factory (no ActionMasker here) ---
```
— a comment documenting the absence, not a usage.

**1.2 — Does a mask exist, and is it wired into the env?**

A mask **is computed** on both the server and client sides, but it is **not
consulted anywhere in the training loop** (PPO has no mechanism to receive it
— `MlpPolicy` samples from the full `Discrete(n_actions)` space unconditionally).

- Server side, [node-adapter/src/server.ts:81-84](node-adapter/src/server.ts#L81-L84):
  ```typescript
  const buildActionMask = (pairs: Array<{ event: string; role: string }>, validActions: string[]) => {
    const set = new Set(validActions || []);
    return pairs.map(p => (set.has(p.event) ? 1 : 0));
  };
  ```
  returned in every `/reset`, `/state`, `/action` response as `actionMask`.

- Client side, [dcr_env.py:25-31](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/envs/dcr_env.py#L25-L31) and
  [dcr_env.py:56-58, 74, 86, 94](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/envs/dcr_env.py#L56-L94):
  `self.action_mask` is stored and placed into `info["action_mask"]`, but
  `step()` / `reset()` never use it to filter `action_space.sample()` or to
  clip the action passed to `model.predict()`. `train_agent.py` never reads
  `info["action_mask"]` either (the `StepDebugCallback` reads `infos` only to
  log `engine_result`, reward components, etc. — see
  [train_agent.py:81-103](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py#L81-L103)).

**1.3 — What does the mask return?**

Non-trivial: `buildActionMask` returns `1` only for `(event, role)` pairs whose
`event` is in `validActions`, i.e. the set of DCR-enabled events from
[generation.ts:196-205](dcr-engine/src/generation.ts#L196-L205)
(`RLDCREnvironment.getValidActions`, built via `isEnabledS`). So the mask
*correctly identifies* enabled vs. non-enabled actions — it is just never used
to restrict sampling.

**1.4 — Cross-check against Safe RL training logs**

From `train_trace_exp_LoanApp_roles_s1_a0p0_b0p0_20260520T204402.csv`,
episode 1 (full trace reproduced in §2 below): **20 of 29 steps** have
`base_mapped=-10`, `reward=-10.0`, message `"Non-compliant move attempted:
Event_X"`, and `pending_before == pending_after` (state unchanged — the
shield blocked them). Example rows:

```
1  base_mapped=-10  Cancel application  reward=-10.0  pend 0->0  Non-compliant move attempted: Event_10
3  base_mapped=-10  Cancel application  reward=-10.0  pend 3->3  Non-compliant move attempted: Event_10
5  base_mapped=-10  Design loan offer   reward=-10.0  pend 3->3  Non-compliant move attempted: Event_6
```

These are PPO's own action samples being rejected by `RLDCREnvironment.step`
([generation.ts:215-229](dcr-engine/src/generation.ts#L215-L229)) — i.e. the
agent **does** select non-enabled actions; the mask cannot be restricting
selection, because if it were, `validActions.includes(action)` would always
be true and `isCompliant` would never be `false`.

> **VERDICT (§1):** Agent = `stable_baselines3.PPO` (`MlpPolicy`, no masking); mask active = **no** (computed but never consulted by the agent/training loop); selection of non-enabled actions = **yes** (confirmed empirically — 20/29 steps in the cited episode are blocked illegal attempts).

---

## 2. Shield demonstration trace — α=0, β=0, episode 1, seed=1

Source: `/Users/sofia/Desktop/loanapp_roles_logs/train_trace_exp_LoanApp_roles_s1_a0p0_b0p0_20260520T204402.csv`, rows with `episode == 1`.

**2.1 — Total steps:** 29 (`step_in_episode` 1–29, `done=True` at step 29).

**2.2 — Legal vs. illegal count**

```
legal (base_mapped != -10):  9
illegal (base_mapped == -10): 20
total:                        29
```
9 + 20 = 29. **The thesis's "9 legal + 20 intercepted = 29" is correct.**
The table's apparent "22 intercepted" is **inconsistent with the raw log**
(off by 2) — the correct figure is **20**, not 22.

**2.3 — Full step list**

| step | type | activity | role | pending before→after | reward | ep_rew_sum |
|---|---|---|---|---|---|---|
| 1  | illegal | Cancel application | Junior | 0→0 | -10.0 | -10.0 |
| 2  | legal   | Check application form completeness | Expert | 0→3 | -0.5  | -10.5 |
| 3  | illegal | Cancel application | Expert | 3→3 | -10.0 | -20.5 |
| 4  | legal   | Appraise property | Expert | 3→3 | -0.5  | -21.0 |
| 5  | illegal | Design loan offer | Expert | 3→3 | -10.0 | -31.0 |
| 6  | legal   | Check credit history | Expert | 3→2 | +1.5  | -29.5 |
| 7  | illegal | Approve loan offer | Junior | 2→2 | -10.0 | -39.5 |
| 8  | legal   | Appraise property | Junior | 2→2 | -1.5  | -41.0 |
| 9  | illegal | Approve application | Junior | 2→2 | -10.0 | -51.0 |
| 10 | legal   | AML check | Junior | 2→1 | +1.5  | -49.5 |
| 11 | legal   | Appraise property | Expert | 1→1 | -1.5  | -51.0 |
| 12 | illegal | Approve application | Junior | 1→1 | -10.0 | -61.0 |
| 13 | illegal | Reject application | Expert | 1→1 | -10.0 | -71.0 |
| 14 | illegal | Cancel application | Junior | 1→1 | -10.0 | -81.0 |
| 15 | illegal | Reject application | Junior | 1→1 | -10.0 | -91.0 |
| 16 | illegal | Cancel application | Junior | 1→1 | -10.0 | -101.0 |
| 17 | illegal | Applicant completes form | Expert | 1→1 | -10.0 | -111.0 |
| 18 | illegal | Return application back to applicant | Expert | 1→1 | -10.0 | -121.0 |
| 19 | legal   | Check credit history | Expert | 1→1 | -1.5  | -122.5 |
| 20 | illegal | Applicant completes form | Junior | 1→1 | -10.0 | -132.5 |
| 21 | illegal | Cancel application | Junior | 1→1 | -10.0 | -142.5 |
| 22 | illegal | Approve loan offer | Junior | 1→1 | -10.0 | -152.5 |
| 23 | illegal | Reject application | Junior | 1→1 | -10.0 | -162.5 |
| 24 | legal   | AML check | Junior | 1→1 | -1.5  | -164.0 |
| 25 | illegal | Approve application | Expert | 1→1 | -10.0 | -174.0 |
| 26 | illegal | Approve loan offer | Junior | 1→1 | -10.0 | -184.0 |
| 27 | illegal | Applicant completes form | Junior | 1→1 | -10.0 | -194.0 |
| 28 | illegal | Return application back to applicant | Junior | 1→1 | -10.0 | -204.0 |
| 29 | legal (terminal/accepting) | Assess loan risk | Expert | 1→0 | +100.0 | -104.0 |

**2.4 — Steps 8 and 11**

Both confirmed: **legal** (`base_mapped=1`), action = **"Appraise property"**
(step 8 role=Junior, step 11 role=Expert — "Appraise property" was first
executed at step 4 with role=Expert; steps 8 and 11 are repetitions of the
*event* regardless of role), `pending_before == pending_after` (no progress),
**reward = -1.5** for both.

**2.5 — Reward decomposition check**

For α=0, β=0 (`COST_WEIGHT=0`, `DURATION_WEIGHT=0` ⇒ `costPenalty=durationPenalty=0`),
[reward.ts:106](dcr-engine/src/reward.ts#L106) gives
`stepReward = baseMapped + progressDelta + noveltyDelta`, and
[server.ts:216-218](node-adapter/src/server.ts#L216-L218) adds
`STEP_PENALTY` (`-1.5` in this run) only when `baseMapped == 1` (legal,
non-terminal):

| step | baseMapped | progressDelta | noveltyDelta | stepReward | + STEP_PENALTY | = reward | matches log? |
|---|---|---|---|---|---|---|---|
| 2  | 1 | 0 (pending 0→3, no *resolution*) | 0 (first "Check application form completeness") | 1 | -1.5 | **-0.5** | ✓ |
| 4  | 1 | 0 | 0 (first "Appraise property") | 1 | -1.5 | **-0.5** | ✓ |
| 6  | 1 | +2 (1 pending resolved, first time) | 0 (first "Check credit history") | 3 | -1.5 | **+1.5** | ✓ |
| 8  | 1 | 0 (no resolution) | -1 (repeat "Appraise property") | 0 | -1.5 | **-1.5** | ✓ |
| 10 | 1 | +2 (1 pending resolved, first time) | 0 (first "AML check") | 3 | -1.5 | **+1.5** | ✓ |
| 11 | 1 | 0 | -1 (repeat "Appraise property") | 0 | -1.5 | **-1.5** | ✓ |
| 19 | 1 | 0 | -1 (repeat "Check credit history") | 0 | -1.5 | **-1.5** | ✓ |
| 24 | 1 | 0 | -1 (repeat "AML check") | 0 | -1.5 | **-1.5** | ✓ |
| 29 | 100 | 0 | 0 | 100 | (no STEP_PENALTY: baseMapped≠1) | **+100** | ✓ |
| all illegal | -10 | 0 | 0 | -10 | (no STEP_PENALTY) | **-10** | ✓ |

`ep_rew_sum` is a running cumulative sum of `reward` and matches at every row
(e.g. step 29: -204.0 + 100.0 = -104.0 ✓).

> **VERDICT (§2):** 29 steps total = 9 legal + 20 illegal (the thesis text "9+20=29" is correct; the table's "22 intercepted" is a transcription error and should read **20**). Steps 8 and 11 are confirmed legal repetitions of "Appraise property" with reward = -1.5 each. The full reward decomposition (legal r=+1-1.5±2·resolved±1·repeat, illegal r=-10, accepting r=+100) matches the log exactly for every one of the 29 steps.

---

## 3. Authoritative reward specification

Single source of truth: [dcr-engine/src/reward.ts](dcr-engine/src/reward.ts) (`computeStepReward`),
combined with the wrapping logic in [node-adapter/src/server.ts:189-245](node-adapter/src/server.ts#L189-L245).

| # | Component | Value / formula | Trigger condition |
|---|---|---|---|
| 1 | Illegal action penalty | `-10` (returned immediately; all other components = 0) | `result.reward === -10`, i.e. the DCR shield ([generation.ts:215-229](dcr-engine/src/generation.ts#L215-L229)) blocked a non-enabled action (Safe RL / shield ON). [reward.ts:50-52](dcr-engine/src/reward.ts#L50-L52) |
| 2 | Terminal accepting bonus | `+100` (returned immediately; all other components = 0) | `accepting = Pending ∩ Included = ∅` (structural acceptance). [reward.ts:55-58](dcr-engine/src/reward.ts#L55-L58) |
| 3 | Base step reward | `+1` (`baseMapped = 1`) | Legal, non-terminal action (any case not covered by 1 or 2). [reward.ts:61](dcr-engine/src/reward.ts#L61) |
| 4 | Step penalty (`STEP_PENALTY`) | env var, default `-0.1` (set to `-1.5` in the cited experiments) | Added **only** when `baseMapped === 1` (legal, non-terminal). [server.ts:34](node-adapter/src/server.ts#L34), [server.ts:208-218](node-adapter/src/server.ts#L208-L218) |
| 5 | Progress bonus | `+2.0 × newlyResolvedCount` | For each event that was `pending ∩ included` *before* the step and is no longer `pending ∩ included` *after*, **and has never been counted before in this episode** (`firstResolvedInEpisode`). First-visit only — prevents reward hacking via Reject↔Approve loops. [reward.ts:63-86](dcr-engine/src/reward.ts#L63-L86) |
| 6 | Novelty / repetition penalty | `-1` | If `action` (the **event**, independent of role) is already in `executedInEpisode` for this episode. Applies on the 2nd+ execution of the same event. [reward.ts:88-94](dcr-engine/src/reward.ts#L88-L94) |
| 7 | Cost term | `- α · (eventCost / maxGraphCost)`, only if `α > 0` and `eventCost` defined | `eventCost = costMap[event] × roleMultipliers[role].costMultiplier` if a role was chosen, else `costMap[event]` — **role multiplier is applied BEFORE normalisation** by `maxGraphCost` (which itself is computed from the un-multiplied `costMap` values at graph-load time). [server.ts:182-187, 52-57, 282-286](node-adapter/src/server.ts#L182-L187); [reward.ts:99-101](dcr-engine/src/reward.ts#L99-L101) |
| 8 | Duration term | `- β · (eventDuration / maxGraphDuration)`, only if `β > 0` and `eventDuration` defined | Same structure as cost: `eventDuration = durationMap[event] × roleMultipliers[role].durationMultiplier` if role chosen; role multiplier applied **before** normalisation by `maxGraphDuration`. [server.ts:182-187, 52-57, 282-286](node-adapter/src/server.ts#L182-L187); [reward.ts:102-104](dcr-engine/src/reward.ts#L102-L104) |
| — | **No other reward terms exist.** | `stepReward = baseMapped + progressDelta + noveltyDelta - costPenalty - durationPenalty` [reward.ts:106](dcr-engine/src/reward.ts#L106), then `effectiveReward = stepReward + STEP_PENALTY` iff `baseMapped===1`, else `effectiveReward = stepReward` [server.ts:216-218](node-adapter/src/server.ts#L216-L218). | — |

**MAX_EPISODE_STEPS and truncation**

- `MAX_EPISODE_STEPS` env var, default `100` ([server.ts:33](node-adapter/src/server.ts#L33)); set to `300` in the Analysis 2 / generalisation-gap runs.
- [server.ts:220-221](node-adapter/src/server.ts#L220-L221):
  ```typescript
  const maxStepReached = episodeSteps >= MAX_EPISODE_STEPS;
  const effectiveDone = accepting || maxStepReached;
  ```
- On truncation (`maxStepReached=true`, `accepting=false`): `done=True` is
  returned to the gym wrapper (no SB3 "truncated" distinction is made — both
  termination and truncation surface as the 4th positional `done` in
  [dcr_env.py:103](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/envs/dcr_env.py#L103),
  with the gymnasium `truncated` flag hardcoded to `False`). The reward for
  that final step is **whatever `computeStepReward` returned for that
  particular action** (+1-step_penalty if legal non-terminal, -10 if illegal,
  +100 only if it happens to also be accepting) — **no separate
  truncation-specific reward/penalty exists**.
- The episode is counted as **non-accepting**: `accepting=false`,
  so in `eval_frozen_policy.py` and `StepDebugCallback`'s
  `pareto/episode_cost`/`episode_duration` logging
  ([train_agent.py:177-184](dcr-gymnasium-agent/dcr-gymnasium-agent/python/src/agents/train_agent.py#L177-L184)),
  a truncated episode contributes **0** to the Pareto/acceptance-rate
  bookkeeping (the `if info.get("accepting")` / `if r["accepting"]` guards
  exclude it).

> **VERDICT (§3):** Reward = `[+1 legal-base − STEP_PENALTY(default −0.1, often −1.5) + 2·(first-time pending resolved) − 1·(event repeated)] − α·(roleAdjustedCost/maxCost) − β·(roleAdjustedDuration/maxDuration)` for legal non-terminal steps; `−10` for shielded illegal attempts; `+100` for structurally-accepting terminal steps. Role multipliers apply **before** normalisation for both cost and duration. `MAX_EPISODE_STEPS` (default 100, often 300) truncates with `done=True`/`accepting=false`/no special reward, and such episodes are excluded from Pareto/acceptance statistics.
