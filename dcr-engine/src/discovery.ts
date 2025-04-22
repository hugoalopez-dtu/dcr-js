import { EventLog, LogAbstraction, Trace, Event, EventMap, DCRGraph, FuzzyRelation } from "./types";
import { copyEventMap, copySet, fullRelation } from "./utility";

// Create abstraction of an EventLog in order to make fewer passes when mining constraints
export const abstractLog = (log: EventLog<Trace>): LogAbstraction => {
    const logAbstraction: LogAbstraction = {
        events: copySet(log.events),
        traces: { ...log.traces },
        // At first we assume all events will be seen at least once
        // Once we see them twice in a trace, they are removed from atMostOnce
        atMostOnce: copySet(log.events),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {},
    };
    // Initialize all EventMaps in the Log Abstraction.
    // Predecessor and successor sets start empty,
    // while the rest are initialized to be all events besides itself
    for (const event of log.events) {
        logAbstraction.chainPrecedenceFor[event] = copySet(log.events);
        logAbstraction.chainPrecedenceFor[event].delete(event);
        logAbstraction.precedenceFor[event] = copySet(log.events);
        logAbstraction.precedenceFor[event].delete(event);
        logAbstraction.responseTo[event] = copySet(log.events);
        logAbstraction.responseTo[event].delete(event);
        logAbstraction.predecessor[event] = new Set<Event>();
        logAbstraction.successor[event] = new Set<Event>();
    }

    const parseTrace = (trace: Trace) => {
        const localAtLeastOnce = new Set<Event>();
        const localSeenOnlyBefore: EventMap = {};
        let lastEvent: string = "";
        for (const event of trace) {
            // All events seen before this one must be predecessors
            logAbstraction.predecessor[event].union(localAtLeastOnce);
            // If event seen before in trace, remove from atMostOnce
            if (localAtLeastOnce.has(event)) {
                logAbstraction.atMostOnce.delete(event);
            }
            localAtLeastOnce.add(event);
            // Precedence for (event): All events that occured
            // before (event) are kept in the precedenceFor set
            logAbstraction.precedenceFor[event].intersect(localAtLeastOnce);
            // Chain-Precedence for (event): Some event must occur
            // immediately before (event) in all traces
            if (lastEvent !== "") {
                // If first time this clause is encountered - leaves lastEvent in chain-precedence set.
                // The intersect is empty if this clause is encountered again with another lastEvent.
                logAbstraction.chainPrecedenceFor[event].intersect(
                    new Set([lastEvent]),
                );
            } else {
                // First event in a trace, and chainPrecedence is therefore not possible
                logAbstraction.chainPrecedenceFor[event] = new Set<Event>();
            }
            // To later compute responses we note which events were seen
            // before (event) and not after
            if (logAbstraction.responseTo[event].size > 0) {
                // Save all events seen before (event)
                localSeenOnlyBefore[event] = copySet(localAtLeastOnce);
            }
            // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
            for (const key in localSeenOnlyBefore) {
                localSeenOnlyBefore[key].delete(event);
            }
            lastEvent = event;
        }
        for (const event in localSeenOnlyBefore) {
            // Compute set of events in trace that happened after (event)
            const seenOnlyAfter = new Set(localAtLeastOnce).difference(
                localSeenOnlyBefore[event],
            );
            // Delete self-relation
            seenOnlyAfter.delete(event);
            // Set of events that always happens after (event)
            logAbstraction.responseTo[event].intersect(seenOnlyAfter);
        }
    };

    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        parseTrace(trace);
    }

    // Compute successor set based on duality with predecessor set
    for (const i in logAbstraction.predecessor) {
        for (const j of logAbstraction.predecessor[i]) {
            logAbstraction.successor[j].add(i);
        }
    }

    return logAbstraction;
};

// Removes redundant relations based on transitive closure
const optimizeRelation = (relation: EventMap): void => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};

// Main mining method, the findAdditionalConditions flag breaks the discovered model when converting to petri-net
const mineFromAbstraction = (
    logAbstraction: LogAbstraction,
    options = {
        findAdditionalConditions: true,
        findAdditionalResponses: false,
        skipRecomputingConditions: false,
        skipRecomputingResponses: false,
        optimize: true,
        findInitiallyPending: false
    }

): DCRGraph => {
    // Initialize graph
    const graph: DCRGraph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: logAbstraction.events,
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set<Event>(),
            pending: new Set<Event>(),
            included: copySet(logAbstraction.events),
        },
    };
    // Initialize all mappings to avoid indexing errors
    for (const event of graph.events) {
        graph.conditionsFor[event] = new Set<Event>();
        graph.excludesTo[event] = new Set<Event>();
        graph.includesTo[event] = new Set<Event>();
        graph.responseTo[event] = new Set<Event>();
        graph.milestonesFor[event] = new Set<Event>();
    }

    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        graph.excludesTo[event].add(event);
    }

    // Mine responses from logAbstraction
    graph.responseTo = copyEventMap(logAbstraction.responseTo);


    // Mine conditions from logAbstraction
    graph.conditionsFor = copyEventMap(logAbstraction.precedenceFor);

    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            graph.includesTo[i].add(j);
            graph.excludesTo[j].add(j);
        }
    }

    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(
            logAbstraction.successor[event],
        );
        const nonCoExisters = logAbstraction.nonCoExisters !== undefined ? logAbstraction.nonCoExisters[event] : new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        graph.excludesTo[event].union(nonCoExisters);

        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = logAbstraction.precedesButNeverSuceeds !== undefined ? logAbstraction.precedesButNeverSuceeds[event] : new Set(
            logAbstraction.predecessor[event],
        ).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!graph.excludesTo[s].has(s)) {
                graph.excludesTo[event].add(s);
            }
        }
    }

    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of graph.excludesTo[r]) {
                graph.excludesTo[s].delete(t);
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
        const possibleConditions: EventMap = copyEventMap(
            logAbstraction.predecessor,
        );

        // Start with every possible response. This get's intersected down for each trace
        const responses = fullRelation(logAbstraction.events);

        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set<Event>();

            const localResponses: EventMap = {};

            const included = copySet(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = copySet(logAbstraction.events).difference(included);
                const validConditions = options?.skipRecomputingConditions ? excluded : copySet(localSeenBefore).union(excluded);

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
                    localResponses[event] = new Set();
                    //// Add a potential response from each previous event to the current event
                    for (const prevEvent of localSeenBefore) {
                        localResponses[prevEvent].add(event)
                    }
                }
                //--------------------------------
                //            ///RESPONSES
                //--------------------------------
                localSeenBefore.add(event);
            }

            //--------------------------------
            //            RESPONSES
            //--------------------------------
            if (!options.skipRecomputingResponses) {
                // Add a potential response from each event in the trace to each excluded event
                const excluded = copySet(logAbstraction.events).difference(included);
                for (const prevEvent of localSeenBefore) {
                    localResponses[prevEvent].union(excluded);
                }
            } else {
                for (const prevEvent of localSeenBefore) {
                    localResponses[prevEvent] = copySet(logAbstraction.events).difference(included);
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
            const initiallyPending = copySet(logAbstraction.events);
            for (const traceId in logAbstraction.traces) {
                const trace = logAbstraction.traces[traceId];

                const included = copySet(logAbstraction.events);
                const pending = new Set<Event>();
                const executed = new Set<Event>();

                for (const event of trace) {
                    // Execute event
                    executed.add(event);
                    // Execute excludes starting from (event)
                    included.difference(graph.excludesTo[event]);
                    // Execute includes starting from (event)
                    included.union(graph.includesTo[event]);

                    pending.union(graph.responseTo[event]);
                }

                const excluded = copySet(logAbstraction.events).difference(included);
                // Initially pending for this trace are events that were never set pending, but still executed or excluded
                const localInitiallyPending = excluded.union(executed).difference(pending);
                // Find only initially pending that hold for ALL traces
                initiallyPending.intersect(localInitiallyPending);
            }

            graph.marking.pending = initiallyPending;
        }

        // Removing redundant conditions
        options?.optimize && optimizeRelation(graph.conditionsFor);
        options?.optimize && optimizeRelation(graph.responseTo);
    }
    return graph;
};

export const filter = (log: EventLog<Trace>, DT: number): EventLog<Trace> => {
    const alpha = 0.5;
    const GNF = 0.02;
    const C1 = 4;
    const C2 = 4;

    const DFDs: FuzzyRelation = {};
    const preSets: EventMap = {};
    const sucSets: EventMap = {};

    for (const event of log.events) {
        DFDs[event] = {};
        for (const otherEvent of log.events) {
            DFDs[event][otherEvent] = 0;
        }
        preSets[event] = new Set();
        sucSets[event] = new Set();
    }

    for (const traceId in log.traces) {
        let lastEvent: string | null = null;
        for (const event of log.traces[traceId]) {
            if (lastEvent) {
                sucSets[lastEvent].add(event);
                preSets[event].add(lastEvent);
                DFDs[lastEvent][event] += 1;
            }
            lastEvent = event;
        }
    }

    const dPre: { [event: string]: number } = {};
    const dSuc: { [event: string]: number } = {};

    for (const event of log.events) {
        let nPre = 0;
        for (const preEvent of preSets[event]) {
            nPre += DFDs[preEvent][event];
        }
        if (preSets[event].size !== 0)
            dPre[event] = nPre / preSets[event].size;
        let nSuc = 0;
        for (const sucEvent of sucSets[event]) {
            nSuc += DFDs[event][sucEvent];
        }
        if (sucSets[event].size !== 0)
            dSuc[event] = nSuc / sucSets[event].size;
    }

    let dfdSum = 0;
    for (const event in DFDs) {
        for (const otherEvent in DFDs[event]) {
            dfdSum += DFDs[event][otherEvent];
        }
    }
    let theta = 0;
    for (const event in DFDs) {
        for (const otherEvent in DFDs[event]) {
            const potDFD = DFDs[event][otherEvent];
            if (potDFD > theta && potDFD / dfdSum < GNF) {
                theta = potDFD;
            }
        }
    }

    const mdMatrix: FuzzyRelation = {};
    for (const ei in DFDs) {
        mdMatrix[ei] = {};
        for (const ej in DFDs[ei]) {
            if (DFDs[ei][ej] === 0) {
                mdMatrix[ei][ej] = 0;
            } else {
                // local dependency
                const sucExp = (DFDs[ei][ej] - dSuc[ei]) * (C1 / dSuc[ei]);
                const preExp = (DFDs[ei][ej] - dPre[ej]) * (C2 / dPre[ej]);
                const dLocal = 1 - (1 / ((1 + Math.exp(sucExp)) * 2)) - (1 / ((1 + Math.exp(preExp)) * 2))
                // global dependency
                const dGlobal = 1 / (1 + Math.exp(1 - DFDs[ei][ej] / theta))
                // mixed dependency
                mdMatrix[ei][ej] = alpha * dLocal + (1 - alpha) * dGlobal
            }
        }
    }

    const filteredLog: EventLog<Trace> = {
        events: copySet(log.events),
        traces: {}
    };

    for (const traceId in log.traces) {
        let ei = null;
        let addTrace = true;
        const filteredTrace = [];
        for (const ej of log.traces[traceId]) {
            if (ei === null) {
                ei = ej;
                filteredTrace.push(ej);
            } else {
                if (mdMatrix[ei][ej] >= DT) {
                    filteredTrace.push(ej);
                    ei = ej;
                } else {
                    addTrace = false;
                    break;
                }
            }
        }

        if (addTrace) filteredLog.traces[traceId] = filteredTrace;
    }

    return filteredLog;
}

export default mineFromAbstraction;
