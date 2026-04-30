export type RewardResult = {
  stepReward: number;
  baseMapped: number;
  noveltyDelta: number;
  progressDelta: number;
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
  executedInEpisode: Set<string>
): RewardResult => {

  // --- 1. Check if action was illegal (engine returns result.reward === -10) ---
  if (result.reward === -10) {
    return { stepReward: -10, baseMapped: -10, noveltyDelta: 0, progressDelta: 0 };
  }

  // --- 2. Check if action reaches acceptance (Pending ∩ Included = ∅) ---
  const isAccepting = Boolean(result.accepting ?? result.done);
  if (isAccepting) {
    return { stepReward: 100, baseMapped: 100, noveltyDelta: 0, progressDelta: 0 };
  }

  // --- 3. Legal action, not yet accepting ---
  const baseMapped = 1;

  // --- 4. Progress signal ---
  const pendingAfter = countPendingIncluded(result.state);
  const progressDelta = Math.max(0, pendingBefore - pendingAfter) * 2.0;

  // --- 5. Repetition penalty: -1 if this event was already chosen this episode ---
  const action: string | undefined = result.action;
  let noveltyDelta = 0;
  if (action !== undefined) {
    if (executedInEpisode.has(action)) {
      noveltyDelta = -1;
    }
    executedInEpisode.add(action);
  }

  const stepReward = baseMapped + progressDelta + noveltyDelta;
  return { stepReward, baseMapped, noveltyDelta, progressDelta };
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