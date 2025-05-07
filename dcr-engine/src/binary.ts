import type {
  DCRGraph,
  Event,
  EventMap,
  TraceCoverGraph,
  Traces,
  TraceCoverRelation,
  BinaryLog,
} from "./types";

import {
  copySet,
  copyMarking,
  reverseRelation,
  makeEmptyGraph,
  makeFullGraph,
  copyTraces,
} from "./utility";

// Computes sets of which relations cover which negative traces
const findTraceCover = (
  initGraph: DCRGraph,
  graphToCover: DCRGraph,
  nTraces: Traces
): TraceCoverGraph => {
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
  const execute = (event: Event, graph: DCRGraph) => {
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
  };

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
      const pConds = copySet(initGraph.marking.included).difference(
        initGraph.marking.executed
      );

      // Possible conditions that also exists cover this trace
      for (const otherEvent of pConds.intersect(
        graphToCover.conditionsFor[event]
      )) {
        tcGraph.conditionsFor[event][otherEvent].add(traceId);
      }

      // If event is not included, then for all events, 'otherEvent' that has been executed since 'event'
      // was last included, the relation otherEvent ->% event covers the trace
      if (!graphToCover.marking.included.has(event)) {
        for (const otherEvent of copySet(localExSinceIn[event]).intersect(
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
    for (const event of copySet(graphToCover.marking.pending).intersect(
      initGraph.marking.included
    )) {
      for (const otherEvent of copySet(responseFor[event]).intersect(
        localExSinceEx[event]
      )) {
        tcGraph.responseTo[otherEvent][event].add(traceId);
      }
    }

    initGraph.marking = copyMarking(initMarking);
    graphToCover.marking = copyMarking(tcMarking);
  }

  return tcGraph;
};

type RelName = "cond" | "resp" | "excl" | "";

interface Rel {
  event: Event;
  otherEvent: Event;
  relName: RelName;
}

// Adds best relation to graph, returns set of traces covered
const reduceTraceCover = (
  graph: DCRGraph,
  tcGraph: TraceCoverGraph,
  posTcGraph: TraceCoverGraph,
  onlyPos: boolean
): Set<string> => {
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
          let cond;
          if (posRel && !onlyPos) {
            cond =
              rel[event][otherEvent].size - posRel[event][otherEvent].size >
              max;
          } else if (posRel && onlyPos) {
            cond =
              posRel[event][otherEvent].size === 0 &&
              rel[event][otherEvent].size > max;
          } else {
            cond = rel[event][otherEvent].size > max;
          }
          if (cond) {
            max = rel[event][otherEvent].size;
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
    const tcSet = copySet(tcRel[cover.event][cover.otherEvent]);
    rel[cover.event].add(cover.otherEvent);
    return tcSet;
  }
};

const rejectionMiner = (log: BinaryLog, optimizePrecision: boolean = true): DCRGraph => {
  const nTraces = copyTraces(log.nTraces);
  const traces = log.traces;

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
    coveredTraces = reduceTraceCover(graph, tcGraph, posTcGraph, true);
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
      coveredTraces = reduceTraceCover(graph, negTcGraph, posTcGraph, false);
      initial = false;
    }
  }

  return graph;
};

export default rejectionMiner;