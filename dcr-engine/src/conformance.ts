import { execute, isAccepting, isEnabled } from "./executionEngine";
import { DCRGraph, Trace } from "./types";
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

export const replayTraceS = (graph: DCRGraph, trace: Trace): boolean => {
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