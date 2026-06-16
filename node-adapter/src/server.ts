import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

import { xmlToDCR } from "../../dcr-engine/src/graphConversion.js";
import { RLDCREnvironment } from "../../dcr-engine/src/generation.js";
import { computeStepReward, countPendingIncluded } from "../../dcr-engine/src/reward.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// --- Graph loading ---
const XML_PATH = process.env.DCR_XML || path.join(__dirname, "../../app/public/examples/diagrams/Prescribe medicine.xml");
const STAGING_PATH = path.join(__dirname, "../staging/current_graph.xml");

if (!fs.existsSync(XML_PATH)) {
  console.error(`XML file not found: ${XML_PATH}`);
  process.exit(1);
}
const xmlContent = fs.readFileSync(XML_PATH, "utf-8");
let graph = xmlToDCR(xmlContent);
let env = new RLDCREnvironment(graph);

// --- Config ---
const MAX_EPISODE_STEPS = Number(process.env.MAX_EPISODE_STEPS || 100);
const STEP_PENALTY = Number(process.env.STEP_PENALTY || -0.1);
const GOAL_LABEL = (process.env.GOAL_LABEL || "").trim();
const STRICT_GOAL_TERMINATION = process.env.STRICT_GOAL_TERMINATION === "1";
const COST_WEIGHT     = Number(process.env.COST_WEIGHT     || 0);
const DURATION_WEIGHT = Number(process.env.DURATION_WEIGHT || 0);

const _kRaw = process.env.EXPERT_BUDGET_K;
const EXPERT_BUDGET_K: number | null =
  !_kRaw || _kRaw === "none" ? null : Number(_kRaw);

const executedInEpisode = new Set<string>();
// Tracks which pending events have been resolved at least once this episode.
// Prevents reward hacking via response-relation loops (e.g. Reject→Approve→Reject→Approve).
// Progress bonus is only granted the FIRST time each pending is resolved.
const firstResolvedInEpisode = new Set<string>();

let lastResult: any = null;
let episodeSteps = 0;
let illegalTracesCount = 0;
let episodeCost = 0;
let episodeDuration = 0;
let expertBudgetRemaining: number | null = EXPERT_BUDGET_K;
let numBudgetBlocks = 0;

// Normalisation constants — computed from graph at startup and recomputed on /load.
const _initCostVals = Object.values(graph.costMap).filter((v): v is number => v > 0);
const _initDurVals  = Object.values(graph.durationMap).filter((v): v is number => v > 0);
let maxGraphCost: number     = _initCostVals.length > 0 ? Math.max(..._initCostVals) : 1;
let maxGraphDuration: number = _initDurVals.length  > 0 ? Math.max(..._initDurVals)  : 1;
console.log(`[startup] Reward normalisation: maxCost=${maxGraphCost}, maxDuration=${maxGraphDuration}`);

// --- Helpers ---

// Returns sorted list of role names from the graph's global roleMultipliers.
const getRoles = (): string[] =>
  Object.keys(graph.roleMultipliers || {}).sort();

// Returns flat list of {event, role} pairs: all events × all roles (when roles exist),
// or just events wrapped as {event, role:""} for backward compatibility.
const getEventRolePairs = (): Array<{ event: string; role: string }> => {
  const events = Array.from(graph.events).slice().sort() as string[];
  const roles = getRoles();
  if (roles.length === 0) return events.map(ev => ({ event: ev, role: "" }));
  const pairs: Array<{ event: string; role: string }> = [];
  for (const ev of events) {
    for (const role of roles) {
      pairs.push({ event: ev, role });
    }
  }
  return pairs;
};

// Mask: 1 for every (event, role) pair where the event is a valid action.
const buildActionMask = (pairs: Array<{ event: string; role: string }>, validActions: string[]) => {
  const set = new Set(validActions || []);
  return pairs.map(p => (set.has(p.event) ? 1 : 0));
};

const getState = () =>
  env.getState
    ? env.getState()
    : {
        included: [...graph.marking.included],
        pending:  [...graph.marking.pending],
        executed: [...graph.marking.executed],
      };

const getEvents = () => Array.from(graph.events).slice().sort() as string[];

const getValidActions = () =>
  (env.getValidActions ? Array.from(env.getValidActions()) : []) as string[];

// --- Routes ---
app.post("/reset", (_req, res) => {
  try {
    env.reset();
    episodeSteps = 0;
    illegalTracesCount = 0;
    episodeCost = 0;
    episodeDuration = 0;
    expertBudgetRemaining = EXPERT_BUDGET_K;
    numBudgetBlocks = 0;
    lastResult = null;

    executedInEpisode.clear();
    firstResolvedInEpisode.clear();

    const state = getState();
    const events = getEvents();
    const pairs  = getEventRolePairs();
    const roles  = getRoles();
    const validActions = getValidActions();
    const actionMask = buildActionMask(pairs, validActions);

    res.json({
      ok: true, state, events, labelMap: graph.labelMap,
      eventRolePairs: pairs, roles, nRoles: roles.length || 1, actionMask,
      expertBudgetK: EXPERT_BUDGET_K,
      expertBudgetRemaining,
      costMap: graph.costMap,
      durationMap: graph.durationMap,
      roleMultipliers: graph.roleMultipliers,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/state", (_req, res) => {
  try {
    const state = getState();
    const pairs  = getEventRolePairs();
    const roles  = getRoles();
    const validActions = getValidActions();
    const actionMask = buildActionMask(pairs, validActions);
    res.json({ ok: true, state, validActions, lastResult,
               eventRolePairs: pairs, roles, nRoles: roles.length || 1, actionMask });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/action", (req, res) => {
  try {
    // action can be either an index (number) into eventRolePairs, or a plain event id string
    const { action: rawAction } = req.body;
    if (rawAction === undefined || rawAction === null) {
      return res.status(400).json({ ok: false, error: "action required" });
    }

    // Decode action index → (eventId, role)
    const pairs = getEventRolePairs();
    let action: string;
    let chosenRole: string = "";
    if (typeof rawAction === "number") {
      const pair = pairs[rawAction];
      if (!pair) return res.status(400).json({ ok: false, error: `action index ${rawAction} out of range (${pairs.length} pairs)` });
      action = pair.event;
      chosenRole = pair.role;
    } else {
      action = String(rawAction);
    }

    // Capture pending count BEFORE the step (needed for progress signal)
    const stateBefore = getState();
    const pendingBefore = countPendingIncluded(stateBefore);

    // Step counter runs on ALL paths: legal, DCR-illegal, and budget-block.
    // Must be here so MAX_EPISODE_STEPS truncation applies equally to all three.
    episodeSteps += 1;

    // ── BUDGET GATE ─────────────────────────────────────────────────────────
    // Only fires when the event IS DCR-enabled AND Expert budget is exhausted.
    // Non-enabled Expert actions fall through to env.step() → tagged dcr_illegal.
    // actionMask is NOT updated here: the policy must learn not to attempt Expert
    // when budget=0, conditioned on the obs budget dim.
    const validEvents = new Set(getValidActions());
    const isDCREnabled = validEvents.has(action);
    if (chosenRole === "Expert" && EXPERT_BUDGET_K !== null && expertBudgetRemaining === 0 && isDCREnabled) {
      numBudgetBlocks += 1;
      const maxStepReachedBudget = episodeSteps >= MAX_EPISODE_STEPS;
      const pairsBudget = getEventRolePairs();
      const budgetBlockMask = buildActionMask(pairsBudget, Array.from(validEvents));
      return res.json({
        ok: true,
        result: {
          state: getState(),
          done: maxStepReachedBudget,
          accepting: false,
          structuralAccepting: false,
          goalReached: false,
          maxStepReached: maxStepReachedBudget,
          stepReward: -10,
          baseMapped: -10,
          noveltyDelta: 0,
          progressDelta: 0,
          costPenalty: 0,
          durationPenalty: 0,
          eventCost: null,
          eventDuration: null,
          episodeCost,
          episodeDuration,
          pendingBefore,
          pendingAfter: pendingBefore,   // state unchanged
          illegalTracesCount,            // dcr_illegal count not touched
          episodeSteps,
          actionCompliant: true,         // DCR-enabled; budget-blocked only
          interceptedReason: "budget_block",
          expertBudgetRemaining,
          expertBudgetInitial: EXPERT_BUDGET_K,
          numBudgetBlocks,
          chosenRole,
        },
        actionMask: budgetBlockMask,
      });
    }
    // ── END BUDGET GATE ──────────────────────────────────────────────────────

    const result = env.step(action);

    const label = graph.labelMap[action] || action;

    // Structural acceptance: Pending ∩ Included = ∅
    const structuralAccepting = Boolean(result.done);
    const goalReached = GOAL_LABEL.length > 0 && label === GOAL_LABEL;
    const accepting = STRICT_GOAL_TERMINATION
      ? (structuralAccepting && goalReached)
      : structuralAccepting;

    // Ensure reward.ts uses the acceptance mode selected above.
    // Pass stateBefore so the progress signal can identify which pendings were resolved.
    const rewardInput: any = { ...result, accepting, done: accepting, stateBefore };

    // Compute effective cost/duration: base × role multiplier (falls back to flat values if no roles)
    const baseCost     = graph.costMap?.[action] ?? 0;
    const baseDuration = graph.durationMap?.[action] ?? 0;
    const mult = chosenRole ? graph.roleMultipliers?.[chosenRole] : undefined;
    const eventCost     = mult ? baseCost     * mult.costMultiplier     : graph.costMap?.[action];
    const eventDuration = mult ? baseDuration * mult.durationMultiplier : graph.durationMap?.[action];

    const isLegal = result.reward !== -10;

    // Decrement Expert budget on a legally executed Expert action.
    if (isLegal && chosenRole === "Expert" && EXPERT_BUDGET_K !== null && expertBudgetRemaining !== null) {
      expertBudgetRemaining = Math.max(0, expertBudgetRemaining - 1);
    }

    // In RL-only mode (shield disabled), illegal actions still execute and
    // change the DCR state, so their cost/duration must be counted too.
    // In Safe RL, illegal actions are blocked (state unchanged) and must not.
    const shieldDisabled = process.env.SHIELD_DISABLED === "1";
    const actionExecuted = isLegal || shieldDisabled;

    // Accumulate episode totals only for actions that actually executed
    if (actionExecuted && eventCost !== undefined)     episodeCost     += eventCost;
    if (actionExecuted && eventDuration !== undefined) episodeDuration += eventDuration;

    rewardInput.action = action;
    const { stepReward, baseMapped, noveltyDelta, progressDelta, costPenalty, durationPenalty } =
      computeStepReward(rewardInput, pendingBefore, executedInEpisode, firstResolvedInEpisode, eventCost, eventDuration, COST_WEIGHT, DURATION_WEIGHT, maxGraphCost, maxGraphDuration);

    // Apply step penalty only for legal non-terminal actions.
    // baseMapped values from reward.ts:
    //  -10: illegal, 100: accepting terminal, 1: legal non-terminal
    const isLegalNonTerminal = baseMapped === 1;
    const isIllegal = baseMapped === -10;
    // budget_block never reaches this path, so isIllegal here always means dcr_illegal.
    const interceptedReason = isLegal ? null : "dcr_illegal";

    // Track illegal traces for convergence analysis (dcr_illegal only, not budget_block)
    if (isIllegal) {
      illegalTracesCount += 1;
    }
    
    const effectiveReward = isLegalNonTerminal
      ? stepReward + STEP_PENALTY
      : stepReward;

    const maxStepReached = episodeSteps >= MAX_EPISODE_STEPS;
    const effectiveDone = accepting || maxStepReached;

    const augmentedResult = {
      ...result,
      done: effectiveDone,
      accepting,
      structuralAccepting,
      goalReached,
      maxStepReached,
      stepReward: effectiveReward,
      baseMapped,
      noveltyDelta,
      progressDelta,
      costPenalty,
      durationPenalty,
      eventCost:      eventCost ?? null,
      eventDuration:  eventDuration ?? null,
      episodeCost,
      episodeDuration,
      pendingBefore,
      pendingAfter: countPendingIncluded(result.state),
      illegalTracesCount,
      episodeSteps,
      actionCompliant: result.info?.compliant ?? true,
      interceptedReason,
      expertBudgetRemaining,
      expertBudgetInitial: EXPERT_BUDGET_K,
      numBudgetBlocks,
    };

    lastResult = { ...augmentedResult, chosenRole };

    const pairs2 = getEventRolePairs();
    const validActions2 = getValidActions();
    const actionMask = buildActionMask(pairs2, validActions2);

    res.json({ ok: true, result: { ...augmentedResult, chosenRole }, actionMask });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/load", (req, res) => {
  try {
    const { xml } = req.body;
    if (!xml || typeof xml !== "string") {
      return res.status(400).json({ ok: false, error: "xml string required" });
    }
    graph = xmlToDCR(xml);
    env = new RLDCREnvironment(graph);
    episodeSteps = 0;
    illegalTracesCount = 0;
    episodeCost = 0;
    episodeDuration = 0;
    lastResult = null;
    executedInEpisode.clear();
    firstResolvedInEpisode.clear();

    // Persist XML to disk so run_experiments.py can pick it up on the cluster
    fs.mkdirSync(path.dirname(STAGING_PATH), { recursive: true });
    fs.writeFileSync(STAGING_PATH, xml, "utf-8");

    const roles = getRoles();
    const pairs = getEventRolePairs();
    const eventsWithCost = Object.keys(graph.costMap);
    // Compute normalisation constants for reward shaping
    const costVals     = Object.values(graph.costMap).filter((v): v is number => v > 0);
    const durVals      = Object.values(graph.durationMap).filter((v): v is number => v > 0);
    maxGraphCost     = costVals.length     > 0 ? Math.max(...costVals)     : 1;
    maxGraphDuration = durVals.length      > 0 ? Math.max(...durVals)      : 1;
    console.log(`[/load] Graph loaded: ${graph.events.size} events, ${eventsWithCost.length} with base cost, ${roles.length} roles (${roles.join(", ")})`);
    console.log(`[/load] Reward normalisation: maxCost=${maxGraphCost}, maxDuration=${maxGraphDuration}`);
    console.log(`[/load] Action space: ${pairs.length} (${graph.events.size} events × ${roles.length || 1} roles)`);
    console.log(`[/load] XML saved to: ${STAGING_PATH}`);

    res.json({
      ok: true,
      events: Array.from(graph.events),
      labelMap: graph.labelMap,
      costMap: graph.costMap,
      durationMap: graph.durationMap,
      roleMultipliers: graph.roleMultipliers,
      roles,
      nRoles: roles.length || 1,
      eventRolePairs: pairs,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- Start ---
const PORT = Number(process.env.PORT || 5001);
app.listen(PORT, () => {
  console.log(`DCR adapter listening on http://localhost:${PORT}`);
  console.log(`Using XML:                 ${XML_PATH}`);
  console.log(`MAX_EPISODE_STEPS:         ${MAX_EPISODE_STEPS}`);
  console.log(`STEP_PENALTY:              ${STEP_PENALTY}`);
  console.log(`GOAL_LABEL:                ${GOAL_LABEL || "<none>"}`);
  console.log(`STRICT_GOAL_TERMINATION:   ${STRICT_GOAL_TERMINATION}`);
  console.log(`Termination:               ${STRICT_GOAL_TERMINATION ? "goal + structural" : "structural (Pending ∩ Included = ∅)"}`);
});