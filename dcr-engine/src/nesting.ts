import { DCRGraph, Event, EventMap, Marking, RelationType } from "./types";
import { copyMarking, copySet, flipEventMap, intersect } from "./utility";

type RelationsDict = { [event: Event]: Set<string> };
type ReturnNesting<T> = { nestedGraph: T, nestingIds: Set<string>, nestingRelations: { [event: Event]: string } };

const relationsDictToDCR = (relationsDict: RelationsDict, marking?: Marking): DCRGraph => {
    const events = new Set(Object.keys(relationsDict));
    const graph: DCRGraph = {
        events,

        conditionsFor: {},
        responseTo: {},
        includesTo: {},
        excludesTo: {},
        milestonesFor: {},

        marking: marking ? copyMarking(marking) : {
            included: events,
            executed: new Set(),
            pending: new Set(),
        }
    }

    const stringToRelation = (str: RelationType): EventMap => {
        switch (str) {
            case "condition": return graph.conditionsFor;
            case "exclude": return graph.excludesTo;
            case "response": return graph.responseTo;
            case "include": return graph.includesTo;
            case "milestone": return graph.milestonesFor;
        }
    }

    const shouldAdd = (str: RelationType, direction: "out" | "in") => {
        if (str === "condition" || str === "milestone") return direction === "in";
        else return direction === "out";
    }

    for (const event of events) {
        graph.conditionsFor[event] = new Set();
        graph.responseTo[event] = new Set();
        graph.includesTo[event] = new Set();
        graph.excludesTo[event] = new Set();
        graph.milestonesFor[event] = new Set();
    }

    for (const event in relationsDict) {
        for (const relation of relationsDict[event]) {
            const substrings = relation.split("_");
            if (substrings.length < 3) throw new Error("I didn't implement for this, easy fix though. ggez.");
            const otherEvent = substrings.length === 3 ? substrings[0] : substrings.slice(0, -2).join("_");
            const relStr = substrings[substrings.length - 2] as RelationType;
            const direction = substrings[substrings.length - 1] as "out" | "in";

            if (shouldAdd(relStr, direction)) {
                stringToRelation(relStr)[event].add(otherEvent);
            }
        }
    }

    return graph;
}

const getOppositeRelDictStr = (relationDictStr: string, event: Event, nestingId: string): { event: string, relationDictStrDel: string, relationDictStrAdd: string } => {
    const substrings = relationDictStr.split("_");
    if (substrings.length < 3) throw new Error("This shouldn't happen");
    const otherEvent = substrings.length === 3 ? substrings[0] : substrings.slice(0, -2).join("_");
    const relStr = substrings[substrings.length - 2] as RelationType;
    const direction = substrings[substrings.length - 1] as "out" | "in";

    return {
        event: otherEvent,
        relationDictStrDel: `${event}_${relStr}_${direction === "in" ? "out" : "in"}`,
        relationDictStrAdd: `${nestingId}_${relStr}_${direction === "in" ? "out" : "in"}`
    }
}

const setToStr = (set: Set<string>) => Array.from(set).sort().join();

const getRelationsDict = (graph: DCRGraph): RelationsDict => {
    const relationsDict: RelationsDict = {};
    for (const event of graph.events) {
        relationsDict[event] = new Set();
    }

    const addRelation = (rel: EventMap, name: RelationType) => {
        const flippedRel = flipEventMap(rel);
        // Ensure proper naming for flipped relations. Shouldn't matter in practice.
        const { d1, d2 } = name === "condition" || name === "milestone" ? { d1: "in", d2: "out" } : { d1: "out", d2: "in" };

        for (const event of graph.events) {
            for (const otherEvent of rel[event]) {
                relationsDict[event].add(otherEvent + "_" + name + "_" + d1);
            }
            for (const otherEvent of flippedRel[event]) {
                relationsDict[event].add(otherEvent + "_" + name + "_" + d2);
            }
        }
    }

    addRelation(graph.conditionsFor, "condition");
    addRelation(graph.responseTo, "response");
    addRelation(graph.excludesTo, "exclude");
    addRelation(graph.includesTo, "include");
    addRelation(graph.milestonesFor, "milestone");

    return relationsDict;
}


// This has become a mess, but it works... sorry...
// On the bright side, there should be no reason for you to touch this in any way
export const nestDCR = (graph: DCRGraph, minSharedRels: number = 1, events = copySet(graph.events), relationDict: RelationsDict = getRelationsDict(graph)): ReturnNesting<DCRGraph> => {

    let idCounter = 0;
    const getNestingId = () => "Nesting" + idCounter++;

    const nestingIds = new Set<string>();
    const nestingRelations: { [event: Event]: string } = {};

    const findLargestNesting = (events: Set<Event>, parentNesting?: { id: string, events: Set<Event> }): Set<Event> => {

        if (parentNesting && events.size <= 2) return new Set();

        const eventArr = [...events];
        const possibleNestings: {
            [possibleNestingId: string]: {
                nestingEvents: Set<Event>;
                sharedRels: Set<string>;
            }
        } = {};

        for (let i = 0; i < eventArr.length; i++) {
            for (let j = i + 1; j < eventArr.length; j++) {
                const e1 = eventArr[i];
                const e2 = eventArr[j];

                const shared = intersect(relationDict[e1], relationDict[e2]);
                if (!possibleNestings[setToStr(shared)]) {
                    possibleNestings[setToStr(shared)] = { nestingEvents: new Set([e1, e2]), sharedRels: shared };
                } else {
                    possibleNestings[setToStr(shared)].nestingEvents.union(new Set([e1, e2]));
                }
            }
        }


        let bestNesting = { nestingEvents: new Set<string>(), sharedRels: new Set<string>() }
        let max = 0;
        for (const possibleNestingId in possibleNestings) {
            const nesting = possibleNestings[possibleNestingId];

            if (parentNesting && copySet(parentNesting.events).difference(nesting.nestingEvents).size === 0) continue;

            const metric = (nesting.nestingEvents.size - 1) * nesting.sharedRels.size;
            if (metric > max) {
                max = metric;
                bestNesting = nesting;
            }
        }


        if (!(bestNesting.nestingEvents.size > 1 && bestNesting.sharedRels.size >= minSharedRels)) return new Set();

        const nestingId = getNestingId();

        nestingIds.add(nestingId);

        if (parentNesting) {
            parentNesting.events.difference(bestNesting.nestingEvents);
            parentNesting.events.add(nestingId);
            nestingRelations[nestingId] = parentNesting.id;
        }
        for (const event of bestNesting.nestingEvents) {
            nestingRelations[event] = nestingId;
        }

        for (const nestedEvent of bestNesting.nestingEvents) {
            relationDict[nestedEvent].difference(bestNesting.sharedRels);
            for (const sharedRelStr of bestNesting.sharedRels) {
                const { event, relationDictStrDel, relationDictStrAdd } = getOppositeRelDictStr(sharedRelStr, nestedEvent, nestingId);
                relationDict[event] && relationDict[event].add(relationDictStrAdd);
                relationDict[event] && relationDict[event].delete(relationDictStrDel);
            }
        }

        relationDict[nestingId] = copySet(bestNesting.sharedRels);

        let stillSharedRels;
        for (const nestedEvent of bestNesting.nestingEvents) {
            if (!stillSharedRels) {
                stillSharedRels = relationDict[nestedEvent];
            } else {
                stillSharedRels = intersect(stillSharedRels, relationDict[nestedEvent]);
            }
        }

        // iterate once more removing relations that are still shared (self-relations on nestings)
        for (const nestedEvent of bestNesting.nestingEvents) {
            relationDict[nestedEvent].difference(stillSharedRels as Set<string>);
            for (const sharedRelStr of stillSharedRels as Set<string>) {
                const { event, relationDictStrDel, relationDictStrAdd } = getOppositeRelDictStr(sharedRelStr, nestedEvent, nestingId);
                relationDict[event] && relationDict[event].add(relationDictStrAdd);
                relationDict[event] && relationDict[event].delete(relationDictStrDel);
            }
        }


        const eventsToConsider = copySet(bestNesting.nestingEvents);
        const allEventsInNesting = copySet(bestNesting.nestingEvents);
        let repeat = true;
        while (repeat) {
            const largestNesting = findLargestNesting(eventsToConsider, { id: nestingId, events: bestNesting.nestingEvents });
            eventsToConsider.difference(largestNesting);
            repeat = largestNesting.size !== 0;
        }

        return allEventsInNesting;
    }

    let repeat = true;
    while (repeat) {
        const eventsFound = findLargestNesting(events);
        events.difference(eventsFound);
        repeat = eventsFound.size !== 0;
    }

    return { nestedGraph: { ...relationsDictToDCR(relationDict, graph.marking), events: copySet(graph.events).union(nestingIds) }, nestingIds, nestingRelations };
}