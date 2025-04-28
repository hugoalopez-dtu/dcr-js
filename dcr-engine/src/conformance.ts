import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { DCRGraph, DCRGraphS, Event, FuzzyRelation, RoleTrace, Trace } from "./types";
import { copyMarking, copySet, reverseRelation } from "./utility";

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


const mergeFuzRels = (viols1: FuzzyRelation, viols2: FuzzyRelation): FuzzyRelation => {
    const retval: FuzzyRelation = { ...viols1 };
    for (const e1 in viols2) {
        if (e1 in retval) {
            retval[e1] = Object.entries(viols2[e1]).reduce((acc, [key, value]) =>
                // if key is already in retval, add the values, otherwise, create new pair
                ({ ...acc, [key]: (acc[key] || 0) + value })
                , retval[e1]);
        } else {
            retval[e1] = { ...viols2[e1] };
        }
    }
    console.log(viols1, viols2);
    console.log(retval);
    return retval;
}

const mergeViolations = (viols1: RelationViolations, viols2: RelationViolations): RelationViolations => {
    return {
        conditionsFor: mergeFuzRels(viols1.conditionsFor, viols2.conditionsFor),
        responseTo: mergeFuzRels(viols1.responseTo, viols2.responseTo),
        excludesTo: mergeFuzRels(viols1.excludesTo, viols2.excludesTo),
        milestonesFor: mergeFuzRels(viols1.milestonesFor, viols2.milestonesFor),
    }
}

const emptyFuzzyRel = (events: Set<Event>): FuzzyRelation => {
    const retval: FuzzyRelation = {};
    for (const event of events) {
        retval[event] = {};
        for (const event2 of events) {
            retval[event][event2] = 0;
        }
    }
    return retval;
}

type RelationViolations = {
    conditionsFor: FuzzyRelation;
    responseTo: FuzzyRelation;
    excludesTo: FuzzyRelation;
    milestonesFor: FuzzyRelation;
}

/*

export const quantifyViolations = (graph: DCRGraphS, trace: RoleTrace): { totalViolations: number, violations: RelationViolations } => {
    // Copies and flips excludesTo and responseTo to easily find all events that are the sources of the relations
    const excludesFor = reverseRelation(graph.excludesTo);
    const responseFor = reverseRelation(graph.responseTo);

    const quantifyRec = (graph: DCRGraphS, trace: RoleTrace): { totalViolations: number, violations: RelationViolations } => {
        if (trace.length === 0) {
            // Response violations (each included pending event is a violation)
            return {
                totalViolations: graph.marking.pending.intersect(graph.marking.included).size,
                violations: {
                    conditionsFor: emptyFuzzyRel(graph.events),
                    responseTo: emptyFuzzyRel(graph.events),
                    excludesTo: emptyFuzzyRel(graph.events),
                    milestonesFor: emptyFuzzyRel(graph.events),
                }
            }
        };

        const [head, ...tail] = trace;

        let leastViolations = Infinity;
        let bestRelationViolations: RelationViolations = {
            conditionsFor: {},
            responseTo: {},
            excludesTo: {},
            milestonesFor: {}
        };
        const initMarking = copyMarking(graph.marking);
        for (const event of graph.labelMapInv[head.activity]) {
            let localViolationCount = 0;
            const localViolations: RelationViolations = {
                conditionsFor: {},
                responseTo: {},
                excludesTo: {},
                milestonesFor: {}
            };

            // Condition violations
            for (const otherEvent of copySet(graph.conditionsFor[event]).difference(
                graph.marking.executed,
            )) {
                if (graph.marking.included.has(otherEvent)) {
                    if (!localViolations.conditionsFor[event]) localViolations.conditionsFor[event] = {};
                    if (!localViolations.conditionsFor[event][otherEvent]) localViolations.conditionsFor[event][otherEvent] = 0;
                    localViolations.conditionsFor[event][otherEvent]++;
                    localViolationCount++;
                }
            }
            // Milestone violations
            for (const otherEvent of copySet(graph.milestonesFor[event]).intersect(
                graph.marking.pending,
            )) {
                if (graph.marking.included.has(otherEvent)) {
                    if (!localViolations.milestonesFor[event]) localViolations.milestonesFor[event] = {};
                    if (!localViolations.milestonesFor[event][otherEvent]) localViolations.milestonesFor[event][otherEvent] = 0;
                    localViolations.milestonesFor[event][otherEvent]++;
                    localViolationCount++;
                }
            }
            // Exclude violation
            if (!graph.marking.included.has(event)) localViolationCount++;
            // TODO compute exclusion violations

            executeS(event, graph);
            const { totalViolations: recTotalViolations, violations: recViolations } = quantifyRec(graph, tail);
            if (localViolationCount + recTotalViolations < leastViolations) {
                leastViolations = localViolationCount + recTotalViolations;
                bestRelationViolations = mergeViolations(localViolations, recViolations);
            }
            graph.marking = copyMarking(initMarking);
        }


        graph.marking = copyMarking(initMarking);
        return { totalViolations: leastViolations, violations: bestRelationViolations };
    };

    return quantifyRec(graph, trace);
}
    */