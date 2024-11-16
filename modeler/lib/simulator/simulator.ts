import {
    DCRGraph,
    Event,
    EventMap,
    Marking
} from "./types";

import { execute, isEnabled } from "./align";
import { copyMarking } from "./utility";

interface FullGraph {
    dcrGraph: DCRGraph;
    events: Set<any>;
    relations: Set<any>;
    nestings: Set<any>;
    subProcesses: Set<any>;
}

let originalMarking: Marking;

const initGraph = (graph: FullGraph) => {
    graph.dcrGraph = {
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

    graph.events = new Set();
    graph.relations = new Set();
    graph.nestings = new Set();
    graph.subProcesses = new Set();
}

export const executeEvent  = (event: Event) => {
    if (!isEnabled(event, dcrGraph)) return;
    execute(event, dcrGraph);
}

export const startGraph = (root: any) => {
    const graph: FullGraph = {} as FullGraph;
    initGraph(graph);

    root.children.forEach((element: any) => {
        // Save the different types of elements in separate sets
        switch (element.type) {
            case 'dcr:Event':
                graph.events.add(element);
                break;
            case 'dcr:Relation':
                graph.relations.add(element);
                break;
            case 'dcr:Nesting':
                graph.nestings.add(element);
                break;
            case 'dcr:SubProcess':
                graph.subProcesses.add(element);
                break;
        }
    });

    graph.subProcesses.forEach((element: any) => {
        startGraph(element);
    });

    // Add events to the graph
    [...graph.events, ...graph.subProcesses].forEach((element: any) => {
        graph.dcrGraph.events.add(element.id);
        graph.dcrGraph.conditionsFor[element.id] = new Set();
        graph.dcrGraph.milestonesFor[element.id] = new Set();
        graph.dcrGraph.responseTo[element.id] = new Set();
        graph.dcrGraph.includesTo[element.id] = new Set();
        graph.dcrGraph.excludesTo[element.id] = new Set();
        if (element.businessObject.get('pending')) {
            graph.dcrGraph.marking.pending.add(element.id);
        }
        if (element.businessObject.get('executed')) {
            graph.dcrGraph.marking.executed.add(element.id);
        }
        if (element.businessObject.get('included')) {
            graph.dcrGraph.marking.included.add(element.id);
        }
    });

    // Save the original marking
    originalMarking = copyMarking(dcrGraph.marking);

    // Add relations to the graph
    relations.forEach((element: any) => {
        const source: string = element.businessObject.get('sourceRef' ).id;
        const target: string = element.businessObject.get('targetRef' ).id;
        switch (element.businessObject.get('type')) {
            case 'condition':
                addRelation(dcrGraph.conditionsFor, target, source);
                break;
            case 'milestone':
                addRelation(dcrGraph.milestonesFor, target, source);
                break;
            case 'response':
                addRelation(dcrGraph.responseTo, source, target);
                break;
            case 'include':
                addRelation(dcrGraph.includesTo, source, target);
                break;
            case 'exclude':
                addRelation(dcrGraph.excludesTo, source, target);
                break;
        }
    });
}

const addRelation =
    (relationSet: EventMap, source: string, target: string) => {
    
    // Handle Nesting groupings by adding relations for all nested elements
    if (source.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === source) {
                element.children.forEach((nestedElement: any) => {
                    addRelation(relationSet, nestedElement.id, target);
                });
            }
        });
    }
    if (target.includes('Nesting')) {
        nestings.forEach((element: any) => {
            if (element.id === target) {
                element.children.forEach((nestedElement: any) => {
                    addRelation(relationSet, source, nestedElement.id);
                });
            }
        });
    }

    // Add direct relation if neither source nor target is a Nesting group
    if (!source.includes('Nesting') && !target.includes('Nesting')) 
        relationSet[source].add(target);
}

// Update the visual representation of the graph with the new states/markings
export const updateGraph = (modeler: any) => {
    const modeling = modeler.get('modeling');
    [...events, ...subProcesses].forEach((element: any) => {
        modeling.updateProperties(element, {executed: dcrGraph.marking.executed.has(element.id)});
        modeling.updateProperties(element, {included: dcrGraph.marking.included.has(element.id)});
        modeling.updateProperties(element, {pending: dcrGraph.marking.pending.has(element.id)});
    });
    events.forEach((element: any) => {
        modeling.updateProperties(element, {enabled: isEnabled(element.id, dcrGraph)});
    });
}

// Restore original marking for events and sub processes
export const restoreStates = () => {
    dcrGraph.marking = copyMarking(originalMarking);
}