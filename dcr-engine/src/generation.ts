import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import type { DCRGraphS, EventLog, RoleTrace } from "./types";
import {
  copyMarking,
  getRandomInt,
  getRandomItem,
  mutatingUnion,
  randomChoice,
} from "./utility";
import {
  calculateConstraintSupport,
  type ConstraintSupport,
} from "./constraintSupport";


function noisify(
  trace: RoleTrace,
  noisePercentage: number,
  graph: DCRGraphS
): RoleTrace {
  const retTrace: RoleTrace = [];

  for (let i = 0; i < trace.length; i++) {
    if (Math.random() <= noisePercentage) {
      console.log("Noising it up!");
      const choice = getRandomInt(0, 3);
      switch (choice) {
        // Insert
        case 0:
          retTrace.push(trace[i]);
          const activity = getRandomItem(graph.labels);
          const event = getRandomItem(graph.labelMapInv[activity]);
          retTrace.push({ activity, role: graph.roleMap[event] });
          break;
        // Delete
        case 1:
          break;
        // Swap
        case 2:
          const elem = retTrace.pop();
          retTrace.push(trace[i]);
          if (elem !== undefined) {
            retTrace.push(elem);
          }
          break;
        default:
          throw new Error("Wrong integer mate " + choice);
      }
    } else {
      retTrace.push(trace[i]);
    }
  }
  return retTrace;
}

export function generateEventLog(
  graph: DCRGraphS,
  noTraces: number,
  minTraceLen: number,
  maxTraceLen: number,
  noisePercentage: number
): EventLog<RoleTrace> {
  const allEvents = Object.values(graph.subProcesses).reduce(
    (acc, cum) => mutatingUnion(acc, cum.events),
    new Set(graph.events)
  );

  const allEnabled = () => {
    const retval = new Set<string>();
    for (const event of allEvents) {
      const group = graph.subProcessMap[event]
        ? graph.subProcessMap[event]
        : graph;
      if (isEnabledS(event, graph, group, {}, new Date()).enabled) {
        console.log(event, " is enabled");
        retval.add(event);
      }
    }
    return retval;
  };

  const retval: EventLog<RoleTrace> = {
    events: allEvents,
    traces: {},
  };

  let goodTraces = 0;
  let tooShortCount = 0;
  let tooLongCount = 0;

  const initMarking = copyMarking(graph.marking);
  while (goodTraces < noTraces) {
    let trace: RoleTrace = [];
    while (trace.length <= maxTraceLen) {
      if (
        trace.length >= minTraceLen &&
        isAcceptingS(graph, graph) &&
        randomChoice()
      ) {
        console.log("Good! ", trace.length);
        const noisyTrace = noisify(trace, noisePercentage, graph);
        retval.traces["Trace " + goodTraces++] = noisyTrace;
        break;
      }
      const enabled = allEnabled();
      if (enabled.size === 0) break;
      const event = getRandomItem(enabled);
      console.log("Generated event:", {
        event,
        label: graph.labelMap[event],
        role: graph.roleMap[event],
      });
      executeS(event, graph, {}, new Date());
      trace.push({
        activity: graph.labelMap[event]?.trim() || event,
        role: graph.roleMap[event] ?? "",
      });
    }

    if (trace.length < minTraceLen) {
      tooShortCount++;
    } else if (trace.length > maxTraceLen) {
      tooLongCount++;
    }

    if (tooShortCount + tooLongCount > 2 * noTraces) {
      if (tooShortCount >= tooLongCount) {
        throw new Error(
          "Unable to generate log from parameters: traces run out of enabled activities before reaching Min. Trace Length. Try lowering Min. Trace Length."
        );
      }
      throw new Error(
        "Unable to generate log from parameters: traces reached Max. Trace Length without reaching an accepting state. Try raising Max. Trace Length."
      );
    }

    graph.marking = copyMarking(initMarking);
  }

  return retval;
}

export interface ConstraintSupportGenerationOptions {
  noTraces: number;
  minTraceLen: number;
  maxTraceLen: number;
  noisePercentage: number;
  targetSupport: number;
  maxAttempts?: number;
}

export interface ConstraintSupportGenerationResult {
  log: EventLog<RoleTrace>;
  statistics: ConstraintSupport[];
  attempts: number;
  averageSupport: number | null;
}

export function generateEventLogWithSupport(
    graph: DCRGraphS,
    options: ConstraintSupportGenerationOptions,
): ConstraintSupportGenerationResult {
  const {
    noTraces,
    minTraceLen,
    maxTraceLen,
    noisePercentage,
    targetSupport,
    maxAttempts = noTraces * 10,
  } = options;

  if (
      !Number.isInteger(noTraces) ||
      noTraces <= 0 ||
      !Number.isInteger(minTraceLen) ||
      minTraceLen < 0 ||
      !Number.isInteger(maxTraceLen) ||
      maxTraceLen < minTraceLen ||
      !Number.isFinite(noisePercentage) ||
      noisePercentage < 0 ||
      noisePercentage > 1 ||
      !Number.isFinite(targetSupport) ||
      targetSupport < 0 ||
      targetSupport > 1 ||
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < noTraces
  ) {
    throw new Error("Invalid constraint support generation parameters.");
  }

  const supportedConstraints = calculateConstraintSupport(graph, {
    events: new Set(graph.labels),
    traces: {},
  });

  if (supportedConstraints.length === 0) {
    throw new Error(
        "Cannot generate a constraint support-based event log: " +
        "the model contains no supported constraints.",
    );
  }

  const log: EventLog<RoleTrace> = {
    events: new Set(graph.labels),
    traces: {},
  };

  let attempts = 0;

  const evaluate = (candidateLog: EventLog<RoleTrace>) => {
    const statistics = calculateConstraintSupport(
        graph,
        candidateLog,
    );

    const activated = statistics.filter(
        (constraint) => constraint.support !== null,
    );

    if (activated.length === 0) {
      return {
        statistics,
        averageSupport: null,
        score: Infinity,
      };
    }

    const averageSupport =
        activated.reduce(
            (sum, constraint) => sum + constraint.support!,
            0,
        ) / activated.length;

    // Prioritize the constraint furthest from the target support.
    const deviation =
        activated.reduce(
            (sum, constraint) =>
                sum + Math.abs(constraint.support! - targetSupport),
            0,
        ) / activated.length;

    // Prefer candidates that activate more constraints.
    const coverage = activated.length / statistics.length;

    return {
      statistics,
      averageSupport,
      score: deviation + (1 - coverage),
    };
  };

  while (
      Object.keys(log.traces).length < noTraces &&
      attempts < maxAttempts
      ) {
    const draftGraph: DCRGraphS = {
      ...graph,
      marking: copyMarking(graph.marking),
    };

    const candidateLog = generateEventLog(
        draftGraph,
        1,
        minTraceLen,
        maxTraceLen,
        noisePercentage,
    );

    attempts++;

    const candidate = Object.values(candidateLog.traces)[0];

    if (!candidate) {
      continue;
    }

    const traceId = `Trace ${Object.keys(log.traces).length}`;

    const proposedLog: EventLog<RoleTrace> = {
      events: log.events,
      traces: {
        ...log.traces,
        [traceId]: candidate,
      },
    };

    const proposedScore = evaluate(proposedLog).score;

    // Evaluate alternatives before selecting a trace.
    let bestTrace = candidate;
    let bestScore = proposedScore;

    const remainingAttempts = maxAttempts - attempts;
    const remainingTraces =
        noTraces - Object.keys(log.traces).length - 1;

    const alternatives = Math.min(
        4,
        Math.max(0, remainingAttempts - remainingTraces),
    );

    for (let i = 0; i < alternatives; i++) {
      const alternativeGraph: DCRGraphS = {
        ...graph,
        marking: copyMarking(graph.marking),
      };

      const alternativeLog = generateEventLog(
          alternativeGraph,
          1,
          minTraceLen,
          maxTraceLen,
          noisePercentage,
      );

      attempts++;

      const alternative = Object.values(
          alternativeLog.traces,
      )[0];

      if (!alternative) {
        continue;
      }

      const alternativeScore = evaluate({
        events: log.events,
        traces: {
          ...log.traces,
          [traceId]: alternative,
        },
      }).score;

      if (alternativeScore < bestScore) {
        bestTrace = alternative;
        bestScore = alternativeScore;
      }
    }

    log.traces[traceId] = bestTrace;
  }

  const result = evaluate(log);

  return {
    log,
    statistics: result.statistics,
    attempts,
    averageSupport: result.averageSupport,
  };
}