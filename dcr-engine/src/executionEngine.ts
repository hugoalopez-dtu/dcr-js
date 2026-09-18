import type { DCRGraph, DCRGraphS, Event, SubProcess, VariableStore } from "./types";

import { isSubProcess } from "./types";
import { mutatingIntersect } from "./utility";
import { evaluateGuard, getGuard } from "./guardEval";

// Mutates graph's marking
export function execute(event: Event, graph: DCRGraph) {
  graph.marking.executed.set(event, {});
  graph.marking.pending.delete(event);

  for (const responseEvent of graph.responseTo[event]) {
    graph.marking.pending.set(responseEvent, undefined);
  }

  for (const excludeEvent of graph.excludesTo[event]) {
    graph.marking.included.delete(excludeEvent);
  }

  for (const includeEvent of graph.includesTo[event]) {
    graph.marking.included.add(includeEvent);
  }
}

export function isAccepting(graph: DCRGraph): boolean {
  return (
    mutatingIntersect(new Set(graph.marking.pending.keys()), graph.marking.included)
      .size === 0
  );
}

export function isEnabled(event: Event, graph: DCRGraph): boolean {
  if (!graph.marking.included.has(event)) {
    return false;
  }

  for (const conditionEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    // return false
    if (
      graph.marking.included.has(conditionEvent) &&
      !graph.marking.executed.has(conditionEvent)
    ) {
      return false;
    }
  }

  for (const milestoneEvent of graph.milestonesFor[event]) {
    // If an event conditioning for event is included and not executed
    // return false
    if (
      graph.marking.included.has(milestoneEvent) &&
      graph.marking.pending.has(milestoneEvent)
    ) {
      return false;
    }
  }

  return true;
}

// Mutates graph's marking
export const executeS = (
  event: Event,
  graph: DCRGraphS,
  variableStore: VariableStore = {},
  currentTime?: Date
) => {
  graph.marking.executed.set(event, {
    time: currentTime,
    variableSnapshot: { ...variableStore },
  });
  graph.marking.pending.delete(event);

  for (const eEvent of graph.excludesTo[event]) {
    const guard = getGuard(graph.guardMap, event, eEvent, "exclude");
    if (evaluateGuard(guard, variableStore)) {
      graph.marking.included.delete(eEvent);
    }
  }
  for (const iEvent of graph.includesTo[event]) {
    const guard = getGuard(graph.guardMap, event, iEvent, "include");
    if (evaluateGuard(guard, variableStore)) {
      graph.marking.included.add(iEvent);
    }
  }
  for (const rEvent of graph.responseTo[event]) {
    const guard = getGuard(graph.guardMap, event, rEvent, "response");
    if (evaluateGuard(guard, variableStore)) {
      const deadlineMs = graph.timeConstraintMap?.[event]?.[rEvent]?.deadline;
      const deadline = deadlineMs !== undefined && currentTime !== undefined
        ? new Date(currentTime.getTime() + deadlineMs)
        : undefined;
      graph.marking.pending.set(rEvent, deadline);
    }
  }

  const group = graph.subProcessMap[event];
  if (group && isAcceptingS(group, graph)) {
    executeS(group.id, graph, variableStore, currentTime);
  }
};

function hasExcludedElder(group: SubProcess, graph: DCRGraphS) {
  if (!graph.marking.included.has(group.id)) {
    return true;
  }

  if (!isSubProcess(group.parent)) {
    return false;
  }

  return hasExcludedElder(group.parent, graph);
}

export function isAcceptingS(
  group: SubProcess | DCRGraphS,
  graph: DCRGraphS
): boolean {
  // Group is accepting if the intersections between pending and included events is empty for the events in the group
  let pending = mutatingIntersect(
    new Set(graph.marking.pending.keys()),
    graph.marking.included
  );

  for (const blockingEvent of mutatingIntersect(pending, group.events)) {
    const group = graph.subProcessMap[blockingEvent];
    if (!group || !hasExcludedElder(group, graph)) {
      return false;
    }
  }

  return true;
}

function formatEmpty(label: string, title: string): string {
  return label === "" ? `Unnamed ${title}` : label;
}

export function isEnabledS(
  event: Event,
  graph: DCRGraphS,
  group: SubProcess | DCRGraph,
  variableStore: VariableStore = {},
  currentTime?: Date
): { enabled: boolean; msg: string } {
  if (!graph.marking.included.has(event)) {
    return {
      enabled: false,
      msg: `${formatEmpty(graph.labelMap[event], "Subprocess")} is not included...`,
    };
  }

  if (isSubProcess(group)) {
    const subProcessStatus = isEnabledS(group.id, graph, group.parent, variableStore, currentTime);
    if (!subProcessStatus.enabled) {
      return subProcessStatus;
    }
  }

  for (const cEvent of graph.conditionsFor[event]) {
    if (!graph.marking.included.has(cEvent)) continue;

    const guard = getGuard(graph.guardMap, cEvent, event, "condition");
    if (guard && !evaluateGuard(guard, variableStore)) continue;

    if (!graph.marking.executed.has(cEvent)) {
      return {
        enabled: false,
        msg: `At minimum, ${formatEmpty(graph.labelMap[cEvent], "Event")} is conditioning for ${formatEmpty(graph.labelMap[event], "Event")}...`,
      };
    }

    const delayMs = graph.timeConstraintMap?.[cEvent]?.[event]?.delay;
    if (delayMs !== undefined) {
      const executedAt = graph.marking.executed.get(cEvent)?.time;
      if (!executedAt || !currentTime || currentTime.getTime() - executedAt.getTime() < delayMs) {
        return {
          enabled: false,
          msg: `Delay from ${formatEmpty(graph.labelMap[cEvent], "Event")} to ${formatEmpty(graph.labelMap[event], "Event")} has not elapsed yet...`,
        };
      }
    }
  }

  for (const mEvent of graph.milestonesFor[event]) {
    if (!graph.marking.included.has(mEvent) || !graph.marking.pending.has(mEvent)) continue;

    const mGuard = getGuard(graph.guardMap, mEvent, event, "milestone");
    if (mGuard && !evaluateGuard(mGuard, variableStore)) continue;

    return {
      enabled: false,
      msg: `At minimum, ${formatEmpty(graph.labelMap[mEvent], "Event")} is a milestone for ${formatEmpty(graph.labelMap[event], "Event")}...`,
    };
  }
  return { enabled: true, msg: "" };
}
