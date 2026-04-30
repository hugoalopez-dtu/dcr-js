import init from "./init";
import {
  DCRGraph,
  DCRGraphS,
  Event,
  isSubProcess,
  SubProcess
} from "./types";
import { copySet } from "./utility";

init();


// Mutates graph's marking
export const execute = (event: Event, graph: DCRGraph) => {
  console.log(`Executing event: ${event}`);
  graph.marking.executed.add(event);
  graph.marking.pending.delete(event);
  // Add sink of all response relations to pending
  for (const rEvent of graph.responseTo[event]) {
    console.log(`Adding to pending due to response relation: ${rEvent}`);
    graph.marking.pending.add(rEvent);
  }
  // Remove sink of all response relations from included
  for (const eEvent of graph.excludesTo[event]) {
    console.log(`Removing from included due to exclude relation: ${eEvent}`);
    graph.marking.included.delete(eEvent);
  }
  // Add sink of all include relations to included
  for (const iEvent of graph.includesTo[event]) {
    console.log(`Adding to included due to include relation: ${iEvent}`);
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
  console.log(`Checking if event is enabled: ${event}`);
  if (!graph.marking.included.has(event)) {
    console.log(`Event ${event} is not included.`);
    return false;
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    // return false
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      console.log(`Event ${event} is not enabled because condition ${cEvent} is not executed.`);
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
      console.log(`Event ${event} is not enabled because milestone ${mEvent} is pending.`);
      return false;
    }
  }
  console.log(`Event ${event} is enabled.`);
  return true;
};

// Mutates graph's marking
export const executeS = (event: Event, graph: DCRGraphS) => {
  graph.marking.executed.add(event);
  graph.marking.pending.delete(event);
  // Remove sink of all response relations from included
  for (const eEvent of graph.excludesTo[event]) {
    graph.marking.included.delete(eEvent);
  }
  // Add sink of all include relations to included
  for (const iEvent of graph.includesTo[event]) {
    graph.marking.included.add(iEvent);
  }
  // Add sink of all response relations to pending
  for (const rEvent of graph.responseTo[event]) {
    graph.marking.pending.add(rEvent);
  }

  const group = graph.subProcessMap[event];
  if (group && isAcceptingS(group, graph)) {
    executeS(group.id, graph);
  }
};

const hasExcludedElder = (group: SubProcess, graph: DCRGraphS) => {
  if (!graph.marking.included.has(group.id)) return true;
  if (!isSubProcess(group.parent)) return false;
  return hasExcludedElder(group.parent, graph);
}

export const isAcceptingS = (group: SubProcess | DCRGraphS, graph: DCRGraphS): boolean => {
  // Group is accepting if the intersections between pending and included events is empty for the events in the group
  let pending = copySet(graph.marking.pending).intersect(graph.marking.included);
  for (const blockingEvent of pending.intersect(group.events)) {
    const group = graph.subProcessMap[blockingEvent];
    if (!group || !hasExcludedElder(group, graph)) return false;
  }
  return true;
};

const formatEmpty = (label: string, title: string): string => {
  return label === "" ? `Unnamed ${title}` : label;
}

export const isEnabledS = (event: Event, graph: DCRGraphS, group: SubProcess | DCRGraph): { enabled: boolean, msg: string } => {
  console.log(`Checking if event is enabled in subprocess: ${event}`);
  console.log(`Graph state before evaluation: Included: ${[...graph.marking.included]}, Executed: ${[...graph.marking.executed]}, Pending: ${[...graph.marking.pending]}`);

  if (!graph.marking.included.has(event)) {
    const msg = `${formatEmpty(graph.labelMap[event], "Subprocess")} is not included...`;
    console.log(msg);
    return { enabled: false, msg };
  }
  if (isSubProcess(group)) {
    const subProcessStatus = isEnabledS(group.id, graph, group.parent);
    if (!subProcessStatus.enabled) {
      return subProcessStatus;
    }
  }
  for (const cEvent of graph.conditionsFor[event]) {
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      const msg = `At minimum, ${formatEmpty(graph.labelMap[cEvent], "Event")} is conditioning for ${formatEmpty(graph.labelMap[event], "Event")}...`;
      console.log(msg);
      return { enabled: false, msg };
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      const msg = `At minimum, ${formatEmpty(graph.labelMap[mEvent], "Event")} is a milestone for ${formatEmpty(graph.labelMap[event], "Event")}...`;
      console.log(msg);
      return { enabled: false, msg };
    }
  }
  console.log(`Event ${event} is enabled in subprocess.`);
  return { enabled: true, msg: "" };
};

export const printEventLabels = (graph: DCRGraphS) => {
  console.log("Mapping of events to labels:");
  for (const [event, label] of Object.entries(graph.labelMap)) {
    console.log(`Event: ${event}, Label: ${label}`);
  }
};