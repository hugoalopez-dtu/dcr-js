// src/server.ts
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

// ../dcr-engine/src/types.ts
var isSubProcess = (obj) => {
  return obj.parent !== void 0;
};

// ../dcr-engine/src/graphConversion.ts
import { XMLParser } from "fast-xml-parser";
function xmlToDCR(xmlString) {
  const graph2 = emptyGraph();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false
  });
  const jsonObj = parser.parse(xmlString);
  const spec = jsonObj?.dcrgraph?.specification;
  if (!spec)
    return graph2;
  const labelMappings = spec.resources?.labelMappings?.labelMapping;
  const mappingArray = Array.isArray(labelMappings) ? labelMappings : [labelMappings];
  const labelLookup = {};
  mappingArray.forEach((m) => {
    if (m)
      labelLookup[String(m.eventId)] = String(m.labelId);
  });
  const rawEvents = spec.resources?.events?.event;
  const eventList = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
  eventList.forEach((e) => {
    const id = String(e.id);
    const label = labelLookup[id] || id;
    graph2.events.add(id);
    graph2.labels.add(label);
    graph2.labelMap[id] = label;
    if (!graph2.labelMapInv[label])
      graph2.labelMapInv[label] = /* @__PURE__ */ new Set();
    graph2.labelMapInv[label].add(id);
    if (e.cost !== void 0 && e.cost !== null && e.cost !== "") {
      const c = Number(e.cost);
      if (!isNaN(c))
        graph2.costMap[id] = c;
    }
    if (e.duration !== void 0 && e.duration !== null && e.duration !== "") {
      const d = Number(e.duration);
      if (!isNaN(d))
        graph2.durationMap[id] = d;
    }
    graph2.conditionsFor[id] = /* @__PURE__ */ new Set();
    graph2.milestonesFor[id] = /* @__PURE__ */ new Set();
    graph2.responseTo[id] = /* @__PURE__ */ new Set();
    graph2.includesTo[id] = /* @__PURE__ */ new Set();
    graph2.excludesTo[id] = /* @__PURE__ */ new Set();
  });
  const rawRoleMultipliers = spec.resources?.roles?.role;
  if (rawRoleMultipliers) {
    const roleList = Array.isArray(rawRoleMultipliers) ? rawRoleMultipliers : [rawRoleMultipliers];
    roleList.forEach((r) => {
      const name = String(r.name || r["@name"] || "");
      const cm = Number(r.costMultiplier ?? r["@costMultiplier"] ?? 1);
      const dm = Number(r.durationMultiplier ?? r["@durationMultiplier"] ?? 1);
      if (name)
        graph2.roleMultipliers[name] = { costMultiplier: cm, durationMultiplier: dm };
    });
  }
  const constraints = spec.constraints;
  if (constraints) {
    const parseRel = (relData, targetMap, reverse = false) => {
      if (!relData)
        return;
      const list = Array.isArray(relData) ? relData : [relData];
      list.forEach((r) => {
        const source = String(r.sourceId);
        const target = String(r.targetId);
        if (graph2.events.has(source) && graph2.events.has(target)) {
          if (reverse)
            targetMap[target].add(source);
          else
            targetMap[source].add(target);
        }
      });
    };
    parseRel(constraints.conditions?.condition, graph2.conditionsFor, true);
    parseRel(constraints.responses?.response, graph2.responseTo);
    parseRel(constraints.excludes?.exclude, graph2.excludesTo);
    parseRel(constraints.includes?.include, graph2.includesTo);
    parseRel(constraints.milestones?.milestone, graph2.milestonesFor, true);
  }
  const marking = jsonObj.dcrgraph?.runtime?.marking;
  if (marking) {
    const fillSet = (data, set) => {
      if (!data)
        return;
      const items = Array.isArray(data.event) ? data.event : data.event ? [data.event] : [];
      items.forEach((i) => set.add(String(i.id || i)));
    };
    fillSet(marking.executed, graph2.marking.executed);
    fillSet(marking.pendingResponses || marking.pending, graph2.marking.pending);
    fillSet(marking.included, graph2.marking.included);
  }
  if (graph2.marking.included.size === 0) {
    graph2.events.forEach((id) => graph2.marking.included.add(id));
  }
  return graph2;
}
function emptyGraph() {
  return {
    events: /* @__PURE__ */ new Set(),
    labels: /* @__PURE__ */ new Set(),
    labelMap: {},
    labelMapInv: {},
    roles: /* @__PURE__ */ new Set(),
    roleMap: {},
    subProcesses: {},
    subProcessMap: {},
    costMap: {},
    durationMap: {},
    roleMultipliers: {},
    conditionsFor: {},
    milestonesFor: {},
    responseTo: {},
    includesTo: {},
    excludesTo: {},
    marking: { executed: /* @__PURE__ */ new Set(), included: /* @__PURE__ */ new Set(), pending: /* @__PURE__ */ new Set() }
  };
}

// ../dcr-engine/src/init.ts
var init = () => {
  Set.prototype.union = function(b) {
    for (const elem of b) {
      this.add(elem);
    }
    return this;
  };
  Set.prototype.intersect = function(b) {
    for (const elem of this) {
      if (!b.has(elem)) {
        this.delete(elem);
      }
    }
    return this;
  };
  Set.prototype.difference = function(b) {
    for (const elem of this) {
      if (b.has(elem)) {
        this.delete(elem);
      }
    }
    return this;
  };
};
var init_default = init;

// ../dcr-engine/src/utility.ts
var copySet = (set) => {
  return new Set(set);
};
var copyMarking = (marking) => {
  return {
    executed: copySet(marking.executed),
    included: copySet(marking.included),
    pending: copySet(marking.pending)
  };
};

// ../dcr-engine/src/executionEngine.ts
init_default();
var executeS = (event, graph2) => {
  graph2.marking.executed.add(event);
  graph2.marking.pending.delete(event);
  for (const eEvent of graph2.excludesTo[event]) {
    graph2.marking.included.delete(eEvent);
  }
  for (const iEvent of graph2.includesTo[event]) {
    graph2.marking.included.add(iEvent);
  }
  for (const rEvent of graph2.responseTo[event]) {
    graph2.marking.pending.add(rEvent);
  }
  const group = graph2.subProcessMap[event];
  if (group && isAcceptingS(group, graph2)) {
    executeS(group.id, graph2);
  }
};
var hasExcludedElder = (group, graph2) => {
  if (!graph2.marking.included.has(group.id))
    return true;
  if (!isSubProcess(group.parent))
    return false;
  return hasExcludedElder(group.parent, graph2);
};
var isAcceptingS = (group, graph2) => {
  let pending = copySet(graph2.marking.pending).intersect(graph2.marking.included);
  for (const blockingEvent of pending.intersect(group.events)) {
    const group2 = graph2.subProcessMap[blockingEvent];
    if (!group2 || !hasExcludedElder(group2, graph2))
      return false;
  }
  return true;
};
var formatEmpty = (label, title) => {
  return label === "" ? `Unnamed ${title}` : label;
};
var isEnabledS = (event, graph2, group) => {
  if (!graph2.marking.included.has(event)) {
    const msg = `${formatEmpty(graph2.labelMap[event], "Subprocess")} is not included...`;
    return { enabled: false, msg };
  }
  if (isSubProcess(group)) {
    const subProcessStatus = isEnabledS(group.id, graph2, group.parent);
    if (!subProcessStatus.enabled) {
      return subProcessStatus;
    }
  }
  for (const cEvent of graph2.conditionsFor[event]) {
    if (graph2.marking.included.has(cEvent) && !graph2.marking.executed.has(cEvent)) {
      const msg = `At minimum, ${formatEmpty(graph2.labelMap[cEvent], "Event")} is conditioning for ${formatEmpty(graph2.labelMap[event], "Event")}...`;
      return { enabled: false, msg };
    }
  }
  for (const mEvent of graph2.milestonesFor[event]) {
    if (graph2.marking.included.has(mEvent) && graph2.marking.pending.has(mEvent)) {
      const msg = `At minimum, ${formatEmpty(graph2.labelMap[mEvent], "Event")} is a milestone for ${formatEmpty(graph2.labelMap[event], "Event")}...`;
      return { enabled: false, msg };
    }
  }
  return { enabled: true, msg: "" };
};

// ../dcr-engine/src/generation.ts
var RLDCREnvironment = class {
  constructor(graph2, maxSteps = 100) {
    this.graph = graph2;
    this.initialMarking = copyMarking(graph2.marking);
    this.maxSteps = maxSteps;
    this.currentStep = 0;
  }
  reset() {
    this.graph.marking = copyMarking(this.initialMarking);
    this.currentStep = 0;
    return this.getState();
  }
  getState() {
    return {
      included: Array.from(this.graph.marking.included),
      executed: Array.from(this.graph.marking.executed),
      pending: Array.from(this.graph.marking.pending)
    };
  }
  getValidActions() {
    const enabledEvents = /* @__PURE__ */ new Set();
    for (const event of this.graph.events) {
      const group = this.graph.subProcessMap[event] ? this.graph.subProcessMap[event] : this.graph;
      if (isEnabledS(event, this.graph, group).enabled) {
        enabledEvents.add(event);
      }
    }
    return Array.from(enabledEvents);
  }
  step(action) {
    const validActions = this.getValidActions();
    const isCompliant = validActions.includes(action);
    const shieldDisabled = process.env.SHIELD_DISABLED === "1";
    if (!isCompliant && !shieldDisabled) {
      return {
        action,
        state: this.getState(),
        reward: -10,
        done: false,
        msg: `Non-compliant move attempted: ${action}`,
        info: { compliant: false, step: this.currentStep }
      };
    }
    executeS(action, this.graph);
    this.currentStep++;
    const accepting = isAcceptingS(this.graph, this.graph);
    const done = accepting || this.currentStep >= this.maxSteps;
    const reward = !isCompliant ? -10 : accepting ? 100 : -1;
    return {
      action,
      state: this.getState(),
      reward,
      done,
      msg: isCompliant ? `Compliant move: ${action}` : `Shield disabled \u2014 illegal move executed: ${action}`,
      info: { compliant: isCompliant, step: this.currentStep }
    };
  }
};

// ../dcr-engine/src/reward.ts
var computeStepReward = (result, pendingBefore, executedInEpisode2, firstResolvedInEpisode2, eventCost, eventDuration, costWeight = 0, durationWeight = 0, maxCost = 1, maxDuration = 1) => {
  if (result.reward === -10) {
    return { stepReward: -10, baseMapped: -10, noveltyDelta: 0, progressDelta: 0, costPenalty: 0, durationPenalty: 0 };
  }
  const isAccepting = Boolean(result.accepting ?? result.done);
  if (isAccepting) {
    return { stepReward: 100, baseMapped: 100, noveltyDelta: 0, progressDelta: 0, costPenalty: 0, durationPenalty: 0 };
  }
  const baseMapped = 1;
  const pendingAfter = countPendingIncluded(result.state);
  const rawProgress = Math.max(0, pendingBefore - pendingAfter);
  let newlyResolvedCount = 0;
  if (rawProgress > 0 && result.state) {
    const includedNow = new Set(result.state.included || []);
    const pendingNow = new Set(result.state.pending || []);
    const pendingBeforeSet = new Set(result.stateBefore?.pending || []);
    const includedBeforeSet = new Set(result.stateBefore?.included || []);
    for (const ev of pendingBeforeSet) {
      if (includedBeforeSet.has(ev) && !(pendingNow.has(ev) && includedNow.has(ev))) {
        if (!firstResolvedInEpisode2.has(ev)) {
          firstResolvedInEpisode2.add(ev);
          newlyResolvedCount++;
        }
      }
    }
  }
  const progressDelta = newlyResolvedCount * 2;
  const action = result.action;
  let noveltyDelta = 0;
  if (action !== void 0) {
    if (executedInEpisode2.has(action))
      noveltyDelta = -1;
    executedInEpisode2.add(action);
  }
  const costPenalty = costWeight > 0 && eventCost !== void 0 && maxCost > 0 ? costWeight * (eventCost / maxCost) : 0;
  const durationPenalty = durationWeight > 0 && eventDuration !== void 0 && maxDuration > 0 ? durationWeight * (eventDuration / maxDuration) : 0;
  const stepReward = baseMapped + progressDelta + noveltyDelta - costPenalty - durationPenalty;
  return { stepReward, baseMapped, noveltyDelta, progressDelta, costPenalty, durationPenalty };
};
var countPendingIncluded = (state) => {
  if (!state)
    return 0;
  const included = new Set(state.included || []);
  const pending = Array.from(state.pending || []);
  return pending.filter((ev) => included.has(ev)).length;
};

// src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
var XML_PATH = process.env.DCR_XML || path.join(__dirname, "../../app/public/examples/diagrams/Prescribe medicine.xml");
var STAGING_PATH = path.join(__dirname, "../staging/current_graph.xml");
if (!fs.existsSync(XML_PATH)) {
  console.error(`XML file not found: ${XML_PATH}`);
  process.exit(1);
}
var xmlContent = fs.readFileSync(XML_PATH, "utf-8");
var graph = xmlToDCR(xmlContent);
var env = new RLDCREnvironment(graph);
var MAX_EPISODE_STEPS = Number(process.env.MAX_EPISODE_STEPS || 100);
var STEP_PENALTY = Number(process.env.STEP_PENALTY || -0.1);
var GOAL_LABEL = (process.env.GOAL_LABEL || "").trim();
var STRICT_GOAL_TERMINATION = process.env.STRICT_GOAL_TERMINATION === "1";
var COST_WEIGHT = Number(process.env.COST_WEIGHT || 0);
var DURATION_WEIGHT = Number(process.env.DURATION_WEIGHT || 0);
var _kRaw = process.env.EXPERT_BUDGET_K;
var EXPERT_BUDGET_K = !_kRaw || _kRaw === "none" ? null : Number(_kRaw);
var executedInEpisode = /* @__PURE__ */ new Set();
var firstResolvedInEpisode = /* @__PURE__ */ new Set();
var lastResult = null;
var episodeSteps = 0;
var illegalTracesCount = 0;
var episodeCost = 0;
var episodeDuration = 0;
var expertBudgetRemaining = EXPERT_BUDGET_K;
var numBudgetBlocks = 0;
var _initCostVals = Object.values(graph.costMap).filter((v) => v > 0);
var _initDurVals = Object.values(graph.durationMap).filter((v) => v > 0);
var maxGraphCost = _initCostVals.length > 0 ? Math.max(..._initCostVals) : 1;
var maxGraphDuration = _initDurVals.length > 0 ? Math.max(..._initDurVals) : 1;
console.log(`[startup] Reward normalisation: maxCost=${maxGraphCost}, maxDuration=${maxGraphDuration}`);
var getRoles = () => Object.keys(graph.roleMultipliers || {}).sort();
var getEventRolePairs = () => {
  const events = Array.from(graph.events).slice().sort();
  const roles = getRoles();
  if (roles.length === 0)
    return events.map((ev) => ({ event: ev, role: "" }));
  const pairs = [];
  for (const ev of events) {
    for (const role of roles) {
      pairs.push({ event: ev, role });
    }
  }
  return pairs;
};
var buildActionMask = (pairs, validActions) => {
  const set = new Set(validActions || []);
  return pairs.map((p) => set.has(p.event) ? 1 : 0);
};
var getState = () => env.getState ? env.getState() : {
  included: [...graph.marking.included],
  pending: [...graph.marking.pending],
  executed: [...graph.marking.executed]
};
var getEvents = () => Array.from(graph.events).slice().sort();
var getValidActions = () => env.getValidActions ? Array.from(env.getValidActions()) : [];
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
    const pairs = getEventRolePairs();
    const roles = getRoles();
    const validActions = getValidActions();
    const actionMask = buildActionMask(pairs, validActions);
    res.json({
      ok: true,
      state,
      events,
      labelMap: graph.labelMap,
      eventRolePairs: pairs,
      roles,
      nRoles: roles.length || 1,
      actionMask,
      expertBudgetK: EXPERT_BUDGET_K,
      expertBudgetRemaining,
      costMap: graph.costMap,
      durationMap: graph.durationMap,
      roleMultipliers: graph.roleMultipliers
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
app.get("/state", (_req, res) => {
  try {
    const state = getState();
    const pairs = getEventRolePairs();
    const roles = getRoles();
    const validActions = getValidActions();
    const actionMask = buildActionMask(pairs, validActions);
    res.json({
      ok: true,
      state,
      validActions,
      lastResult,
      eventRolePairs: pairs,
      roles,
      nRoles: roles.length || 1,
      actionMask
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
app.post("/action", (req, res) => {
  try {
    const { action: rawAction } = req.body;
    if (rawAction === void 0 || rawAction === null) {
      return res.status(400).json({ ok: false, error: "action required" });
    }
    const pairs = getEventRolePairs();
    let action;
    let chosenRole = "";
    if (typeof rawAction === "number") {
      const pair = pairs[rawAction];
      if (!pair)
        return res.status(400).json({ ok: false, error: `action index ${rawAction} out of range (${pairs.length} pairs)` });
      action = pair.event;
      chosenRole = pair.role;
    } else {
      action = String(rawAction);
    }
    const stateBefore = getState();
    const pendingBefore = countPendingIncluded(stateBefore);
    episodeSteps += 1;
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
          pendingAfter: pendingBefore,
          // state unchanged
          illegalTracesCount,
          // dcr_illegal count not touched
          episodeSteps,
          actionCompliant: true,
          // DCR-enabled; budget-blocked only
          interceptedReason: "budget_block",
          expertBudgetRemaining,
          expertBudgetInitial: EXPERT_BUDGET_K,
          numBudgetBlocks,
          chosenRole
        },
        actionMask: budgetBlockMask
      });
    }
    const result = env.step(action);
    const label = graph.labelMap[action] || action;
    const structuralAccepting = Boolean(result.done);
    const goalReached = GOAL_LABEL.length > 0 && label === GOAL_LABEL;
    const accepting = STRICT_GOAL_TERMINATION ? structuralAccepting && goalReached : structuralAccepting;
    const rewardInput = { ...result, accepting, done: accepting, stateBefore };
    const baseCost = graph.costMap?.[action] ?? 0;
    const baseDuration = graph.durationMap?.[action] ?? 0;
    const mult = chosenRole ? graph.roleMultipliers?.[chosenRole] : void 0;
    const eventCost = mult ? baseCost * mult.costMultiplier : graph.costMap?.[action];
    const eventDuration = mult ? baseDuration * mult.durationMultiplier : graph.durationMap?.[action];
    const isLegal = result.reward !== -10;
    if (isLegal && chosenRole === "Expert" && EXPERT_BUDGET_K !== null && expertBudgetRemaining !== null) {
      expertBudgetRemaining = Math.max(0, expertBudgetRemaining - 1);
    }
    const shieldDisabled = process.env.SHIELD_DISABLED === "1";
    const actionExecuted = isLegal || shieldDisabled;
    if (actionExecuted && eventCost !== void 0)
      episodeCost += eventCost;
    if (actionExecuted && eventDuration !== void 0)
      episodeDuration += eventDuration;
    rewardInput.action = action;
    const { stepReward, baseMapped, noveltyDelta, progressDelta, costPenalty, durationPenalty } = computeStepReward(rewardInput, pendingBefore, executedInEpisode, firstResolvedInEpisode, eventCost, eventDuration, COST_WEIGHT, DURATION_WEIGHT, maxGraphCost, maxGraphDuration);
    const isLegalNonTerminal = baseMapped === 1;
    const isIllegal = baseMapped === -10;
    const interceptedReason = isLegal ? null : "dcr_illegal";
    if (isIllegal) {
      illegalTracesCount += 1;
    }
    const effectiveReward = isLegalNonTerminal ? stepReward + STEP_PENALTY : stepReward;
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
      eventCost: eventCost ?? null,
      eventDuration: eventDuration ?? null,
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
      numBudgetBlocks
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
    fs.mkdirSync(path.dirname(STAGING_PATH), { recursive: true });
    fs.writeFileSync(STAGING_PATH, xml, "utf-8");
    const roles = getRoles();
    const pairs = getEventRolePairs();
    const eventsWithCost = Object.keys(graph.costMap);
    const costVals = Object.values(graph.costMap).filter((v) => v > 0);
    const durVals = Object.values(graph.durationMap).filter((v) => v > 0);
    maxGraphCost = costVals.length > 0 ? Math.max(...costVals) : 1;
    maxGraphDuration = durVals.length > 0 ? Math.max(...durVals) : 1;
    console.log(`[/load] Graph loaded: ${graph.events.size} events, ${eventsWithCost.length} with base cost, ${roles.length} roles (${roles.join(", ")})`);
    console.log(`[/load] Reward normalisation: maxCost=${maxGraphCost}, maxDuration=${maxGraphDuration}`);
    console.log(`[/load] Action space: ${pairs.length} (${graph.events.size} events \xD7 ${roles.length || 1} roles)`);
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
      eventRolePairs: pairs
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
var PORT = Number(process.env.PORT || 5001);
app.listen(PORT, () => {
  console.log(`DCR adapter listening on http://localhost:${PORT}`);
  console.log(`Using XML:                 ${XML_PATH}`);
  console.log(`MAX_EPISODE_STEPS:         ${MAX_EPISODE_STEPS}`);
  console.log(`STEP_PENALTY:              ${STEP_PENALTY}`);
  console.log(`GOAL_LABEL:                ${GOAL_LABEL || "<none>"}`);
  console.log(`STRICT_GOAL_TERMINATION:   ${STRICT_GOAL_TERMINATION}`);
  console.log(`Termination:               ${STRICT_GOAL_TERMINATION ? "goal + structural" : "structural (Pending \u2229 Included = \u2205)"}`);
});
