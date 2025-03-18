import { execute, executeS, isAccepting, isAcceptingS, isEnabled, isEnabledS } from "./executionEngine";
import { DCRGraph, DCRGraphS, Trace } from "./types";
import { copyMarking } from "./utility";

export const replayTrace = (graph: DCRGraph, trace: Trace): boolean => {
    let retval = false;

    if (trace.length === 0) return isAccepting(graph);

    const [head, ...tail] = trace;
    // Open world principle!
    if (!graph.labels.has(head)) {
        return replayTrace(graph, tail);
    }

    const initMarking = copyMarking(graph.marking);
    for (const event of graph.labelMapInv[head]) {
        if (isEnabled(event, graph)) {
            execute(event, graph);
            retval = retval || replayTrace(graph, tail);
            graph.marking = copyMarking(initMarking);
        }
    }

    return retval;
};

export const replayTraceS = (graph: DCRGraphS, trace: Trace): boolean => {
    let retval = false;

    if (trace.length === 0) return isAcceptingS(graph, graph);

    const [head, ...tail] = trace;
    // Open world principle!
    if (!graph.labels.has(head)) {
        return replayTraceS(graph, tail);
    }

    const initMarking = copyMarking(graph.marking);
    for (const event of graph.labelMapInv[head]) {
        const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
        if (isEnabledS(event, graph, group).enabled) {
            executeS(event, graph);
            retval = retval || replayTraceS(graph, tail);
            graph.marking = copyMarking(initMarking);
        }
    }

    return retval;
};