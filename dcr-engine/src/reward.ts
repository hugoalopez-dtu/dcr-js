export type RewardResult = {
  stepReward: number;
  baseMapped: number;
  noveltyDelta: number;
  progressDelta: number;
  costPenalty: number;
  durationPenalty: number;
};

/**
 * Compute structured reward from DCR engine result.
 *
 * Components:
 *  1. Illegal action:     -10 (engine returns result.reward === -10)
 *  2. Acceptance signal:  +100 when Pending ∩ Included = ∅  (process complete)
 *  3. Progress signal:    +k * (pending_before - pending_after), k=2.0
 *                         Structural signal — works across any DCR graph.
 *  4. Repetition penalty: -1 if the same event was already executed in this episode.
 *                         executedInEpisode MUST be cleared on every episode reset.
 *  5. Step penalty:       -0.1 per legal action (applied in server.ts)
 *
 * NOTE: Termination is purely structural (accepting = Pending ∩ Included = ∅).
 * 
 *  * -------------------------------------------------------------------------------
 * Situation                                      | Components              | Total
 * -------------------------------------------------------------------------------
 * Legal, first time, no progress                 | +1 -0.1                 | +0.9
 * Legal, repeated, no progress                   | +1 -1 -0.1              | -0.1
 * Legal, first time, resolves 1 pending          | +1 +2 -0.1              | +2.9
 * Legal, repeated, resolves 1 pending            | +1 -1 +2 -0.1           | +1.9
 * Illegal action                                 | -10                     | -10
 * Acceptance (terminal state)                    | +100                    | +100
 * -------------------------------------------------------------------------------
 *
 */
export const computeStepReward = (
  result: any,
  pendingBefore: number,
  executedInEpisode: Set<string>,
  firstResolvedInEpisode: Set<string>,
  eventCost?: number,
  eventDuration?: number,
  costWeight: number = 0,
  durationWeight: number = 0,
  maxCost: number = 1,
  maxDuration: number = 1,
): RewardResult => {

  // --- 1. Illegal action ---
  if (result.reward === -10) {
    return { stepReward: -10, baseMapped: -10, noveltyDelta: 0, progressDelta: 0, costPenalty: 0, durationPenalty: 0 };
  }

  // --- 2. Acceptance (Pending ∩ Included = ∅) ---
  const isAccepting = Boolean(result.accepting ?? result.done);
  if (isAccepting) {
    return { stepReward: 100, baseMapped: 100, noveltyDelta: 0, progressDelta: 0, costPenalty: 0, durationPenalty: 0 };
  }

  // --- 3. Legal, non-terminal ---
  const baseMapped = 1;

  // --- 4. Progress signal (first-visit only) ---
  // Only reward the first time each pending event is resolved in this episode.
  // This prevents reward hacking via response-relation loops (e.g. Reject→Approve cycles
  // where the agent recreates pending states to harvest progress bonuses repeatedly).
  const pendingAfter = countPendingIncluded(result.state);
  const rawProgress = Math.max(0, pendingBefore - pendingAfter);
  let newlyResolvedCount = 0;
  if (rawProgress > 0 && result.state) {
    const includedNow = new Set(result.state.included || []);
    const pendingNow  = new Set(result.state.pending  || []);
    // Find events that WERE pending before but are no longer pending+included.
    // Count only those that have never been resolved before in this episode.
    const pendingBeforeSet = new Set<string>(result.stateBefore?.pending || []);
    const includedBeforeSet = new Set<string>(result.stateBefore?.included || []);
    for (const ev of pendingBeforeSet) {
      if (includedBeforeSet.has(ev) && !(pendingNow.has(ev) && includedNow.has(ev))) {
        if (!firstResolvedInEpisode.has(ev)) {
          firstResolvedInEpisode.add(ev);
          newlyResolvedCount++;
        }
      }
    }
  }
  const progressDelta = newlyResolvedCount * 2.0;

  // --- 5. Repetition penalty ---
  const action: string | undefined = result.action;
  let noveltyDelta = 0;
  if (action !== undefined) {
    if (executedInEpisode.has(action)) noveltyDelta = -1;
    executedInEpisode.add(action);
  }

  // --- 6. Multi-objective cost/duration penalties — normalised by graph maximum ---
  // Normalisation ensures penalties are bounded to [0, weight], preventing them from
  // overwhelming the illegal action penalty (-10) on graphs with large absolute values.
  const costPenalty     = (costWeight > 0     && eventCost     !== undefined && maxCost     > 0)
    ? costWeight     * (eventCost     / maxCost)
    : 0;
  const durationPenalty = (durationWeight > 0 && eventDuration !== undefined && maxDuration > 0)
    ? durationWeight * (eventDuration / maxDuration)
    : 0;

  const stepReward = baseMapped + progressDelta + noveltyDelta - costPenalty - durationPenalty;
  return { stepReward, baseMapped, noveltyDelta, progressDelta, costPenalty, durationPenalty };
};

/**
 * Count events that are both pending AND included.
 * This is the DCR acceptance condition: process is complete when this reaches 0.
 */
export const countPendingIncluded = (state: any): number => {
  if (!state) return 0;
  const included = new Set(state.included || []);
  const pending  = Array.from(state.pending  || []) as string[];
  return pending.filter(ev => included.has(ev)).length;
};