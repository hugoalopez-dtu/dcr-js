import type {
  DCRGraph,
  Event,
  EventMap,
  TraceCoverGraph,
  Traces,
  TraceCoverRelation,
  BinaryLog,
  BinaryVariantLog,
} from "./types";

import {
  copyMarking,
  reverseRelation,
  makeEmptyGraph,
  makeFullGraph,
  copyTraces,
  mutatingIntersect,
  mutatingDifference,
  isBinaryVariantLog,
} from "./utility";

// https://www.sciencedirect.com/science/article/pii/S0306437923001758

// Computes sets of which relations cover which negative traces
function findTraceCover(
  initGraph: DCRGraph,
  graphToCover: DCRGraph,
  nTraces: Traces
): TraceCoverGraph {
  const initMarking = copyMarking(initGraph.marking);
  const tcMarking = copyMarking(graphToCover.marking);

  const tcGraph: TraceCoverGraph = {
    conditionsFor: {},
    responseTo: {},
    excludesTo: {},
  };
  const initTCRelation = (
    relation: EventMap,
    tcRelation: TraceCoverRelation
  ) => {
    for (const e in relation) {
      tcRelation[e] = {};
      for (const j of relation[e]) {
        tcRelation[e][j] = new Set();
      }
    }
  };
  initTCRelation(graphToCover.conditionsFor, tcGraph.conditionsFor);
  initTCRelation(graphToCover.responseTo, tcGraph.responseTo);
  initTCRelation(graphToCover.excludesTo, tcGraph.excludesTo);

  // Mutates graph's marking
  function execute(event: Event, graph: DCRGraph) {
    graph.marking.executed.add(event);
    graph.marking.pending.delete(event);
    // Add sink of all response relations to pending
    for (const rEvent of graph.responseTo[event]) {
      graph.marking.pending.add(rEvent);
    }
    // Remove sink of all response relations from included
    for (const eEvent of graph.excludesTo[event]) {
      graph.marking.included.delete(eEvent);
    }
    // Add sink of all include relations to included
    for (const iEvent of graph.includesTo[event]) {
      graph.marking.included.add(iEvent);
    }
  }

  // Copies and flips excludesTo and responseTo to easily find all events that are the sources of the relations
  const excludesFor = reverseRelation(graphToCover.excludesTo);
  const responseFor = reverseRelation(graphToCover.responseTo);

  for (const traceId in nTraces) {
    // For each event, e, keeps track of which events have been executed since e was last included
    const localExSinceIn: EventMap = {};
    // For each event, e, keeps track of which events have been executed since e was executed
    const localExSinceEx: EventMap = {};
    for (const event of initGraph.events) {
      localExSinceIn[event] = new Set();
      localExSinceEx[event] = new Set();
    }

    for (const event of nTraces[traceId]) {
      execute(event, graphToCover);
      // Also update marking in initial graph, to use when computing which
      // conditions and responses cover traces
      execute(event, initGraph);

      // For all events that are included (based on the existing graph) but not executed, a conditionsFor would cover this trace
      const pConds = mutatingDifference(
        new Set(initGraph.marking.included),
        initGraph.marking.executed
      );

      // Possible conditions that also exists cover this trace
      for (const otherEvent of mutatingIntersect(
        pConds,
        graphToCover.conditionsFor[event]
      )) {
        tcGraph.conditionsFor[event][otherEvent].add(traceId);
      }

      // If event is not included, then for all events, 'otherEvent' that has been executed since 'event'
      // was last included, the relation otherEvent ->% event covers the trace
      if (!graphToCover.marking.included.has(event)) {
        for (const otherEvent of mutatingIntersect(
          new Set(localExSinceIn[event]),
          excludesFor[event]
        )) {
          tcGraph.excludesTo[otherEvent][event].add(traceId);
        }
      }

      // For all events included by 'event' clear executed since included set
      for (const otherEvent of initGraph.includesTo[event]) {
        localExSinceIn[otherEvent] = new Set();
      }
      // Add to executed since included for all events
      for (const otherEvent of initGraph.events) {
        localExSinceEx[otherEvent].add(event);
        localExSinceIn[otherEvent].add(event);
      }
      // Clear executed since set
      localExSinceEx[event] = new Set([event]);
    }

    // For all pending events (that are included according to the initial graph), event, at the end of a trace, all relations
    // s.t. otherEvent *-> event, where otherEvent has been executed
    // after event was last executed covers the trace
    for (const event of mutatingIntersect(
      new Set(graphToCover.marking.pending),
      initGraph.marking.included
    )) {
      for (const otherEvent of mutatingIntersect(
        new Set(responseFor[event]),
        localExSinceEx[event]
      )) {
        tcGraph.responseTo[otherEvent][event].add(traceId);
      }
    }

    initGraph.marking = copyMarking(initMarking);
    graphToCover.marking = copyMarking(tcMarking);
  }

  return tcGraph;
}

type RelName = "cond" | "resp" | "excl" | "";

interface Rel {
  event: Event;
  otherEvent: Event;
  relName: RelName;
}

// Helper function that computes weighted size of a cover set.
//
// When weights are empty, falls back to size of set to preserve original 
// behavior for non-variant BinaryLog inputs. Otherwise, use the sum of variant 
// sizes (weights) to preserve original behavior for variant BinaryLog inputs.
function getSize(set: Set<string>, weights: Record<string, number>): number {
  if (Object.keys(weights).length === 0) return set.size;
  let total = 0;
  for (const id of set) {
    total += weights[id] ?? 1;
  }
  return total;
}

// Adds best relation to graph, returns set of traces covered
function reduceTraceCover(
  graph: DCRGraph,
  tcGraph: TraceCoverGraph,
  posTcGraph: TraceCoverGraph,
  onlyPos: boolean,
  weights: Record<string, number> = {}
): Set<string> {
  const nameToRelations = (
    relName: RelName
  ): { rel: EventMap; tcRel: TraceCoverRelation } => {
    if (relName == "cond")
      return { rel: graph.conditionsFor, tcRel: tcGraph.conditionsFor };
    if (relName == "resp")
      return { rel: graph.responseTo, tcRel: tcGraph.responseTo };
    if (relName == "excl")
      return { rel: graph.excludesTo, tcRel: tcGraph.excludesTo };
    throw new Error("Mapping requested for empty string!");
  };

  const findBiggestCover = (): Rel => {
    let res: Rel = { relName: "", event: "", otherEvent: "" };
    let max = 0;

    const findBiggestRel = (
      rel: TraceCoverRelation,
      relName: RelName,
      posRel: TraceCoverRelation | undefined
    ) => {
      for (const event in rel) {
        for (const otherEvent in rel[event]) {
          const relSize = getSize(rel[event][otherEvent], weights);
          let cond;
          if (posRel && !onlyPos) {
            const posSize = getSize(posRel[event][otherEvent], weights);
            cond = relSize - posSize > max;
          } else if (posRel && onlyPos) {
            const posSize = getSize(posRel[event][otherEvent], weights);
            cond = posSize === 0 && relSize > max;
          } else {
            cond = relSize > max;
          }
          if (cond) {
            max = relSize;
            res = { relName, event, otherEvent };
          }
        }
      }
    };
    findBiggestRel(tcGraph.conditionsFor, "cond", posTcGraph?.conditionsFor);
    findBiggestRel(tcGraph.responseTo, "resp", posTcGraph?.responseTo);
    findBiggestRel(tcGraph.excludesTo, "excl", posTcGraph?.excludesTo);
    return res;
  };

  let cover = findBiggestCover();
  if (cover.relName === "") return new Set();
  else {
    const { rel, tcRel } = nameToRelations(cover.relName);
    const tcSet = new Set(tcRel[cover.event][cover.otherEvent]);
    rel[cover.event].add(cover.otherEvent);
    return tcSet;
  }
}

export default function rejectionMiner(
  log: BinaryLog | BinaryVariantLog,
  optimizePrecision: boolean = true
): DCRGraph {
  // When using "BinaryVariantLog" instead of "BinaryLog", identical traces 
  // are deduplicated into variants with counts. Since identical traces produce 
  // identical execution paths in "findTraceCover" and thus identical cover set 
  // memberships, processing each variant once is equivalent to processing all 
  // its duplicates. The `weights` map ensures that "reduceTraceCover" accounts 
  // for variant frequency, preserving the same behavior as with raw duplicate 
  // traces.
  let nTraces: Traces;
  let traces: Traces;
  const weights: Record<string, number> = {};

  if (isBinaryVariantLog(log)) {
    nTraces = {};
    for (const variant of log.nTraces) {
      nTraces[variant.variantId] = [...variant.trace];
      weights[variant.variantId] = variant.count;
    }
    
    traces = {};
    for (const variant of log.traces) {
      traces[variant.variantId] = variant.trace;
      weights[variant.variantId] = variant.count;
    }
  } else {
    nTraces = copyTraces(log.nTraces);
    traces = log.traces;
  }

  const graph = makeEmptyGraph(log.events);
  const patterns = makeFullGraph(log.events);

  let coveredTraces = null;
  let coveredTracesCount = 0;
  while (coveredTraces === null || coveredTraces.size != 0) {
    if (coveredTraces !== null) {
      for (const traceId of coveredTraces) {
        delete nTraces[traceId];
      }
    }

    const tcGraph = findTraceCover(graph, patterns, nTraces);
    const posTcGraph = findTraceCover(graph, patterns, traces);
    // Reduce graph to smallest trace cover of negative traces
    coveredTraces = reduceTraceCover(graph, tcGraph, posTcGraph, true, weights);
    coveredTracesCount += coveredTraces.size;
  }

  console.log(graph);

  if (Object.keys(nTraces).length !== coveredTracesCount && optimizePrecision) {
    let initial = true;
    console.log("Optimizing!");
    while (coveredTraces.size !== 0 || initial) {
      for (const traceId of coveredTraces) {
        delete nTraces[traceId];
      }
      const negTcGraph = findTraceCover(graph, patterns, nTraces);
      const posTcGraph = findTraceCover(graph, patterns, traces);
      coveredTraces = reduceTraceCover(graph, negTcGraph, posTcGraph, false, weights);
      initial = false;
    }
  }

  return graph;
}
