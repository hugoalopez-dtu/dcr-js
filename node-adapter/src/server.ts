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

// Compute normalisation constants at startup (used when graph is loaded via DCR_XML env var).
// These are also recomputed in the /load endpoint when the graph is updated via the modeler UI.
{
  const costVals = Object.values(graph.costMap).filter((v): v is number => v > 0);
  const durVals  = Object.values(graph.durationMap).filter((v): v is number => v > 0);
  maxGraphCost     = costVals.length > 0 ? Math.max(...costVals) : 1;
  maxGraphDuration = durVals.length  > 0 ? Math.max(...durVals)  : 1;
}

// --- Config ---
const MAX_EPISODE_STEPS = Number(process.env.MAX_EPISODE_STEPS || 100);
const STEP_PENALTY = Number(process.env.STEP_PENALTY || -0.1);
const GOAL_LABEL = (process.env.GOAL_LABEL || "").trim();
const STRICT_GOAL_TERMINATION = process.env.STRICT_GOAL_TERMINATION === "1";
const COST_WEIGHT     = Number(process.env.COST_WEIGHT     || 0);
const DURATION_WEIGHT = Number(process.env.DURATION_WEIGHT || 0);

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

// Normalisation constants — set when graph loads, used to bound cost/duration penalties.
let maxGraphCost: number = 1;
let maxGraphDuration: number = 1;

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
    lastResult = null;

    executedInEpisode.clear();
    firstResolvedInEpisode.clear();

    const state = getState();
    const events = getEvents();
    const pairs  = getEventRolePairs();
    const roles  = getRoles();
    const validActions = getValidActions();
    const actionMask = buildActionMask(pairs, validActions);

    res.json({ ok: true, state, events, labelMap: graph.labelMap,
               eventRolePairs: pairs, roles, nRoles: roles.length || 1, actionMask });
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

    const result = env.step(action);
    episodeSteps += 1;

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

    // Accumulate episode totals only for legal actions
    if (isLegal && eventCost !== undefined)     episodeCost     += eventCost;
    if (isLegal && eventDuration !== undefined) episodeDuration += eventDuration;

    rewardInput.action = action;
    const { stepReward, baseMapped, noveltyDelta, progressDelta, costPenalty, durationPenalty } =
      computeStepReward(rewardInput, pendingBefore, executedInEpisode, firstResolvedInEpisode, eventCost, eventDuration, COST_WEIGHT, DURATION_WEIGHT, maxGraphCost, maxGraphDuration);

    // Apply step penalty only for legal non-terminal actions.
    // baseMapped values from reward.ts:
    //  -10: illegal, 100: accepting terminal, 1: legal non-terminal
    const isLegalNonTerminal = baseMapped === 1;
    const isIllegal = baseMapped === -10;
    
    // Track illegal traces for convergence analysis
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