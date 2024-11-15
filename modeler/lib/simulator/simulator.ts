import {
    DCRGraph,
    Event,
    EventMap,
    Marking
} from "./types";

import { execute, isEnabled } from "./align";
import { copyMarking } from "./utility";

let dcrGraph: DCRGraph;
let events: Set<any>;
let relations: Set<any>;
let nestings: Set<any>;
let subProcesses: Set<any>;
let originalMarking: Marking;

const clearGraph = () => {
    dcrGraph = {
        events: new Set(),
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
    
    events = new Set();
    relations = new Set();
    nestings = new Set();
    subProcesses = new Set();
}

export const executeEvent  = (event: Event) => {
    if (!isEnabled(event, dcrGraph)) return;
    execute(event, dcrGraph);
}

export const startSimulator = (elementReg: any) => {
    clearGraph();

    elementReg.forEach((element: any) => {
        
        // Add events to the graph
        if (element.type === 'dcr:Event' ||element.type === 'dcr:SubProcess') {
            dcrGraph.events.add(element.id);
            dcrGraph.conditionsFor[element.id] = new Set();
            dcrGraph.milestonesFor[element.id] = new Set();
            dcrGraph.responseTo[element.id] = new Set();
            dcrGraph.includesTo[element.id] = new Set();
            dcrGraph.excludesTo[element.id] = new Set();
            if (element.businessObject.get('pending')) {
                dcrGraph.marking.pending.add(element.id);
            }
            if (element.businessObject.get('executed')) {
                dcrGraph.marking.executed.add(element.id);
            }
            if (element.businessObject.get('included')) {
                dcrGraph.marking.included.add(element.id);
            }
        }

        // Save the different types of elements in separate sets
        switch (element.type) {
            case 'dcr:Event':
                events.add(element);
                break;
            case 'dcr:Relation':
                relations.add(element);
                break;
            case 'dcr:Nesting':
                nestings.add(element);
                break;
            case 'dcr:SubProcess':
                subProcesses.add(element);
                break;
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