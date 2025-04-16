import { execute, executeS, isAccepting, isAcceptingS, isEnabled, isEnabledS } from "./executionEngine";
import { DCRGraph, DCRGraphS, RoleTrace, Trace } from "./types";
import { copyMarking } from "./utility";

export const replayTraceS = (graph: DCRGraphS, trace: RoleTrace): boolean => {
    let retval = false;

    if (trace.length === 0) return isAcceptingS(graph, graph);

    const [head, ...tail] = trace;
    // Open world principle!
    if (!graph.labels.has(head.activity)) {
        return replayTraceS(graph, tail);
    }

    const initMarking = copyMarking(graph.marking);
    for (const event of graph.labelMapInv[head.activity]) {
        if (!(head.role === graph.roleMap[event])) continue;
        const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
        if (isEnabledS(event, graph, group).enabled) {
            executeS(event, graph);
            retval = retval || replayTraceS(graph, tail);
            graph.marking = copyMarking(initMarking);
        }
    }

    return retval;
};