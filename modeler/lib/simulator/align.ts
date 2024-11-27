import {
  DCRGraph,
  Event,
  Marking,
  SubProcess
} from "./types";
import { copySet } from "./utility";

// Mutates graph's marking
export const execute = (event: Event, graph: DCRGraph, group: DCRGraph | SubProcess) => {
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
  if ('parent' in group && isAccepting(group, graph)) {
    execute(group.id, graph, group.parent);
  }
};

const isAccepting = (group: SubProcess, graph: DCRGraph): boolean => {
  // Group is accepting if the intersections between pending and included events is empty for the events in the group
  let pending = copySet(graph.marking.pending).intersect(graph.marking.included)
  return (
    pending.intersect(group.events).size === 0
  );
};

/*
* Returns a number indicating the state of the event
* 0: enabled
* 1: not included
* 2: parent not enabled
* 3: missing condition
* 4: missing milestone
* group is what the event is a part of, either a DCRGraph or a SubProcess to inherit conditions from the parent
*/
export const isEnabled = (event: Event, graph: DCRGraph, group: SubProcess | DCRGraph): number => {
  if (!graph.marking.included.has(event)) {
    return 1;
  }
  if ('parent' in group) {
    if (isEnabled(group.id, graph, group.parent) != 0) {
      return 2;
    }
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return 3;
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    // If an event milestoning for event is included and executed
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return 4;
    }
  }
  return 0;
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