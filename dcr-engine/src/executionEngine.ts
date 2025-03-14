import init from "./init";
import {
  DCRGraph,
  Event,
  isSubProcess,
  Marking,
  SubProcess
} from "./types";
import { copySet } from "./utility";

init();


// Mutates graph's marking
export const execute = (event: Event, graph: DCRGraph) => {
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

export const isAccepting = (graph: DCRGraph): boolean => {
  // Graph is accepting if the intersections between pending and included events is empty
  return (
    copySet(graph.marking.pending).intersect(graph.marking.included).size === 0
  );
};

export const isEnabled = (event: Event, graph: DCRGraph): boolean => {
  if (!graph.marking.included.has(event)) {
    return false;
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    // return false
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return false;
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    // If an event conditioning for event is included and not executed
    // return false
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return false;
    }
  }
  return true;
};

// Mutates graph's marking
export const executeS = (event: Event, graph: DCRGraph, group: DCRGraph | SubProcess) => {
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
  if (isSubProcess(group) && isAcceptingS(group, graph)) {
    executeS(group.id, graph, group.parent);
  }
};

export const isAcceptingS = (group: SubProcess, graph: DCRGraph): boolean => {
  // Group is accepting if the intersections between pending and included events is empty for the events in the group
  let pending = copySet(graph.marking.pending).intersect(graph.marking.included)
  return (
    pending.intersect(group.events).size === 0
  );
};

const formatEmpty = (label: string): string => {
  return label === "" ? "Unnamed Event" : label;
}

export const isEnabledS = (event: Event, graph: DCRGraph, group: SubProcess | DCRGraph): { enabled: boolean, msg: string } => {
  if (!graph.marking.included.has(event)) {
    return { enabled: false, msg: `${graph.labelMap[event]} is not included...`};
  }
  if (isSubProcess(group)) {
    const subProcessStatus = isEnabledS(group.id, graph, group.parent);
    if (!subProcessStatus.enabled) {
      return subProcessStatus;
    }
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return { enabled: false, msg: `At minimum, ${formatEmpty(graph.labelMap[cEvent])} is conditioning for ${formatEmpty(graph.labelMap[event])}...`};
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    // If an event milestoning for event is included and executed
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return { enabled: false, msg: `At minimum, ${formatEmpty(graph.labelMap[mEvent])} is a milestone for ${formatEmpty(graph.labelMap[event])}...`};
    }
  }
  return { enabled: true, msg: ""};
};