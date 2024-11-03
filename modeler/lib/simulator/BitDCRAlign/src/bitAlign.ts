import { Alignment, CostFun, Trace, Event, Label } from "../types";
import { BitDCRGraph, BitDCRGraphPP, BitLabelDCRPP, BitMarking, BitSet } from "../bitTypes";
import { copyBitMarking } from "./utility";

const stateToStr = (marking: BitMarking): string => {
    return `${marking.executed.set.toString(2)}_${marking.included.set.toString(2)}_${marking.pending.set.toString(2)}`;
}

const alignCost: CostFun = (action, target) => {
    switch (action) {
        case "consume":
            return 0;
        case "model-skip":
            return 1;
        case "trace-skip":
            return 1;
    }
}

export const execute = (event: Event, graph: BitLabelDCRPP) => {
    const maskedEvent = graph.events.map[event];
    if (!graph.events.has(maskedEvent)) return; // OPEN WORLD PRINCIPLE
    if (graph.conditions.has(maskedEvent)) graph.marking.executed.add(maskedEvent);
    graph.marking.pending.delete(maskedEvent);
    // Add sink of all response relations to pending
    graph.marking.pending.union(graph.responseTo[event]);
    // Remove sink of all response relations from included
    graph.marking.included.difference(graph.excludesTo[event]);
    // Add sink of all include relations to included
    graph.marking.included.union(graph.includesTo[event]);
};
export const isAccepting = (graph: BitDCRGraph): boolean => {
    // Graph is accepting if the intersections between pending and included events is empty
    return graph.marking.pending.copy().intersect(graph.marking.included).isEmpty();
};
export const isEnabled = (event: Event, graph: BitDCRGraph): boolean => {
    if (!graph.events.hasString(event)) return true; // OPEN WORLD PRINCIPLE
    return (
        graph.marking.included.hasString(event) &&
        graph.conditionsFor[event].copy().difference(graph.marking.included.copy().compliment().union(graph.marking.executed)).isEmpty() &&
        graph.milestonesFor[event].copy().intersect(graph.marking.included.copy().intersect(graph.marking.pending)).isEmpty()
    )
};
export const getEnabled = (graph: BitDCRGraph): Set<Event> => {
    const executedOrExcluded = graph.marking.included.copy().compliment().union(graph.marking.executed);
    const pendingAndIncluded = graph.marking.pending.copy().intersect(graph.marking.included);
    const retSet = new Set<Event>();
    for (const event of graph.events) {
        if (graph.marking.included.hasString(event) &&
            graph.conditionsFor[event].copy().difference(executedOrExcluded).isEmpty() &&
            graph.milestonesFor[event].copy().intersect(pendingAndIncluded).isEmpty()) {
            retSet.add(event);
        }
    }
    return retSet;
};

// Executes fun without permanent side-effects to the graphs marking
const newGraphEnv = <T>(graph: BitDCRGraphPP, fun: () => T): T => {
    const oldMarking = graph.marking;
    graph.marking = copyBitMarking(graph.marking);
    const retval = fun();
    graph.marking = oldMarking;
    return retval;
};

export const bitAlignWithCheck = (trace: Trace, graph: BitLabelDCRPP, context: Set<Label>, toDepth: number = Infinity, costFun: CostFun = alignCost, pruning: boolean = false): Alignment => {
    const emptySet = graph.events.copy().clear();

    // Checks event reachability or pending satisfiability depending on input type
    // This is bad practice, but it cuts severely down on duplicated code and the distinction is minimal
    const canBeExecutedOrCanBeSatisfied = (eventOrPendingEvents: Event | BitSet, graph: BitLabelDCRPP, context: Set<Label>) => {

        const canBeExcludedRecur = (event: Event, cycleSets: { excl: BitSet, exec: BitSet, incl: BitSet }): boolean => {
            for (const exclForEvent of graph.excludesFor[event]) {
                const maskedExclForEvent = graph.events.map[exclForEvent];
                const canBeExec = cycleSets.exec.has(maskedExclForEvent) ? false : canBeExecutedRecur(exclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: cycleSets.exec.copy().add(maskedExclForEvent)
                });
                if (canBeExec) return true;
            }
            return false;
        }

        const canBeIncludedRecur = (event: Event, cycleSets: { excl: BitSet, exec: BitSet, incl: BitSet }): boolean => {
            for (const inclForEvent of graph.includesFor[event]) {
                const maskedInclForEvent = graph.events.map[inclForEvent];
                const canBeExec = cycleSets.exec.has(maskedInclForEvent) ? false : canBeExecutedRecur(inclForEvent, {
                    excl: cycleSets.excl,
                    incl: cycleSets.incl,
                    exec: cycleSets.exec.copy().add(maskedInclForEvent)
                });
                if (canBeExec) return true;
            }
            return false;
        }

        const canBeExecutedRecur = (event: Event, cycleSets: { excl: BitSet, exec: BitSet, incl: BitSet }): boolean => {
            if (eventOrPendingEvents instanceof BitSet) {
                if (context.has(graph.labelMap[event])) return false;
            } else {
                if (eventOrPendingEvents !== event && context.has(graph.labelMap[event])) return false;
            }

            if (isEnabled(event, graph)) {
                return true;
            }

            for (const condForEvent of graph.conditionsFor[event]) {
                const maskedCondForEvent = graph.events.map[condForEvent];
                if (!graph.marking.executed.has(maskedCondForEvent) && graph.marking.included.has(maskedCondForEvent)) {
                    const condCanBeExec = cycleSets.exec.has(maskedCondForEvent) ? false : canBeExecutedRecur(condForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: cycleSets.exec.copy().add(maskedCondForEvent)
                    });
                    if (condCanBeExec) continue;

                    const condCanBeExcl = cycleSets.excl.has(maskedCondForEvent) ? false : canBeExcludedRecur(condForEvent, {
                        excl: cycleSets.excl.copy().add(maskedCondForEvent),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!condCanBeExec && !condCanBeExcl) return false;
                }
            }

            for (const mistForEvent of graph.milestonesFor[event]) {
                const maskedMistForEvent = graph.events.map[mistForEvent];
                if (graph.marking.pending.has(maskedMistForEvent) && graph.marking.included.has(maskedMistForEvent)) {
                    const mistCanBeExec = cycleSets.exec.has(maskedMistForEvent) ? false : canBeExecutedRecur(mistForEvent, {
                        excl: cycleSets.excl,
                        incl: cycleSets.incl,
                        exec: cycleSets.exec.copy().add(maskedMistForEvent)
                    });
                    if (mistCanBeExec) continue;

                    const mistCanBeExcl = cycleSets.excl.has(maskedMistForEvent) ? false : canBeExcludedRecur(mistForEvent, {
                        excl: cycleSets.excl.copy().add(maskedMistForEvent),
                        incl: cycleSets.incl,
                        exec: cycleSets.exec
                    });
                    if (!mistCanBeExec && !mistCanBeExcl) return false;
                }
            }
            const maskedEvent = graph.events.map[event];

            if (!graph.marking.included.has(maskedEvent)) {
                const canBeIncluded = cycleSets.incl.has(maskedEvent) ? false : canBeIncludedRecur(event, {
                    incl: cycleSets.incl.copy().add(maskedEvent),
                    excl: cycleSets.excl,
                    exec: cycleSets.exec
                });
                return canBeIncluded;
            }

            return true;
        }

        if (eventOrPendingEvents instanceof BitSet) {
            for (const event of eventOrPendingEvents) {
                if (!canBeExecutedRecur(event, { excl: emptySet.copy(), exec: emptySet.copy().addString(event), incl: emptySet.copy() }) &&
                    !canBeExcludedRecur(event, { excl: emptySet.copy().addString(event), exec: emptySet.copy(), incl: emptySet.copy() })) {
                    return false;
                };
            }
            return true;
        } else {
            return canBeExecutedRecur(eventOrPendingEvents, { excl: emptySet.copy(), exec: emptySet.copy().addString(eventOrPendingEvents), incl: emptySet.copy() })
        }
    }

    // Setup global variables
    const alignCost = costFun;
    const alignState: { [traceLen: number]: { [state: string]: number } } = {
        0: {}
    };

    let maxCost: number;
    const alignTraceLabel = (
        trace: Trace,
        graph: BitLabelDCRPP,
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
        if (traceLen > 0 && Object.keys(graph.labelMapInv).includes(trace[0])) {
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
        if (pruning && maxCost === Infinity) {
            if (traceLen > 0) {
                let isGood = false;
                for (const event of graph.labelMapInv[trace[0]]) {
                    isGood = isGood || canBeExecutedOrCanBeSatisfied(event, graph, context);
                }
                if (!isGood) {
                    return { cost: Infinity, trace: [] }
                }
                // Check if graph can reach an accepting state
            } else {
                if (!canBeExecutedOrCanBeSatisfied(graph.marking.pending.copy().intersect(graph.marking.included), graph, context)) {
                    return { cost: Infinity, trace: [] }
                }
            }
        }

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

    maxCost = trace.map(event => costFun("trace-skip", event)).reduce((acc, cur) => acc + cur, 0) + alignTraceLabel([], graph).cost;

    for (let i = 0; i <= trace.length; i++) {
        alignState[i] = {};
    }


    const alignment = alignTraceLabel(trace, graph, 0);
    if (alignment.cost === Infinity) alignment.cost = maxCost;

    return alignment
};