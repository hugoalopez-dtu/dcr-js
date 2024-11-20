import {
    DCRGraph,
    Event,
    EventMap,
    Marking,
    Id,
    SubProcess
} from "./types";

import { execute, isEnabled } from "./align";
import { copyMarking } from "./utility";
import { appendSimulationLog } from "../../starter/src/app";
import { addToSimulationTrace } from "../../starter/src/app";

let originalMarking: Marking;

let graph: DCRGraph;

export const startSimulator = (elementReg: any) => {
    initGraph(elementReg);
}

export const executeEvent  = (eventElement: any) => {
    const event: Event = eventElement.id;
    var eventName: String = eventElement.businessObject.description;
    if (eventName == null || eventName === "") {
        eventName = "Unnamed event";
    }

    let group: DCRGraph | SubProcess | null = findElementGroup(event, graph);
    if (!group) {
        appendSimulationLog("Event not found in graph");
        return;
    }

    switch(isEnabled(event, graph, group)) {
        case 0:
            break;
        case 1:
            appendSimulationLog(eventName + " is not included");
            return;
        case 2:
            appendSimulationLog("Parent of " + eventName + " is not enabled");
            return;
        case 3:
            appendSimulationLog(eventName + " is missing a condition");
            return;
        case 4:
            appendSimulationLog(eventName + " is missing a milestone");
            return;
    }
    execute(event, graph, group);
    logExcecution(eventElement);
    addToTrace(eventElement);
}

const findElementGroup = (event: Event, group: DCRGraph | SubProcess): DCRGraph | SubProcess | null => {
    if (group.events.has(event)) return group;
    
    let childGroup: DCRGraph | SubProcess | null = null;
    
    group.subProcesses.forEach((subProcess: SubProcess) => {
        let ret = findElementGroup(event, subProcess);
        if (ret) childGroup = ret;
    });

    return childGroup;
}

const initGraph = (elementReg: any) => {
    graph = clearGraph(graph);

    const relationElements = elementReg.filter((element: any) => element.type === 'dcr:Relation');

    const root = elementReg.get('dcrGraph');
    const eventElements = root.children.filter((element: any) => element.type === 'dcr:Event');
    const nestingElements = root.children.filter((element: any) => element.type === 'dcr:Nesting');
    const subProcessElements = root.children.filter((element: any) => element.type === 'dcr:SubProcess');

    // Add events to the graph
    addEvents(graph, eventElements);
    addEvents(graph, subProcessElements);

    // Add subprocesses to the graph
    addSubProcesses(graph, subProcessElements);

    // Add events from nested elements to the graph
    addNestings(graph, nestingElements);

    // Save the original marking
    originalMarking = copyMarking(graph.marking);

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
}

const addSubProcesses = (parent: DCRGraph | SubProcess, elements: Set<any>) => {
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
        addEvents(subProcess, eventElements);
        addEvents(subProcess, subProcessElements);

        // Add subprocesses to the graph
        addSubProcesses(subProcess, subProcessElements);

        // Add events from nested elements to the graph
        addNestings(subProcess, nestingElements);

        // Add subprocess to parent graph
        parent.subProcesses.add(subProcess);
    });
}

const addNestings = (parent: DCRGraph | SubProcess, elements: Set<any>) => {
    elements.forEach((element: any) => {
        const eventElements = element.children.filter((element: any) => element.type === 'dcr:Event');
        const nestingElements = element.children.filter((element: any) => element.type === 'dcr:Nesting');
        const subProcessElements = element.children.filter((element: any) => element.type === 'dcr:SubProcess');
        addEvents(parent, eventElements);
        addEvents(parent, subProcessElements);
        addNestings(parent, nestingElements);
        addSubProcesses(parent, subProcessElements);
    });
}

const addEvents = (parent: DCRGraph | SubProcess, elements: Set<any>) => {
    elements.forEach((element: any) => {
        // Add event to subprocess
        parent.events.add(element.id);

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
    update(modeling, modeler.get('elementRegistry'), graph);
}

// Update the visual representation of the graph with the new states/markings
const update = (modeling: any, elementReg: any, group: DCRGraph | SubProcess) => {
    group.events.forEach((event: any) => {
        let element = elementReg.get(event);
        modeling.updateProperties(element, {executed: graph.marking.executed.has(event)});
        modeling.updateProperties(element, {included: graph.marking.included.has(event)});
        modeling.updateProperties(element, {pending: graph.marking.pending.has(event)});
        if (event.includes('Event')) {
            modeling.updateProperties(element, {enabled: isEnabled(event, graph, group) === 0});
        }
    });
    group.subProcesses.forEach((subProcess: any) => {
        update(modeling, elementReg, subProcess);
    });
}

// Restore original marking for events and sub processes
export const restoreMarkings = () => {
    graph.marking = copyMarking(originalMarking);
}

function logExcecution(event: any) {
    var eventName: String = event.businessObject.description;
    if (eventName == null || eventName === "") {
        appendSimulationLog("Executed Unnamed event");
    } else {
        appendSimulationLog("Executed  "+ eventName);
    }
}

function addToTrace(event: any) {
    var eventName: String = event.businessObject.description;
    if (eventName == null || eventName === "") {
        eventName = "Unnamed event";
    }
    addToSimulationTrace(eventName);
}