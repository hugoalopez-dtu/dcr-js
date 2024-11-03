import { BitDCRGraph, BitEventMap, BitLogAbstraction } from "../bitTypes";
import { copyBitEventMap, fullBitRelation } from "./utility";

// Removes redundant relations based on transitive closure
const optimizeRelation = (relation: BitEventMap): void => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};

// Main mining method, the findAdditionalConditions flag breaks the discovered model when converting to petri-net
export const bitMineFromAbstraction = (
    logAbstraction: BitLogAbstraction,
    options = {
        findAdditionalConditions: true,
        findAdditionalResponses: false,
        skipRecomputingConditions: false,
        skipRecomputingResponses: false,
        optimize: true,
        findInitiallyPending: false
    }

): BitDCRGraph => {
    // Initialize graph
    const emptySet = logAbstraction.events.copy()
    emptySet.clear();
    const graph: BitDCRGraph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: logAbstraction.events,
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: emptySet.copy(),
            pending: emptySet.copy(),
            included: logAbstraction.events.copy(),
        },
    };
    // Initialize all mappings to avoid indexing errors
    for (const event of graph.events) {
        graph.conditionsFor[event] = emptySet.copy();
        graph.excludesTo[event] = emptySet.copy();
        graph.includesTo[event] = emptySet.copy();
        graph.responseTo[event] = emptySet.copy();
        graph.milestonesFor[event] = emptySet.copy();
    }

    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        graph.excludesTo[event].addString(event);
    }

    // Mine responses from logAbstraction
    graph.responseTo = copyBitEventMap(logAbstraction.responseTo);


    // Mine conditions from logAbstraction
    graph.conditionsFor = copyBitEventMap(logAbstraction.precedenceFor);

    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            graph.includesTo[i].addString(j);
            graph.excludesTo[j].addString(j);
        }
    }

    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        const maskedEvent = logAbstraction.events.map[event];
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = logAbstraction.predecessor[event].copy().union(
            logAbstraction.successor[event],
        );
        const nonCoExisters = logAbstraction.events.copy().difference(coExisters);
        nonCoExisters.delete(maskedEvent);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        graph.excludesTo[event].union(nonCoExisters);

        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = logAbstraction.predecessor[event].copy().difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            const maskedS = logAbstraction.events.map[s];
            if (!graph.excludesTo[s].has(maskedS)) {
                graph.excludesTo[event].add(maskedS);
            }
        }
    }

    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of graph.excludesTo[r]) {
                graph.excludesTo[s].deleteString(t);
            }
        }
    }

    // remove redundant conditions
    options?.optimize && optimizeRelation(graph.conditionsFor);

    // Remove redundant responses
    options?.optimize && optimizeRelation(graph.responseTo);

    if (options?.findAdditionalConditions || options?.findAdditionalResponses) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions: BitEventMap = copyBitEventMap(
            logAbstraction.predecessor,
        );

        // Start with every possible response. This get's intersected down for each trace
        const responses = fullBitRelation(logAbstraction.events);

        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = emptySet.copy();

            const localResponses: BitEventMap = {};

            const included = logAbstraction.events.copy();
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = logAbstraction.events.copy().difference(included);
                const validConditions = options?.skipRecomputingConditions ? excluded : localSeenBefore.copy().union(excluded);

                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(graph.excludesTo[event]);
                // Execute includes starting from (event)
                included.union(graph.includesTo[event]);

                //--------------------------------
                //            RESPONSES
                //--------------------------------


                // Clear accumulated responses on event execution

                if (!options.skipRecomputingResponses) {
                    localResponses[event] = emptySet.copy();
                    const maskedEvent = emptySet.map[event];
                    //// Add a potential response from each previous event to the current event
                    for (const prevEvent of localSeenBefore) {
                        localResponses[prevEvent].add(maskedEvent);
                    }
                }
                //--------------------------------
                //            ///RESPONSES
                //--------------------------------
                localSeenBefore.addString(event);
            }

            //--------------------------------
            //            RESPONSES
            //--------------------------------
            if (!options.skipRecomputingResponses) {
                // Add a potential response from each event in the trace to each excluded event
                const excluded = logAbstraction.events.copy().difference(included);
                for (const prevEvent of localSeenBefore) {
                    localResponses[prevEvent].union(excluded);
                }
            } else {
                for (const prevEvent of localSeenBefore) {
                    localResponses[prevEvent] = logAbstraction.events.copy().difference(included);
                }
            }

            // Intersect responses with those valid for this trace
            for (const event in localResponses) {
                responses[event].intersect(localResponses[event]);
            }

            //--------------------------------
            //            ///RESPONSES
            //--------------------------------
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph

        if (options?.findAdditionalConditions) {
            for (const key in graph.conditionsFor) {
                graph.conditionsFor[key].union(possibleConditions[key]);
            }
        }
        if (options?.findAdditionalResponses) {
            for (const key in responses) {
                graph.responseTo[key].union(responses[key]);
            }
        }

        if (options?.findInitiallyPending) {
            const initiallyPending = logAbstraction.events.copy();
            for (const traceId in logAbstraction.traces) {
                const trace = logAbstraction.traces[traceId];

                const included = logAbstraction.events.copy();
                const pending = emptySet.copy();
                const executed = emptySet.copy();

                for (const event of trace) {
                    // Execute event
                    executed.addString(event);
                    // Execute excludes starting from (event)
                    included.difference(graph.excludesTo[event]);
                    // Execute includes starting from (event)
                    included.union(graph.includesTo[event]);

                    pending.union(graph.responseTo[event]);
                }

                const excluded = logAbstraction.events.copy().difference(included);
                // Initially pending for this trace are events that were never set pending, but still executed or excluded
                const localInitiallyPending = excluded.union(executed).difference(pending);
                // Find only initially pending that hold for ALL traces
                initiallyPending.intersect(localInitiallyPending);
            }

            //console.log(initiallyPending);
            graph.marking.pending = initiallyPending;
        }

        // Removing redundant conditions
        options?.optimize && optimizeRelation(graph.conditionsFor);
        options?.optimize && optimizeRelation(graph.responseTo);
    }
    return graph;
};