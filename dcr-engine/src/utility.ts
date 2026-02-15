import type {
  DCRGraph,
  EventMap,
  Marking,
  Event,
  Traces,
  EventLog,
  VariantLog,
  Trace,
  RoleTrace,
  Variant,
  BinaryLog,
  BinaryVariantLog,
} from "./types";

export function isEventLog(log: EventLog<Trace> | VariantLog<Trace>): log is EventLog<Trace> {
  return "traces" in log;
}

export function isVariantLog(log: EventLog<Trace> | VariantLog<Trace>): log is VariantLog<Trace> {
  return "variants" in log;
}

export function isBinaryVariantLog(log: BinaryLog | BinaryVariantLog): log is BinaryVariantLog {
  return Array.isArray(log.traces);
}

export function getVariants<T extends Trace | RoleTrace>(
  log: EventLog<T>
): VariantLog<T> {
  const { variants, count } = collectVariants(log.traces);
  return {
    events: log.events,
    variants,
    count,
  };
}

export function getBinaryVariants(log: BinaryLog): BinaryVariantLog {
  const { variants: traces } = collectVariants(log.traces);
  const { variants: nTraces } = collectVariants(log.nTraces);
  return {
    events: log.events,
    traces,
    nTraces,
  };
}

function hashTrace<T extends Trace | RoleTrace>(traceOrRoleTrace: T): string {
  if (Array.isArray(traceOrRoleTrace)) {
    if (traceOrRoleTrace.length > 0 && typeof traceOrRoleTrace[0] === "string") {
      const trace = traceOrRoleTrace as string[];
      return trace.join(";;");
    } else if (traceOrRoleTrace.length > 0 && typeof traceOrRoleTrace[0] === "object") {
      const roleTrace = traceOrRoleTrace as RoleTrace;
      return roleTrace
        .map((t) => t.activity + "##" + t.role)
        .join(";;");
    }
  }
  return "";
}

function collectVariants<T extends Trace | RoleTrace>(
  traces: { [traceId: string]: T }
): { variants: Variant<T>[]; count: number } {
  const variantsMap = new Map<string, { trace: T; count: number }>();
  let count = 0;

  for (const traceId in traces) {
    const trace = traces[traceId];
    const hash = hashTrace(trace);

    if (!variantsMap.has(hash)) {
      variantsMap.set(hash, { trace, count: 0 });
    }

    variantsMap.get(hash)!.count++;
    count++;
  }

  const variants = Array.from(variantsMap.entries()).map<Variant<T>>(([, val]) => ({
    variantId: crypto.randomUUID(),
    trace: val.trace,
    count: val.count,
  }))
    .sort((a, b) => b.count - a.count);

  return { variants, count };
}

export function filterVariantByTopPercentage(variantLog: VariantLog<Trace>, topPercentage: number): VariantLog<Trace> {
  // topPercantage, being we want the variants that make up the topPercentage of the log, i.e., 
  // 50% of the log should be made up of the top 50% of variants, we can assume the variants 
  // are sorted by count in descending order (highest to lowest)
  
  const totalTraceCount = variantLog.count;
  const targetTraceCount = Math.ceil(topPercentage * totalTraceCount);
  
  const filteredVariants: Variant<Trace>[] = [];
  let accumulatedCount = 0;
  
  for (const variant of variantLog.variants) {
    if (accumulatedCount >= targetTraceCount) {
      break;
    }
    filteredVariants.push(variant);
    accumulatedCount += variant.count;
  }
  
  return {
    events: variantLog.events,
    variants: filteredVariants,
    count: accumulatedCount,
  };
}

export function getRandomInt(min: number, max: number): number {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

export function getRandomItem<T>(set: Set<T>) {
  let items = Array.from(set);
  return items[Math.floor(Math.random() * items.length)];
}

export function randomChoice() {
  return Math.random() < 0.5;
}

// Makes deep copy of a eventMap
export function copyEventMap(eventMap: EventMap): EventMap {
  const copy: EventMap = {};
  for (const startEvent in eventMap) {
    copy[startEvent] = new Set(eventMap[startEvent]);
  }
  return copy;
}

export function copyMarking(marking: Marking): Marking {
  return {
    executed: new Set(marking.executed),
    included: new Set(marking.included),
    pending: new Set(marking.pending),
  };
}

export function reverseRelation(relation: EventMap): EventMap {
  const retRelation: EventMap = {};
  for (const e in relation) {
    retRelation[e] = new Set();
  }
  for (const e in relation) {
    for (const j of relation[e]) {
      retRelation[j].add(e);
    }
  }
  return retRelation;
}

export function relationCount(model: DCRGraph) {
  let count = 0;
  const relCount = (rel: EventMap) => {
    for (const e in rel) {
      for (const _ of rel[e]) {
        count += 1;
      }
    }
  };
  relCount(model.conditionsFor);
  relCount(model.excludesTo);
  relCount(model.includesTo);
  relCount(model.responseTo);
  relCount(model.milestonesFor);
  return count;
}

export function fullRelation(events: Set<Event>): EventMap {
  const retrel: EventMap = {};
  for (const event of events) {
    retrel[event] = new Set(events);
    retrel[event].delete(event);
  }
  return retrel;
}

export function flipEventMap(em: EventMap): EventMap {
  const retval: EventMap = {};
  for (const event of Object.keys(em)) {
    retval[event] = new Set();
  }
  for (const e1 in em) {
    for (const e2 of em[e1]) {
      if (!retval[e2]) retval[e2] = new Set();
      retval[e2].add(e1);
    }
  }
  return retval;
}

// Allows sets to be serialized by converting them to arrays
function set2JSON(_: any, value: any) {
  if (typeof value === "object" && value instanceof Set) {
    return [...value];
  }
  return value;
}

// Parses arrays back to sets
function JSON2Set(key: any, value: any) {
  if (typeof value === "object" && value instanceof Array && key !== "trace") {
    return new Set(value);
  }
  return value;
}

export function writeSerialized<T>(obj: T): string {
  return JSON.stringify(obj, set2JSON, 4);
}

export function parseSerialized<T>(data: string): T {
  const obj = JSON.parse(data, JSON2Set);
  return obj;
}

export function copyTraces(traces: Traces): Traces {
  const copy: Traces = {};
  for (const traceId in traces) {
    copy[traceId] = [...traces[traceId]];
  }
  return copy;
}

export function copyGraph(graph: DCRGraph): DCRGraph {
  return {
    conditionsFor: copyEventMap(graph.conditionsFor),
    events: new Set(graph.events),
    excludesTo: copyEventMap(graph.excludesTo),
    includesTo: copyEventMap(graph.includesTo),
    marking: copyMarking(graph.marking),
    milestonesFor: copyEventMap(graph.milestonesFor),
    responseTo: copyEventMap(graph.responseTo),
  };
}

export function makeEmptyGraph(events: Set<string>) {
  const graph: DCRGraph = {
    events: new Set(events),
    conditionsFor: {},
    excludesTo: {},
    includesTo: {},
    milestonesFor: {},
    responseTo: {},
    marking: {
      executed: new Set<Event>(),
      pending: new Set<Event>(),
      included: new Set(events),
    },
  };
  for (const event of events) {
    graph.conditionsFor[event] = new Set();
    graph.responseTo[event] = new Set();
    graph.excludesTo[event] = new Set();
    graph.includesTo[event] = new Set();
    graph.milestonesFor[event] = new Set();
  }
  return graph;
}

export function makeFullGraph(events: Set<string>) {
  const graph: DCRGraph = {
    events: new Set(events),
    conditionsFor: {},
    excludesTo: {},
    includesTo: {},
    milestonesFor: {},
    responseTo: {},
    marking: {
      executed: new Set<Event>(),
      pending: new Set<Event>(),
      included: new Set(events),
    },
  };
  for (const e of events) {
    graph.conditionsFor[e] = new Set();
    graph.responseTo[e] = new Set();
    graph.excludesTo[e] = new Set();
    graph.includesTo[e] = new Set();
    //graph.excludesTo[e].add(e);
    for (const j of events) {
      if (e !== j) {
        graph.conditionsFor[e].add(j);
        graph.responseTo[e].add(j);
        //graph.includesTo[e].add(j);
      }
      graph.excludesTo[e].add(j);
    }
  }
  return graph;
}

export function customIntersect<T>(s1: Set<T>, s2: Set<T>): Set<T> {
  const retset = new Set<T>();
  const { smallestSet, otherSet } =
    s1.size > s2.size
      ? { smallestSet: s2, otherSet: s1 }
      : { smallestSet: s1, otherSet: s2 };
  for (const elem of smallestSet) {
    if (otherSet.has(elem)) retset.add(elem);
  }
  return retset;
}

export function mutatingUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
  for (const elem of b) {
    a.add(elem);
  }
  return a;
}

export function mutatingDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
  for (const elem of b) {
    a.delete(elem);
  }
  return a;
}

export function mutatingIntersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  for (const elem of a) {
    if (!b.has(elem)) {
      a.delete(elem);
    }
  }
  return a;
}