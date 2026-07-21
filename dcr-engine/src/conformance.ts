import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { evaluateGuard } from "./guardEval";
import type {
  DCRGraphS,
  Event,
  EventMap,
  FuzzyRelation,
  RelationActivations,
  RelationViolations,
  RoleTrace,
  VariableStore,
} from "./types";
import {
  copyEventMap,
  copyMarking,
  mutatingDifference,
  mutatingIntersect,
  mutatingUnion,
} from "./utility";

// https://link.springer.com/book/10.1007/978-3-319-99414-7

// Tracks currently-open response-deadline obligations during quantifyViolations' replay:
// obligations[target][source] = the time source executed, creating that specific obligation.
// Per-(source, target) rather than a single flag per target, so that one target with several
// deadline-bearing sources doesn't confuse an already-discharged obligation from one source
// with a still-open obligation from another.
type DeadlineObligations = Record<Event, Record<Event, number>>;

// Tracks which guarded exclude/response relations are currently "standing" - i.e. actually
// fired (guard held) at the source's own execution time, and not yet undone:
// guardedExcludes[source][target] = 1: source executed while its exclude guard toward target
// held, and target has not been genuinely re-included since.
// guardedResponses[source][target] = 1: source executed while its response guard toward target
// held, and target has not executed since (the obligation is still undischarged).
// Used instead of the static excludesTo/responseTo graph so that violation attribution reflects
// what actually fired at runtime rather than every statically-possible source.
type GuardedFiring = FuzzyRelation;

function copyFuzzyRelation(rel: GuardedFiring): GuardedFiring {
  return Object.fromEntries(
    Object.entries(rel).map(([source, targets]) => [source, { ...targets }])
  );
}

export function replayTraceS(
  graph: DCRGraphS,
  trace: RoleTrace,
  variableStore: VariableStore = {},
  executionTimestamps: Map<Event, number> = new Map()
): boolean {
  let retval = false;

  if (trace.length === 0) return isAcceptingS(graph, graph);

  const [head, ...tail] = trace;
  // Open world principle!
  if (!graph.labels.has(head.activity)) {
    return replayTraceS(graph, tail, variableStore, executionTimestamps);
  }

  const updatedStore: VariableStore =
    head.varName !== undefined && head.value !== undefined
      ? { ...variableStore, [head.varName]: head.value }
      : variableStore;

  
  const headTime = head.timestamp;
  const initMarking = copyMarking(graph.marking);

  for (const event of graph.labelMapInv[head.activity]) {
    if (!(head.role === graph.roleMap[event])) continue;
    const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
    if (!isEnabledS(event, graph, group, updatedStore, headTime).enabled) continue;

    const updatedTimestamps = new Map(executionTimestamps);
    if (head.timestamp) updatedTimestamps.set(event, head.timestamp.getTime());

    executeS(event, graph, updatedStore, headTime);
    retval = retval || replayTraceS(graph, tail, updatedStore, updatedTimestamps);
    graph.marking = copyMarking(initMarking);
  }

  return retval;
}

function mergeFuzzyRelations(
  viols1: FuzzyRelation,
  viols2: FuzzyRelation
): FuzzyRelation {
  const retval: FuzzyRelation = { ...viols1 };
  for (const e1 in viols2) {
    if (e1 in retval) {
      retval[e1] = Object.entries(viols2[e1]).reduce(
        (acc, [key, value]) =>
          ({ ...acc, [key]: (acc[key] || 0) + value }),
        retval[e1]
      );
    } else {
      retval[e1] = { ...viols2[e1] };
    }
  }
  return retval;
}

export function mergeViolations(
  viols1: RelationViolations,
  viols2: RelationViolations
): RelationViolations {
  return {
    conditionsFor: mergeFuzzyRelations(viols1.conditionsFor, viols2.conditionsFor),
    responseTo: mergeFuzzyRelations(viols1.responseTo, viols2.responseTo),
    excludesTo: mergeFuzzyRelations(viols1.excludesTo, viols2.excludesTo),
    milestonesFor: mergeFuzzyRelations(viols1.milestonesFor, viols2.milestonesFor),
  };
}

export function mergeActivations(
  acts1: RelationActivations,
  acts2: RelationActivations
): RelationActivations {
  return {
    conditionsFor: mergeFuzzyRelations(acts1.conditionsFor, acts2.conditionsFor),
    responseTo: mergeFuzzyRelations(acts1.responseTo, acts2.responseTo),
    excludesTo: mergeFuzzyRelations(acts1.excludesTo, acts2.excludesTo),
    milestonesFor: mergeFuzzyRelations(acts1.milestonesFor, acts2.milestonesFor),
    includesTo: mergeFuzzyRelations(acts1.includesTo, acts2.includesTo),
  };
}

export function emptyFuzzyRel(events: Set<Event>): FuzzyRelation {
  const retval: FuzzyRelation = {};
  for (const event of events) {
    retval[event] = {};
    for (const event2 of events) {
      retval[event][event2] = 0;
    }
  }
  return retval;
}

function emptyEventMap(events: Set<Event>): EventMap {
  const retval: EventMap = {};
  for (const event of events) {
    retval[event] = new Set();
  }
  return retval;
}

function computeActivations(
  executedEvent: Event,
  rel: EventMap,
  getGuard: (event2: Event) => string | undefined,
  variableStore: VariableStore
): FuzzyRelation {
  const retval: FuzzyRelation = {};
  if (rel[executedEvent]?.size) {
    retval[executedEvent] = {};
    for (const event2 of rel[executedEvent]) {
      const guard = getGuard(event2);
      retval[executedEvent][event2] = (!guard || evaluateGuard(guard, variableStore)) ? 1 : 0;
    }
  }
  return retval;
}

export function quantifyViolations(
  graph: DCRGraphS,
  trace: RoleTrace,
  initialVariableStore: VariableStore = {}
): {
  totalViolations: number;
  totalTimeViolations: number;
  violations: RelationViolations;
  timeViolations: RelationViolations;
  activations: RelationActivations;
  stepViolations: number[];
  stepTimeViolations: number[];
  finalStateAccepting: boolean;
} {
  const allEvents = mutatingUnion(
    Object.values(graph.subProcesses).reduce(
      (acc, cum) => mutatingUnion(acc, cum.events),
      new Set(graph.events)
    ),
    new Set(Object.keys(graph.subProcesses))
  );

  const quantifyRec = (
    graph: DCRGraphS,
    trace: RoleTrace,
    exSinceIn: EventMap,
    exSinceEx: EventMap,
    variableStore: VariableStore,
    executionTimestamps: Map<Event, number>,
    obligations: DeadlineObligations,
    guardedExcludes: GuardedFiring,
    guardedResponses: GuardedFiring
  ): {
    totalViolations: number;
    totalTimeViolations: number;
    violations: RelationViolations;
    timeViolations: RelationViolations;
    activations: RelationActivations;
    stepViolations: number[];
    stepTimeViolations: number[];
    finalStateAccepting: boolean;
  } => {
    if (trace.length === 0) {
      const responseTo: FuzzyRelation = {};
      let totalViolations = 0;
      const pendingIncluded = mutatingIntersect(
        new Set(graph.marking.pending.keys()),
        graph.marking.included
      );
      for (const event of pendingIncluded) {
        for (const otherEvent in guardedResponses) {
          if (!guardedResponses[otherEvent]?.[event]) continue;
          if (!responseTo[otherEvent]) responseTo[otherEvent] = {};
          responseTo[otherEvent][event] = (responseTo[otherEvent][event] || 0) + 1;
          totalViolations++;
        }
      }
      return {
        totalViolations,
        totalTimeViolations: 0,
        violations: {
          conditionsFor: {},
          responseTo,
          excludesTo: {},
          milestonesFor: {},
        },
        timeViolations: {
          conditionsFor: {},
          responseTo: {},
          excludesTo: {},
          milestonesFor: {},
        },
        activations: {
          conditionsFor: {},
          responseTo: {},
          excludesTo: {},
          milestonesFor: {},
          includesTo: {},
        },
        stepViolations: [],
        stepTimeViolations: [],
        finalStateAccepting: pendingIncluded.size === 0,
      };
    }

    const [head, ...tail] = trace;

    if (!graph.labels.has(head.activity)) {
      const skipped = quantifyRec(graph, tail, exSinceIn, exSinceEx, variableStore, executionTimestamps, obligations, guardedExcludes, guardedResponses);
      return { ...skipped, stepViolations: [0, ...skipped.stepViolations], stepTimeViolations: [0, ...skipped.stepTimeViolations] };
    }

    const updatedStore: VariableStore =
      head.varName !== undefined && head.value !== undefined
        ? { ...variableStore, [head.varName]: head.value }
        : variableStore;

    const headTime = head.timestamp?.getTime();

    let leastViolations = Infinity;
    let bestTotalTimeViolations = 0;
    let bestStepViolations: number[] = [];
    let bestStepTimeViolations: number[] = [];
    let bestFinalStateAccepting = false;
    let bestRelationViolations: RelationViolations = {
      conditionsFor: {},
      responseTo: {},
      excludesTo: {},
      milestonesFor: {},
    };
    let bestRelationTimeViolations: RelationViolations = {
      conditionsFor: {},
      responseTo: {},
      excludesTo: {},
      milestonesFor: {},
    };
    let bestRelationActivations: RelationActivations = {
      conditionsFor: {},
      responseTo: {},
      excludesTo: {},
      milestonesFor: {},
      includesTo: {},
    };

    const initMarking = copyMarking(graph.marking);

    for (const event of graph.labelMapInv[head.activity]) {
      if (!(head.role === graph.roleMap[event])) continue;

      const localExSinceIn = copyEventMap(exSinceIn);
      const localExSinceEx = copyEventMap(exSinceEx);
      const localGuardedExcludes = copyFuzzyRelation(guardedExcludes);
      const localGuardedResponses = copyFuzzyRelation(guardedResponses);
      let localViolationCount = 0;
      let localTimeViolationCount = 0;
      const localViolations: RelationViolations = {
        conditionsFor: {},
        responseTo: {},
        excludesTo: {},
        milestonesFor: {},
      };
      const localTimeViolations: RelationViolations = {
        conditionsFor: {},
        responseTo: {},
        excludesTo: {},
        milestonesFor: {},
      };

      const localActivations: RelationActivations = {
        conditionsFor: computeActivations(event, graph.conditionsFor,
          (e2) => graph.guardMap?.[e2]?.[event]?.['condition'], updatedStore),
        responseTo: computeActivations(event, graph.responseTo,
          (e2) => graph.guardMap?.[event]?.[e2]?.['response'], updatedStore),
        excludesTo: computeActivations(event, graph.excludesTo,
          (e2) => graph.guardMap?.[event]?.[e2]?.['exclude'], updatedStore),
        milestonesFor: computeActivations(event, graph.milestonesFor,
          (e2) => graph.guardMap?.[e2]?.[event]?.['milestone'], updatedStore),
        includesTo: computeActivations(event, graph.includesTo,
          (e2) => graph.guardMap?.[event]?.[e2]?.['include'], updatedStore),
      };

      const checkTemporalViolations = (
        checkedEvent: Event,
        timestamps: Map<Event, number>
      ) => {
        if (!graph.timeConstraintMap) return;

        // A missing timestamp - either on checkedEvent itself (headTime) or on the
        // relation's source event - means we can't confirm the delay/deadline was
        // respected. Therefore that counts as a violation.
        for (const otherEvent of graph.conditionsFor[checkedEvent] ?? []) {
          if (!graph.marking.included.has(otherEvent)) continue;
          if (!graph.marking.executed.has(otherEvent)) continue;
          const guard = graph.guardMap?.[otherEvent]?.[checkedEvent]?.['condition'];
          if (guard && !evaluateGuard(guard, updatedStore)) continue;
          const delay = graph.timeConstraintMap[otherEvent]?.[checkedEvent]?.delay;
          if (delay === undefined) continue;
          const sourceTime = timestamps.get(otherEvent);
          if (headTime === undefined || sourceTime === undefined || headTime - sourceTime < delay) {
            if (!localTimeViolations.conditionsFor[checkedEvent]) localTimeViolations.conditionsFor[checkedEvent] = {};
            localTimeViolations.conditionsFor[checkedEvent][otherEvent] = (localTimeViolations.conditionsFor[checkedEvent][otherEvent] || 0) + 1;
            localViolationCount++;
            localTimeViolationCount++;
          }
        }

        // Only currently-open obligations on checkedEvent are in here (see DeadlineObligations) -
        // an already-discharged obligation from an earlier execution simply isn't present, so
        // there's no risk of confusing it with a still-open one from a different source.
        for (const source in obligations[checkedEvent] ?? {}) {
          const deadline = graph.timeConstraintMap[source]?.[checkedEvent]?.deadline;
          if (deadline === undefined) continue;
          const obligationTime = obligations[checkedEvent][source];
          if (headTime === undefined || headTime - obligationTime > deadline) {
            if (!localTimeViolations.responseTo[source]) localTimeViolations.responseTo[source] = {};
            localTimeViolations.responseTo[source][checkedEvent] = (localTimeViolations.responseTo[source][checkedEvent] || 0) + 1;
            localViolationCount++;
            localTimeViolationCount++;
          }
        }
      };

      for (const otherEvent of mutatingDifference(
        new Set(graph.conditionsFor[event]),
        new Set(graph.marking.executed.keys())
      )) {
        if (!graph.marking.included.has(otherEvent)) continue;
        const guard = graph.guardMap?.[otherEvent]?.[event]?.['condition'];
        if (guard && !evaluateGuard(guard, updatedStore)) continue;
        if (!localViolations.conditionsFor[event]) localViolations.conditionsFor[event] = {};
        localViolations.conditionsFor[event][otherEvent] = (localViolations.conditionsFor[event][otherEvent] || 0) + 1;
        localViolationCount++;
      }

      checkTemporalViolations(event, executionTimestamps);

      // Milestone violations
      for (const otherEvent of mutatingIntersect(
        new Set(graph.milestonesFor[event]),
        new Set(graph.marking.pending.keys())
      )) {
        if (!graph.marking.included.has(otherEvent)) continue;
        const guard = graph.guardMap?.[otherEvent]?.[event]?.['milestone'];
        if (guard && !evaluateGuard(guard, updatedStore)) continue;
        if (!localViolations.milestonesFor[event]) localViolations.milestonesFor[event] = {};
        localViolations.milestonesFor[event][otherEvent] = (localViolations.milestonesFor[event][otherEvent] || 0) + 1;
        localViolationCount++;
      }

      // Exclude violations
      if (!graph.marking.included.has(event)) {
        for (const otherEvent in guardedExcludes) {
          if (!guardedExcludes[otherEvent]?.[event]) continue;
          if (!localViolations.excludesTo[otherEvent]) localViolations.excludesTo[otherEvent] = {};
          localViolations.excludesTo[otherEvent][event] = (localViolations.excludesTo[otherEvent][event] || 0) + 1;
          localViolationCount++;
        }
      }

      const beforeExecuted = new Set(graph.marking.executed.keys());
      executeS(event, graph, updatedStore, headTime !== undefined ? new Date(headTime) : undefined);
      const cascadedEvents = [...graph.marking.executed.keys()].filter(
        (id) => id !== event && !beforeExecuted.has(id)
      );

      const updatedTimestamps = new Map(executionTimestamps);
      if (headTime !== undefined) {
        updatedTimestamps.set(event, headTime);
        for (const cascadedEvent of cascadedEvents) {
          updatedTimestamps.set(cascadedEvent, headTime);
        }
      }

      for (const cascadedEvent of cascadedEvents) {
        checkTemporalViolations(cascadedEvent, updatedTimestamps);
      }

      // event (and any cascaded events) just executed, discharging whatever obligations were
      // open on them, and potentially creating new ones on whoever they respond to.
      const updatedObligations: DeadlineObligations = { ...obligations };
      delete updatedObligations[event];
      for (const cascadedEvent of cascadedEvents) {
        delete updatedObligations[cascadedEvent];
      }
      const registerObligations = (sourceEvent: Event) => {
        for (const rEvent of graph.responseTo[sourceEvent]) {
          const guard = graph.guardMap?.[sourceEvent]?.[rEvent]?.['response'];
          if (guard && !evaluateGuard(guard, updatedStore)) continue;
          const deadlineMs = graph.timeConstraintMap?.[sourceEvent]?.[rEvent]?.deadline;
          if (deadlineMs === undefined) continue;
          if (headTime === undefined) {
            // Can't record when this obligation started, so its deadline compliance can never
            // be confirmed later - flag it as a violation now rather than silently losing track.
            if (!localTimeViolations.responseTo[sourceEvent]) localTimeViolations.responseTo[sourceEvent] = {};
            localTimeViolations.responseTo[sourceEvent][rEvent] = (localTimeViolations.responseTo[sourceEvent][rEvent] || 0) + 1;
            localViolationCount++;
            localTimeViolationCount++;
            continue;
          }
          updatedObligations[rEvent] = { ...(updatedObligations[rEvent] ?? {}), [sourceEvent]: headTime };
        }
      };
      registerObligations(event);
      for (const cascadedEvent of cascadedEvents) {
        registerObligations(cascadedEvent);
      }

      // event (and any cascaded events) just executed, discharging any standing response
      // obligation targeting them - regardless of which source it came from.
      for (const sourceEvent in localGuardedResponses) {
        delete localGuardedResponses[sourceEvent][event];
        for (const cascadedEvent of cascadedEvents) {
          delete localGuardedResponses[sourceEvent][cascadedEvent];
        }
      }

      const registerGuardedRelations = (sourceEvent: Event) => {
        for (const targetEvent of graph.excludesTo[sourceEvent]) {
          const guard = graph.guardMap?.[sourceEvent]?.[targetEvent]?.['exclude'];
          if (guard && !evaluateGuard(guard, updatedStore)) continue;
          if (!localGuardedExcludes[sourceEvent]) localGuardedExcludes[sourceEvent] = {};
          localGuardedExcludes[sourceEvent][targetEvent] = 1;
        }
        for (const targetEvent of graph.responseTo[sourceEvent]) {
          const guard = graph.guardMap?.[sourceEvent]?.[targetEvent]?.['response'];
          if (guard && !evaluateGuard(guard, updatedStore)) continue;
          if (!localGuardedResponses[sourceEvent]) localGuardedResponses[sourceEvent] = {};
          localGuardedResponses[sourceEvent][targetEvent] = 1;
        }
      };
      registerGuardedRelations(event);
      for (const cascadedEvent of cascadedEvents) {
        registerGuardedRelations(cascadedEvent);
      }

      for (const otherEvent of graph.includesTo[event]) {
        if (localActivations.includesTo[event]?.[otherEvent]) {
          localExSinceIn[otherEvent] = new Set();
          // otherEvent was genuinely re-included, so any standing exclude effect on it from
          // an earlier execution is stale - if it gets excluded again, blame whoever does that.
          for (const sourceEvent in localGuardedExcludes) {
            delete localGuardedExcludes[sourceEvent][otherEvent];
          }
        }
      }
      for (const otherEvent of allEvents) {
        localExSinceEx[otherEvent].add(event);
        localExSinceIn[otherEvent].add(event);
      }
      localExSinceEx[event] = new Set([event]);

      const {
        totalViolations: recTotalViolations,
        totalTimeViolations: recTotalTimeViolations,
        violations: recViolations,
        timeViolations: recTimeViolations,
        activations: recActivations,
        stepViolations: recStepViolations,
        stepTimeViolations: recStepTimeViolations,
        finalStateAccepting: recFinalStateAccepting,
      } = quantifyRec(graph, tail, localExSinceIn, localExSinceEx, updatedStore, updatedTimestamps, updatedObligations, localGuardedExcludes, localGuardedResponses);

      if (localViolationCount + recTotalViolations < leastViolations) {
        leastViolations = localViolationCount + recTotalViolations;
        bestTotalTimeViolations = localTimeViolationCount + recTotalTimeViolations;
        bestRelationViolations = mergeViolations(localViolations, recViolations);
        bestRelationTimeViolations = mergeViolations(localTimeViolations, recTimeViolations);
        bestRelationActivations = mergeActivations(localActivations, recActivations);
        bestStepViolations = [localViolationCount, ...recStepViolations];
        bestStepTimeViolations = [localTimeViolationCount, ...recStepTimeViolations];
        bestFinalStateAccepting = recFinalStateAccepting;
      }
      graph.marking = copyMarking(initMarking);
    }

    graph.marking = copyMarking(initMarking);
    return {
      totalViolations: leastViolations,
      totalTimeViolations: bestTotalTimeViolations,
      violations: bestRelationViolations,
      timeViolations: bestRelationTimeViolations,
      activations: bestRelationActivations,
      stepViolations: bestStepViolations,
      stepTimeViolations: bestStepTimeViolations,
      finalStateAccepting: bestFinalStateAccepting,
    };
  };

  return quantifyRec(
    graph,
    trace,
    emptyEventMap(allEvents),
    emptyEventMap(allEvents),
    initialVariableStore,
    new Map(),
    {},
    {},
    {}
  );
}
