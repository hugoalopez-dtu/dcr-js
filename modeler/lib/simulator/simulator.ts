import {
    DCRGraph,
    Event,
    EventMap,
    Marking,
} from "./types";

import { execute, isEnabled } from "./align";
import { copyMarking } from "./utility";

let rootGraph: DCRGraph;

export const startSimulator = (root: any) => {
    rootGraph = initGraph(root);
    console.log("Simulator graph:");
    console.log(rootGraph);
}

export const executeEvent  = (eventElement: any) => {
    /*const event: Event = eventElement.id;
    if (!isEnabled(event, dcrGraph)) return;
    execute(event, dcrGraph);*/
}

const initGraph = (root: any): DCRGraph => {
    let graph: DCRGraph = {} as DCRGraph;
    graph = clearGraph(graph);
    console.log("Root:");
    console.log(root);

    const eventElements = root.children.filter((element: any) => element.type === 'dcr:Event');
    const relationElements = root.children.filter((element: any) => element.type === 'dcr:Relation');
    const nestingElements = root.children.filter((element: any) => element.type === 'dcr:Nesting');
    const subProcessElements = root.children.filter((element: any) => element.type === 'dcr:SubProcess');

    subProcessElements.forEach((element: any) => {
        graph.subProcesses.add(initGraph(element));
    });

    // Add events to the graph
    addEvents(graph, eventElements);
    addEvents(graph, subProcessElements);

    // Add events from nested elements to the graph
    addNestings(graph, nestingElements);

    // Save the original marking
    //graph.originalMarking = copyMarking(graph.dcrGraph.marking);

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

const addNestings = (graph: DCRGraph, elements: Set<any>) => {
    elements.forEach((element: any) => {
        const eventElements = element.children.filter((element: any) => element.type === 'dcr:Event');
        const nestingElements = element.children.filter((element: any) => element.type === 'dcr:Nesting');
        const subProcessElements = element.children.filter((element: any) => element.type === 'dcr:SubProcess');
        addEvents(graph, eventElements);
        addEvents(graph, subProcessElements);
        addNestings(graph, nestingElements);
    });
}

const addEvents = (graph: DCRGraph, elements: Set<any>) => {
    elements.forEach((element: any) => {
        graph.events.add(element.id);
        graph.conditionsFor[element.id] = new Set();
        graph.milestonesFor[element.id] = new Set();
        graph.responseTo[element.id] = new Set();
        graph.includesTo[element.id] = new Set();
        graph.excludesTo[element.id] = new Set();
        if (element.businessObject.get('pending')) {
            graph.marking.pending.add(element.id);
        }
        if (element.businessObject.get('executed')) {
            graph.marking.executed.add(element.id);
        }
        if (element.businessObject.get('included')) {
            graph.marking.included.add(element.id);
        }
    });
}

const addRelation =
    (relationSet: EventMap, nestings: Set<any>, source: string, target: string) => {
    
    // Handle Nesting groupings by adding relations for all nested elements
    if (source.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === source) {
                element.children.forEach((nestedElement: any) => {
                    addRelation(relationSet, nestings, nestedElement.id, target);
                });
            }
        });
    } else if (target.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === target) {
                element.children.forEach((nestedElement: any) => {
                    addRelation(relationSet, nestings, source, nestedElement.id);
                });
            }
        });
    } else {
        // Add direct relation if neither source nor target is a Nesting group
        relationSet[source].add(target);
    }
}

const clearGraph = (graph: DCRGraph): DCRGraph => {
    graph = {
        events: new Set(),
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
    return graph;
}

export const updateRootGraph = (modeler: any) => {
    const modeling = modeler.get('modeling');
    updateGraph(modeling, modeler.get('elementRegistry'), rootGraph);
}

// Update the visual representation of the graph with the new states/markings
const updateGraph = (modeling: any, elementReg: any, graph: DCRGraph) => {
    graph.events.forEach((event: any) => {
        let element = elementReg.get(event);
        modeling.updateProperties(element, {executed: graph.marking.executed.has(event)});
        modeling.updateProperties(element, {included: graph.marking.included.has(event)});
        modeling.updateProperties(element, {pending: graph.marking.pending.has(event)});
        if (event.includes('Event')) {
            modeling.updateProperties(element, {enabled: isEnabled(event, graph)});
        }
    });
    graph.subProcesses.forEach((subProcess: any) => {
        updateGraph(modeling, elementReg, subProcess);
    });
}

// Restore original marking for events and sub processes
export const restoreStates = () => {
    //dcrGraph.marking = copyMarking(originalMarking);
}
