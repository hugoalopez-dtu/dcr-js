import {
    DCRGraph,
    Event,
    Marking,
} from "./types";

import { execute, isEnabled } from "./align";

let graph: DCRGraph;

export const executeEvent  = (event: Event) => {
    console.log("Execute event: " + event);
    if (!isEnabled(event, graph)) return;
    execute(event, graph);
    console.log("Executed successfully");
}

export const startSimulator = (elementReg: any) => {
    const dcrGraph: DCRGraph = {
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
    elementReg.forEach((element: any) => {
        if (element.type === 'dcr:Event') {
            dcrGraph.events.add(element.id);
            dcrGraph.conditionsFor[element.id] = new Set();
            dcrGraph.milestonesFor[element.id] = new Set();
            dcrGraph.responseTo[element.id] = new Set();
            dcrGraph.includesTo[element.id] = new Set();
            dcrGraph.excludesTo[element.id] = new Set();
            dcrGraph.marking.included.add(element.id);
            /*if (element.businessObject.get('pending')) {
                dcrGraph.marking.pending.add(element.id);
            }
            if (element.businessObject.get('included')) {
                dcrGraph.marking.included.add(element.id);
            }
            if (element.businessObject.get('executed')) {
                dcrGraph.marking.executed.add(element.id);
            }*/
        }
    });
    elementReg.forEach((element: any) => {
        if (element.type === 'dcr:Relation') {
            switch (element.businessObject.get('type')) {
                case 'condition':
                    dcrGraph.conditionsFor[element.businessObject.get('targetRef').id]
                        .add(element.businessObject.get('sourceRef').id);
                    break;
                case 'milestone':
                    dcrGraph.milestonesFor[element.businessObject.get('targetRef').id]
                        .add(element.businessObject.get('sourceRef').id);
                    break;
                case 'response':
                    dcrGraph.responseTo[element.businessObject.get('sourceRef').id]
                        .add(element.businessObject.get('targetRef').id);
                    break;
                case 'include':
                    dcrGraph.includesTo[element.businessObject.get('sourceRef').id]
                        .add(element.businessObject.get('targetRef').id);
                    break;
                case 'exclude':
                    dcrGraph.excludesTo[element.businessObject.get('sourceRef').id]
                        .add(element.businessObject.get('targetRef').id);
                    break;
            }
        }
    });
    console.log(dcrGraph);
    graph = dcrGraph;
}

export const updateGraph = (elementReg: any, modeler: any) => {
    elementReg.forEach((element: any) => {
        if (element.type === 'dcr:Event') {
            modeler.get('modeling').updateProperties(element, {executed: graph.marking.executed.has(element.id)});
            modeler.get('modeling').updateProperties(element, {included: graph.marking.included.has(element.id)});
            modeler.get('modeling').updateProperties(element, {pending: graph.marking.pending.has(element.id)});
            if (isEnabled(element.id, graph)) {

            }
        }
    });
}