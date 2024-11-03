import { DCRGraph, EventMap, Event, LabelDCR } from "../types";
import { BitDCRGraph, BitEventMap, BitLabelDCR, BitLabelling, BitMarking, BitOptimizations, BitSet } from "../bitTypes";

// Makes deep copy of a eventMap
export const copyBitEventMap = (eventMap: BitEventMap): BitEventMap => {
    const copy: BitEventMap = {};
    for (const startEvent in eventMap) {
        copy[startEvent] = eventMap[startEvent].copy();
    }
    return copy;
};

export const copyBitMarking = (marking: BitMarking): BitMarking => {
    return {
        executed: marking.executed.copy(),
        included: marking.included.copy(),
        pending: marking.pending.copy(),
    }
}

export const fullBitRelation = (events: BitSet): BitEventMap => {
    const retrel: BitEventMap = {};
    for (const event of events) {
        retrel[event] = events.copy();
        retrel[event].deleteString(event);
    }
    return retrel
}

export const reverseBitRelation = (rel: BitEventMap, events: BitSet): BitEventMap => {
    const retval: BitEventMap = {};
    const emptySet = events.copy().clear();
    for (const event of events) {
        retval[event] = emptySet.copy();
    }
    for (const event in rel) {
        for (const otherEvent of rel[event]) {
            retval[event].addString(otherEvent);
        }
    }
    return retval;
}

export const bitToRegularSet = (bitSet: BitSet): Set<string> => {
    const retval = new Set<string>();
    for (const elem of bitSet) {
        retval.add(elem);
    }
    return retval;
}

export const bitToRegularEventMap = (bitEventMap: BitEventMap): EventMap => {
    const retval: EventMap = {};
    for (const key in bitEventMap) {
        retval[key] = bitToRegularSet(bitEventMap[key]);
    }
    return retval;
}

export const bitToRegularDCR = (bitGraph: BitDCRGraph): DCRGraph => {
    return {
        events: bitToRegularSet(bitGraph.events),
        conditionsFor: bitToRegularEventMap(bitGraph.conditionsFor),
        responseTo: bitToRegularEventMap(bitGraph.responseTo),
        excludesTo: bitToRegularEventMap(bitGraph.excludesTo),
        includesTo: bitToRegularEventMap(bitGraph.includesTo),
        milestonesFor: bitToRegularEventMap(bitGraph.milestonesFor),
        marking: {
            included: bitToRegularSet(bitGraph.marking.included),
            pending: bitToRegularSet(bitGraph.marking.pending),
            executed: bitToRegularSet(bitGraph.marking.executed),
        }
    }
}

export const bitGraphToGraphPP = <T extends BitDCRGraph>(graph: T): T & BitOptimizations => {
    const conditions = graph.events.copy();
    conditions.clear();
    for (const key in graph.conditionsFor) {
        conditions.union(graph.conditionsFor[key]);
    }
    return { ...graph, conditions, includesFor: reverseBitRelation(graph.includesTo, graph.events), excludesFor: reverseBitRelation(graph.excludesTo, graph.events) };
};

export const bitDCRtoLabelDCR = <T extends BitDCRGraph>(graph: T): T & BitLabelling => {
    const labelMap: { [name: string]: string } = {};
    const labelMapInv: EventMap = {};

    for (const event of graph.events) {
        labelMap[event] = event;
        labelMapInv[event] = new Set([event]);
    }

    const labels = new Set<Event>();
    for (const event of graph.events) {
        labels.add(event);
    }
    const labelModel: T & BitLabelling = {
        ...graph,
        labels,
        labelMap,
        labelMapInv
    }
    return labelModel;
}

export const dcrToBitDCR = (graph: DCRGraph): BitDCRGraph => {
    const events = new BitSet({ allElems: graph.events, startingElems: graph.events });
    const emptySet = events.copy().clear();

    const translateSet = (set: Set<Event>): BitSet => {
        const retSet = emptySet.copy();
        for (const event of set) {
            retSet.addString(event);
        }
        return retSet;
    }

    const translateRelation = (rel: EventMap): BitEventMap => {
        const retval: BitEventMap = {};
        for (const key in rel) {
            retval[key] = translateSet(rel[key]);
        }
        return retval;
    }

    return {
        events,
        conditionsFor: translateRelation(graph.conditionsFor),
        responseTo: translateRelation(graph.responseTo),
        excludesTo: translateRelation(graph.excludesTo),
        includesTo: translateRelation(graph.includesTo),
        milestonesFor: translateRelation(graph.milestonesFor),
        marking: {
            executed: translateSet(graph.marking.executed),
            pending: translateSet(graph.marking.pending),
            included: translateSet(graph.marking.included),
        }
    }
}

export const labelDCRToBit = (graph: LabelDCR): BitLabelDCR => {
    return {
        ...graph,
        ...dcrToBitDCR(graph)
    }
}