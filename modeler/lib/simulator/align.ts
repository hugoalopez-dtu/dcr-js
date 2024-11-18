import {
  DCRGraph,
  Event,
  Marking,
} from "./types";
import { copySet, copyMarking } from "./utility";

// Mutates graph's marking
export const execute = (event: Event, graph: DCRGraph) => {
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
  if (graph.parent && isAccepting(graph.parent)) {
    execute(graph.id, graph.parent);
  }
};

const isAccepting = (graph: DCRGraph): boolean => {
  // Graph is accepting if the intersections between pending and included events is empty
  return (
    copySet(graph.marking.pending).intersect(graph.marking.included).size === 0
  );
};

export const isEnabled = (event: Event, graph: DCRGraph): boolean => {
  if (!graph.marking.included.has(event)) {
    return false;
  }
  if (graph.parent && !isEnabled(graph.id, graph.parent)) {
    return false;
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return false;
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    // If an event milestoning for event is included and executed
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return false;
    }
  }
  return true;
};

const getEnabled = (graph: DCRGraph): Set<Event> => {
  const retSet = copySet(graph.events);
  for (const event of graph.events) {
    if (!graph.marking.included.has(event)) retSet.delete(event);
    for (const otherEvent of graph.conditionsFor[event]) {
      if (
        graph.marking.included.has(otherEvent) &&
        !graph.marking.executed.has(otherEvent)
      )
        retSet.delete(event);
    }
  }
  return retSet;
};

// Executes fun without permanent side effects to the graphs marking
const newGraphEnv = <T>(graph: DCRGraph, fun: () => T): T => {
  const oldMarking = graph.marking;
  graph.marking = copyMarking(graph.marking);
  const retval = fun();
  graph.marking = oldMarking;
  return retval;
};

// Converts a marking to a uniquely identifying string (naively)
const stateToStr = (marking: Marking): string => {
  let retval = "";
  for (const setI in marking) {
    retval += Array.from(marking[setI as keyof Marking])
      .sort()
      .join();
    retval += ";";
  }
  return retval;
};