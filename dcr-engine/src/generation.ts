import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { DCRGraphS, EventLog, RoleTrace } from "./types";
import { copyMarking, copySet, getRandomInt, getRandomItem, randomChoice } from "./utility";
import { quantifyViolations } from "./conformance";

const noisify = (trace: RoleTrace, noisePercentage: number, graph: DCRGraphS): RoleTrace => {
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
};

const generateEventLog = (
    graph: DCRGraphS,
    noTraces: number,
    minTraceLen: number,
    maxTraceLen: number,
    noisePercentage: number
): EventLog<RoleTrace> => {
    const allEvents = Object.values(graph.subProcesses).reduce(
        (acc, cum) => acc.union(cum.events),
        copySet(graph.events)
    );

    const allEnabled = () => {
        const retval = new Set<string>();
        for (const event of allEvents) {
            const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
            if (isEnabledS(event, graph, group).enabled) {
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
    let botchedTraces = 0;

    const initMarking = copyMarking(graph.marking);
    while (goodTraces < noTraces) {
        let trace: RoleTrace = [];
        while (trace.length <= maxTraceLen) {
            if (trace.length >= minTraceLen && isAcceptingS(graph, graph) && randomChoice()) {
                const noisyTrace = noisify(trace, noisePercentage, graph);
                retval.traces["Trace " + goodTraces++] = noisyTrace;
                break;
            }
            const enabled = allEnabled();
            if (enabled.size === 0) break;
            const event = getRandomItem(enabled);
            executeS(event, graph);
            trace.push({ activity: graph.labelMap[event], role: graph.roleMap[event] });
        }
        if (trace.length > maxTraceLen || trace.length < minTraceLen) {
            botchedTraces++;
            if (botchedTraces > 2 * noTraces) {
                throw new Error("Unable to generate log from parameters...");
            }
        }

        graph.marking = copyMarking(initMarking);
    }

    return retval;
};


const computeLogSupport = (graph: DCRGraphS, log: EventLog<RoleTrace>): number => {
    const traceIds = Object.keys(log.traces);
    if (traceIds.length === 0) return 0;

    const initMarking = copyMarking(graph.marking);
    let compliantTraces = 0;

    for (const id of traceIds) {
        const trace = log.traces[id];
        // reset marking before each conformance check
        graph.marking = copyMarking(initMarking);
        const { totalViolations } = quantifyViolations(graph, trace);
        if (totalViolations === 0) {
            compliantTraces++;
        }
    }

    graph.marking = copyMarking(initMarking);

    return compliantTraces / traceIds.length;
};

export const generateEventLogSupportTarget = (
    graph: DCRGraphS,
    noTraces: number,
    minTraceLen: number,
    maxTraceLen: number,
    noisePercentage: number,
    supportTarget: number
): EventLog<RoleTrace> => {
    const clampedTarget = Math.max(0, Math.min(1, supportTarget));
    const MAX_ATTEMPTS = 5;

    let bestLog: EventLog<RoleTrace> | null = null;
    let bestSupport = -1;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidateLog = generateEventLog(graph, noTraces, minTraceLen, maxTraceLen, noisePercentage);
        const candidateSupport = computeLogSupport(graph, candidateLog);

        console.log(
            `Support-target attempt ${attempt + 1}/${MAX_ATTEMPTS}: ` +
            `measured support = ${candidateSupport.toFixed(3)}, target = ${clampedTarget.toFixed(3)}`
        );

        if (candidateSupport > bestSupport) {
            bestSupport = candidateSupport;
            bestLog = candidateLog;
        }

        // early stop if we already reach or exceed the target
        if (candidateSupport >= clampedTarget) {
            break;
        }
    }

    if (bestLog === null) {
        // should never happen, but just in case
        bestLog = generateEventLog(graph, noTraces, minTraceLen, maxTraceLen, noisePercentage);
        bestSupport = computeLogSupport(graph, bestLog);
    }

    console.log(
        `Support-target generator returning log with support = ${bestSupport.toFixed(3)} ` +
        `(target = ${clampedTarget.toFixed(3)})`
    );

    return bestLog;
};

export default generateEventLog;
