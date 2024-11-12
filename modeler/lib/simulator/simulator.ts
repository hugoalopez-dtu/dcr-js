import {
    DCRGraph,
    Event,
    EventMap
} from "./types";

import { execute, isEnabled } from "./align";
import { clear } from "min-dom";

let dcrGraph: DCRGraph;
let events: Set<any>;
let relations: Set<any>;
let nestings: Set<any>;
let subProcesses: Set<any>;

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
    relations.forEach((element: any) => {
        switch (element.businessObject.get('type')) {
            case 'condition':
                addRelation(dcrGraph.conditionsFor,
                    element.businessObject.get('targetRef' ).id,
                    element.businessObject.get('sourceRef' ).id);
                break;
            case 'milestone':
                addRelation(dcrGraph.milestonesFor,
                    element.businessObject.get('targetRef' ).id,
                    element.businessObject.get('sourceRef' ).id);
                break;
            case 'response':
                addRelation(dcrGraph.responseTo,
                    element.businessObject.get('sourceRef' ).id,
                    element.businessObject.get('targetRef' ).id);
                break;
            case 'include':
                addRelation(dcrGraph.includesTo,
                    element.businessObject.get('sourceRef' ).id,
                    element.businessObject.get('targetRef' ).id);
                break;
            case 'exclude':
                addRelation(dcrGraph.excludesTo,
                    element.businessObject.get('sourceRef' ).id,
                    element.businessObject.get('targetRef' ).id);
                break;
        }
    });
}

const addRelation =
    (relationSet: EventMap, source: string, target: string) => {
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

    if (!source.includes('Nesting') && !target.includes('Nesting')) 
        relationSet[source].add(target);
}

export const updateGraph = (elementReg: any, modeler: any) => {
    events.forEach((element: any) => {
        modeler.get('modeling').updateProperties(element, {executed: dcrGraph.marking.executed.has(element.id)});
        modeler.get('modeling').updateProperties(element, {included: dcrGraph.marking.included.has(element.id)});
        modeler.get('modeling').updateProperties(element, {pending: dcrGraph.marking.pending.has(element.id)});
        modeler.get('modeling').updateProperties(element, {enabled: isEnabled(element.id, dcrGraph)});
    });
    subProcesses.forEach((element: any) => {
        modeler.get('modeling').updateProperties(element, {executed: dcrGraph.marking.executed.has(element.id)});
        modeler.get('modeling').updateProperties(element, {included: dcrGraph.marking.included.has(element.id)});
        modeler.get('modeling').updateProperties(element, {pending: dcrGraph.marking.pending.has(element.id)});
    });
}