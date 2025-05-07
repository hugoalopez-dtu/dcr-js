import { DCRGraph, LabelDCRPP, Event, Marking, Trace, Label, CostFun, Alignment, Optimizations } from "./types";
import { copyMarking, copySet, flipEventMap } from "./utility";

// Mutates graph's marking
const execute = (event: Event, graph: LabelDCRPP) => {
    if (graph.conditions.has(event)) graph.marking.executed.add(event);
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

const isAccepting = (graph: DCRGraph): boolean => {
    // Graph is accepting if the intersections between pending and included events is empty
    return (
        copySet(graph.marking.pending).intersect(graph.marking.included).size === 0
    );
};

const isEnabled = (event: Event, graph: DCRGraph): boolean => {
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

const getEnabled = (graph: DCRGraph): Set<Event> => {
    const retSet = copySet(graph.events);
    for (const event of graph.events) {
        if (!graph.marking.included.has(event)) retSet.delete(event);
        for (const otherEvent of graph.conditionsFor[event]) {
            if (
                graph.marking.included.has(otherEvent) &&
                !graph.marking.executed.has(otherEvent)
            )
                retSet.delete(event);
        }
        for (const otherEvent of graph.milestonesFor[event]) {
            if (
                graph.marking.included.has(otherEvent) &&
                graph.marking.pending.has(otherEvent)
            )
                retSet.delete(event);
        }
    }
    return retSet;
};

// Executes fun without permanent side-effects to the graphs marking
const newGraphEnv = <T>(graph: DCRGraph, fun: () => T): T => {
    const oldMarking = graph.marking;
    graph.marking = copyMarking(graph.marking);
    const retval = fun();
    graph.marking = oldMarking;
    return retval;
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

export const graphToGraphPP = <T extends DCRGraph>(graph: T): T & Optimizations => {
    const conditions = new Set<Event>();
    for (const key in graph.conditionsFor) {
        conditions.union(graph.conditionsFor[key]);
    }
    return { ...graph, conditions, includesFor: flipEventMap(graph.includesTo), excludesFor: flipEventMap(graph.excludesTo) };
};

let alignCost: CostFun = (action, _) => {
    switch (action) {
        case "consume":
            return 0;
        case "model-skip":
            return 1;
        case "trace-skip":
            return 1;
    }
}

const alignTrace = (trace: Trace, graph: LabelDCRPP, context?: Set<Label>, costFun: CostFun = alignCost, toDepth: number = Infinity, pruning: boolean = false): Alignment => {
    // Setup global variables
    const alignCost = costFun;
    const alignState: { [traceLen: number]: { [state: string]: number } } = {
        0: {}
    };

    // Checks event reachability
    const canBeExecuted = (origEvent: Event, graph: LabelDCRPP, context: Set<Label>) => {

        const canBeExcludedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {
            for (const exclForEvent of graph.excludesFor[event]) {
                const canBeExec = cycleSets.exec.has(exclForEvent) ? false : canBeExecutedRecur(exclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: new Set([...cycleSets.exec, exclForEvent])
                });
                if (canBeExec) return true;
            }
            return false;
        }


        const canBeIncludedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {
            for (const inclForEvent of graph.includesFor[event]) {
                const canBeExec = cycleSets.exec.has(inclForEvent) ? false : canBeExecutedRecur(inclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: new Set([...cycleSets.exec, inclForEvent])
                });
                if (canBeExec) return true;
            }
            return false;
        }

        const canBeExecutedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {
            if (event !== origEvent && context.has(graph.labelMap[event])) return false;
            if (isEnabled(event, graph)) {
                return true;
            }
            for (const condForEvent of graph.conditionsFor[event]) {
                if (!graph.marking.executed.has(condForEvent) && graph.marking.included.has(condForEvent)) {
                    const condCanBeExec = cycleSets.exec.has(condForEvent) ? false : canBeExecutedRecur(condForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: new Set([...cycleSets.exec, condForEvent])
                    });
                    if (condCanBeExec) continue;

                    const condCanBeExcl = cycleSets.excl.has(condForEvent) ? false : canBeExcludedRecur(condForEvent, {
                        excl: new Set([...cycleSets.excl, condForEvent]),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!condCanBeExec && !condCanBeExcl) {
                        return false
                    };
                }
            }
            // Check if all events milestoning can be executed or excluded
            for (const mistForEvent of graph.milestonesFor[event]) {
                if (graph.marking.pending.has(mistForEvent) && graph.marking.included.has(mistForEvent)) {
                    const mistCanBeExec = cycleSets.exec.has(mistForEvent) ? false : canBeExecutedRecur(mistForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: new Set([...cycleSets.exec, mistForEvent])
                    });
                    if (mistCanBeExec) continue;

                    const mistCanBeExcl = cycleSets.excl.has(mistForEvent) ? false : canBeExcludedRecur(mistForEvent, {
                        excl: new Set([...cycleSets.excl, mistForEvent]),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!mistCanBeExec && !mistCanBeExcl) {
                        return false
                    };
                }
            }
            // If event is excluded, check if it can be excluded
            if (!graph.marking.included.has(event)) {
                const canBeIncluded = cycleSets.incl.has(event) ? false : canBeIncludedRecur(event, {
                    incl: new Set([...cycleSets.incl, event]),
                    excl: cycleSets.excl,
                    exec: cycleSets.exec
                });
                return canBeIncluded;
            }
            return true;
        }

        const retval = canBeExecutedRecur(origEvent, { excl: new Set(), exec: new Set([origEvent]), incl: new Set() });
        return retval;
    }

    const canBeExecutedOrExcluded = (peEvent: Event, graph: LabelDCRPP, context: Set<Label>) => {

        const canBeExcludedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {
            for (const exclForEvent of graph.excludesFor[event]) {
                const canBeExec = cycleSets.exec.has(exclForEvent) ? false : canBeExecutedRecur(exclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: new Set([...cycleSets.exec, exclForEvent])
                });
                if (canBeExec) return true;
            }
            return false;
        }


        const canBeIncludedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {
            for (const inclForEvent of graph.includesFor[event]) {
                const canBeExec = cycleSets.exec.has(inclForEvent) ? false : canBeExecutedRecur(inclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: new Set([...cycleSets.exec, inclForEvent])
                });
                if (canBeExec) return true;
            }
            return false;
        }

        const canBeExecutedRecur = (event: Event, cycleSets: { excl: Set<Event>, exec: Set<Event>, incl: Set<Event> }): boolean => {

            if (context.has(graph.labelMap[event])) {
                return false;
            }
            if (isEnabled(event, graph)) {
                return true;
            }
            // Check if all events conditioning can be executed or excluded
            for (const condForEvent of graph.conditionsFor[event]) {
                if (!graph.marking.executed.has(condForEvent) && graph.marking.included.has(condForEvent)) {
                    const condCanBeExec = cycleSets.exec.has(condForEvent) ? false : canBeExecutedRecur(condForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: new Set([...cycleSets.exec, condForEvent])
                    });
                    if (condCanBeExec) continue;

                    const condCanBeExcl = cycleSets.excl.has(condForEvent) ? false : canBeExcludedRecur(condForEvent, {
                        excl: new Set([...cycleSets.excl, condForEvent]),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!condCanBeExec && !condCanBeExcl) return false;
                }
            }
            // Check if all events milestoning can be executed or excluded
            for (const mistForEvent of graph.milestonesFor[event]) {
                if (graph.marking.pending.has(mistForEvent) && graph.marking.included.has(mistForEvent)) {
                    const mistCanBeExec = cycleSets.exec.has(mistForEvent) ? false : canBeExecutedRecur(mistForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: new Set([...cycleSets.exec, mistForEvent])
                    });
                    if (mistCanBeExec) continue;

                    const mistCanBeExcl = cycleSets.excl.has(mistForEvent) ? false : canBeExcludedRecur(mistForEvent, {
                        excl: new Set([...cycleSets.excl, mistForEvent]),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!mistCanBeExec && !mistCanBeExcl) return false;
                }
            }
            // If event is excluded, check if it can be excluded
            if (!graph.marking.included.has(event)) {
                const canBeIncluded = cycleSets.incl.has(event) ? false : canBeIncludedRecur(event, {
                    incl: new Set([...cycleSets.incl, event]),
                    excl: cycleSets.excl,
                    exec: cycleSets.exec
                });
                return canBeIncluded;
            }
            return true;
        }

        const retval = canBeExecutedRecur(peEvent, { excl: new Set(), exec: new Set([peEvent]), incl: new Set() }) ||
            canBeExcludedRecur(peEvent, { excl: new Set([peEvent]), exec: new Set(), incl: new Set() });
        return retval;
    }

    let maxCost: number;
    const alignTraceLabel = (
        trace: Trace,
        graph: LabelDCRPP,
        curCost: number = 0,
        curDepth: number = 0,
    ): Alignment => {
        // Futile to continue search along this path
        if (curCost >= maxCost) return { cost: Infinity, trace: [] };
        if (curDepth >= toDepth) return { cost: Infinity, trace: [] };

        const stateStr = stateToStr(graph.marking);
        const traceLen = trace.length;

        // Already visisted state with better cost, return to avoid unnecessary computations
        const visitedCost = alignState[traceLen][stateStr];

        if (visitedCost !== undefined && visitedCost <= curCost)
            return { cost: Infinity, trace: [] };
        alignState[traceLen][stateStr] = curCost;

        const isAccept = isAccepting(graph);

        // Found alignment

        if (isAccept && traceLen == 0) return { cost: curCost, trace: [] };

        // No alignment found and should continue search.
        // This gives 3 cases: consume, model-skip & log-skip
        // Ordering is IMPORTANT. Since this is depth-first, do consumes and trace-skips first when possible.
        // This creates a bound for the very exponential model-skips by setting max-cost as quickly as possible.
        let bestAlignment: Alignment = { cost: Infinity, trace: [] };

        // Consume
        // Event is enabled, execute it and remove it from trace
        if (traceLen > 0) {
            try {
                for (const event of graph.labelMapInv[trace[0]]) {
                    if (isEnabled(event, graph)) {
                        const alignment = newGraphEnv(graph, () => {
                            execute(event, graph);
                            return alignTraceLabel(
                                trace.slice(1),
                                graph,
                                curCost + alignCost("consume", event),
                                curDepth + 1
                            );
                        });
                        if (alignment.cost < bestAlignment.cost) {

                            maxCost = alignment.cost;
                            alignment.trace.unshift(event);
                            bestAlignment = alignment;
                        }
                    }
                }
            } catch (e) {
                throw e;
            }
        }

        // Trace-skip
        // Skip event in trace
        if (traceLen > 0) {
            const alignment = alignTraceLabel(
                trace.slice(1),
                graph,
                curCost + alignCost("trace-skip", trace[0]),
                curDepth + 1
            );
            if (alignment.cost < bestAlignment.cost) {
                maxCost = alignment.cost;
                bestAlignment = alignment;
            }
        }

        // Check if the next event can ever be reached
        if (pruning && maxCost === Infinity && context) {
            if (traceLen > 0) {
                let isGood = false;
                for (const event of graph.labelMapInv[trace[0]]) {
                    isGood = isGood || canBeExecuted(event, graph, context);
                }
                if (!isGood) {
                    return { cost: Infinity, trace: [] }
                }
                // Check if graph can reach an accepting state
            } else {
                let isGood = true;
                for (const pEvent of copySet(graph.marking.pending).intersect(graph.marking.included)) {
                    isGood = isGood && canBeExecutedOrExcluded(pEvent, graph, context);
                }
                if (!isGood) {
                    return { cost: Infinity, trace: [] }
                }
            }
        }

        //console.log(trace);

        // Model-skip
        // Execute any enabled event without modifying trace. Highly exponential, therefore last
        const enabled = getEnabled(graph);
        for (const event of enabled) {
            const alignment = newGraphEnv(graph, () => {
                execute(event, graph);
                return alignTraceLabel(trace, graph, curCost + alignCost("model-skip", event), curDepth + 1);
            });
            if (alignment.cost < bestAlignment.cost) {
                alignment.trace.unshift(event);
                maxCost = alignment.cost;
                bestAlignment = alignment;
            }
        }

        return bestAlignment;
    };

    maxCost = toDepth !== Infinity ? toDepth : trace.map(event => costFun("trace-skip", event)).reduce((acc, cur) => acc + cur, 0) + alignTraceLabel([], graph).cost;

    for (let i = 0; i <= trace.length; i++) {
        alignState[i] = {};
    }

    return alignTraceLabel(trace, graph, 0);
};

export default alignTrace;