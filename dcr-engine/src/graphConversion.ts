import {
    DCRGraph,
    Event,
    EventMap,
    Marking,
    Id,
    SubProcess,
    DCRGraphS
} from "./types";

import init from './init';
import { execute, isEnabled } from "./executionEngine";
import { copySet } from "./utility";

export const moddleToDCR = (elementReg: any): DCRGraphS => {
    const graph = emptyGraph();

    // Ensure that set operations have been initialized
    if (!graph.events.union) init();

    const relationElements = elementReg.filter((element: any) => element.type === 'dcr:Relation');

    const root = elementReg.get('dcrGraph');
    const eventElements = root.children.filter((element: any) => element.type === 'dcr:Event');
    const nestingElements = root.children.filter((element: any) => element.type === 'dcr:Nesting');
    const subProcessElements = root.children.filter((element: any) => element.type === 'dcr:SubProcess');

    // Add events to the graph
    addEvents(graph, graph, eventElements);
    addEvents(graph, graph, subProcessElements);

    // Add subprocesses to the graph
    addSubProcesses(graph, graph, subProcessElements);

    // Add events from nested elements to the graph
    addNestings(graph, graph, nestingElements);

    // Save the original marking
    //originalMarking = copyMarking(graph.marking);

    // Add relations to the graph
    relationElements.forEach((element: any) => {
        const source: string = element.businessObject.get('sourceRef' ).id;
        const target: string = element.businessObject.get('targetRef' ).id;
        switch (element.businessObject.get('type')) {
            case 'condition':
                addRelation(graph.conditionsFor, nestingElements, target, source);
                break;
            case 'milestone':
                addRelation(graph.milestonesFor, nestingElements, target, source);
                break;
            case 'response':
                addRelation(graph.responseTo, nestingElements, source, target);
                break;
            case 'include':
                addRelation(graph.includesTo, nestingElements, source, target);
                break;
            case 'exclude':
                addRelation(graph.excludesTo, nestingElements, source, target);
                break;
        }
    });

    return graph;
}

const addSubProcesses = (graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Set<any>) => {
    elements.forEach((element: any) => {
        const subProcess: SubProcess = {
            id: element.id,
            parent: parent,
            events: new Set(),
            subProcesses: new Set()
        }

        // Find events, subprocesses and nestings
        const eventElements = element.children.filter((element: any) => element.type === 'dcr:Event');
        const subProcessElements = element.children.filter((element: any) => element.type === 'dcr:SubProcess');
        const nestingElements = element.children.filter((element: any) => element.type === 'dcr:Nesting');

        // Add events to the graph
        addEvents(graph, subProcess, eventElements);
        addEvents(graph, subProcess, subProcessElements);

        // Add subprocesses to the graph
        addSubProcesses(graph, subProcess, subProcessElements);

        // Add events from nested elements to the graph
        addNestings(graph, subProcess, nestingElements);

        // Add subprocess to parent graph
        parent.subProcesses.add(subProcess);
    });
}

const addNestings = (graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Set<any>) => {
    elements.forEach((element: any) => {
        const eventElements = element.children.filter((element: any) => element.type === 'dcr:Event');
        const nestingElements = element.children.filter((element: any) => element.type === 'dcr:Nesting');
        const subProcessElements = element.children.filter((element: any) => element.type === 'dcr:SubProcess');
        addEvents(graph, parent, eventElements);
        addEvents(graph, parent, subProcessElements);
        addNestings(graph, parent, nestingElements);
        addSubProcesses(graph, parent, subProcessElements);
    });
}

const addEvents = (graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Set<any>) => {
    elements.forEach((element: any) => {
        // Add event to subprocess
        const label = element.businessObject.get('description');
        parent.events.add(element.id);
        graph.labels.add(label);
        graph.labelMap[element.id] = label;
        if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
        graph.labelMapInv[label].add(element.id);

        // Add marking for event in graph
        if (element.businessObject.get('pending')) {
            graph.marking.pending.add(element.id);
        }
        if (element.businessObject.get('executed')) {
            graph.marking.executed.add(element.id);
        }
        if (element.businessObject.get('included')) {
            graph.marking.included.add(element.id);
        }
    
        // Initialize relations for event in graph 
        graph.conditionsFor[element.id] = new Set();
        graph.milestonesFor[element.id] = new Set();
        graph.responseTo[element.id] = new Set();
        graph.includesTo[element.id] = new Set();
        graph.excludesTo[element.id] = new Set();
    });
}

const addRelation =
    (relationSet: EventMap, nestings: Set<any>, source: string, target: string) => {
    // Handle Nesting groupings by adding relations for all nested elements
    if (source.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === source) {
                element.children.forEach((nestedElement: any) => {
                    if (nestedElement.type === 'dcr:SubProcess' || 
                        nestedElement.type === 'dcr:Event' || 
                        nestedElement.type === 'dcr:Nesting') {
                        addRelation(relationSet, nestings, nestedElement.id, target);
                    }
                });
            }
        });
    } else if (target.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === target) {
                element.children.forEach((nestedElement: any) => {
                    if (nestedElement.type === 'dcr:SubProcess' || 
                        nestedElement.type === 'dcr:Event' || 
                        nestedElement.type === 'dcr:Nesting') {
                        addRelation(relationSet, nestings, source, nestedElement.id);
                    }
                });
            }
        });
    } else {
        // Add direct relation if neither source nor target is a Nesting group
        relationSet[source].add(target);
    }
}


const emptyGraph = (): DCRGraphS => {
    return {
        events: new Set(),
        labels: new Set(),
        labelMap: {},
        labelMapInv: {},
        subProcesses: new Set(),
        conditionsFor: {},
        milestonesFor: {},
        responseTo: {},
        includesTo: {},
        excludesTo: {},
        marking: {
            executed: new Set(),
            included: new Set(),
            pending: new Set(),
        },
    }
}

