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
app.use(bodyParser.json());

// --- Graph loading ---
const XML_PATH = process.env.DCR_XML || path.join(__dirname, "../../app/public/examples/diagrams/Prescribe medicine.xml");

if (!fs.existsSync(XML_PATH)) {
  console.error(`XML file not found: ${XML_PATH}`);
  process.exit(1);
}
const xmlContent = fs.readFileSync(XML_PATH, "utf-8");
const graph = xmlToDCR(xmlContent);
const env = new RLDCREnvironment(graph);

// --- Config ---
const MAX_EPISODE_STEPS = Number(process.env.MAX_EPISODE_STEPS || 100);
const STEP_PENALTY = Number(process.env.STEP_PENALTY || -0.1);
const GOAL_LABEL = (process.env.GOAL_LABEL || "").trim();
const STRICT_GOAL_TERMINATION = process.env.STRICT_GOAL_TERMINATION === "1";

// Termination modes:
// - structural: accepting when Pending ∩ Included = ∅
// - strict goal: accepting when structural accepting AND selected event matches GOAL_LABEL

// Per-episode event tracking — cleared on every reset.
// Penalises re-execution of the same event within a single episode.
const executedInEpisode = new Set<string>();

let lastResult: any = null;
let episodeSteps = 0;
let illegalTracesCount = 0;

// --- Helpers ---
const buildActionMask = (events: string[], validActions: string[]) => {
  const set = new Set(validActions || []);
  return events.map(ev => (set.has(ev) ? 1 : 0));
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
    lastResult = null;

    executedInEpisode.clear();

    const state = getState();
    const events = getEvents();
    const validActions = getValidActions();
    const actionMask = buildActionMask(events, validActions);

    res.json({ ok: true, state, events, labelMap: graph.labelMap, actionMask });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/state", (_req, res) => {
  try {
    const state = getState();
    const events = getEvents();
    const validActions = getValidActions();
    const actionMask = buildActionMask(events, validActions);
    res.json({ ok: true, state, validActions, lastResult, actionMask });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/action", (req, res) => {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ ok: false, error: "action required" });

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
    const rewardInput: any = { ...result, accepting, done: accepting };

    // Compute reward (no GOAL_LABEL dependency)
    // Pass the action so reward.ts can track repetition within this episode
    rewardInput.action = action;
    const { stepReward, baseMapped, noveltyDelta, progressDelta } =
      computeStepReward(rewardInput, pendingBefore, executedInEpisode);

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
      pendingBefore,
      pendingAfter: countPendingIncluded(result.state),
      illegalTracesCount,
      episodeSteps,
    };

    lastResult = augmentedResult;

    const events = getEvents();
    const validActions = getValidActions();
    const actionMask = buildActionMask(events, validActions);

    res.json({ ok: true, result: augmentedResult, actionMask });
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