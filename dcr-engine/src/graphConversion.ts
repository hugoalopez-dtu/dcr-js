import type { EventMap, SubProcess, DCRGraphS } from "./types";
import { isSubProcess } from "./types";
import { XMLParser } from "fast-xml-parser";

let useDescriptionsGlobal = false;

/**
 * OPTION 1: For the UI (Modeler)
 * This function handles "Moddle" objects from the BPMN-js/DCR-js library.
 */
export function moddleToDCR(
  elementReg: any,
  useDescriptions?: boolean
): DCRGraphS {
  useDescriptionsGlobal = !!useDescriptions;
  const graph = emptyGraph();

  const relationElements = elementReg.filter(
    (element: any) => element.type === "dcr:Relation"
  );

  const recFilter = (
    element: any,
    filterFun: (element: any) => boolean
  ): Array<any> => {
    const retval = [];
    if (filterFun(element)) retval.push(element);
    return element.children
      ? retval.concat(
          element.children.flatMap((element: any) =>
            recFilter(element, filterFun)
          )
        )
      : retval;
  };

  const root = elementReg.get("dcrGraph");
  if (!root) return graph;

  const eventElements = recFilter(root, (el: any) => el.type === "dcr:Event");
  const nestingElements = recFilter(root, (el: any) => el.type === "dcr:Nesting");
  const subProcessElements = recFilter(root, (el: any) => el.type === "dcr:SubProcess");

  addEvents(graph, graph, eventElements);
  addEvents(graph, graph, subProcessElements);
  addSubProcesses(graph, graph, subProcessElements);
  addNestings(graph, graph, nestingElements);

  relationElements.forEach((element: any) => {
    const source: string = useDescriptionsGlobal
      ? element.businessObject.get("sourceRef").description
      : element.businessObject.get("sourceRef").id;
    const target: string = useDescriptionsGlobal
      ? element.businessObject.get("targetRef").description
      : element.businessObject.get("targetRef").id;

    switch (element.businessObject.get("type")) {
      case "condition":
        addRelation(graph.conditionsFor, nestingElements, target, source);
        break;
      case "milestone":
        addRelation(graph.milestonesFor, nestingElements, target, source);
        break;
      case "response":
        addRelation(graph.responseTo, nestingElements, source, target);
        break;
      case "include":
        addRelation(graph.includesTo, nestingElements, source, target);
        break;
      case "exclude":
        addRelation(graph.excludesTo, nestingElements, source, target);
        break;
    }
  });

  return graph;
}

/**
 * OPTION 2: For your Environment (RL / Debug)
 * This function parses raw XML strings without depending on UI objects.
 */
export function xmlToDCR(xmlString: string): DCRGraphS {
    const graph = emptyGraph();
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "",
      parseAttributeValue: false 
    });
    
    const jsonObj = parser.parse(xmlString);
    const spec = jsonObj?.dcrgraph?.specification;
    
    if (!spec) return graph;
  
    // 1. Labels Mapping
    const labelMappings = spec.resources?.labelMappings?.labelMapping;
    const mappingArray = Array.isArray(labelMappings) ? labelMappings : [labelMappings];
    const labelLookup: Record<string, string> = {};
    mappingArray.forEach((m: any) => {
      if (m) labelLookup[String(m.eventId)] = String(m.labelId);
    });
  
    // 2. Events & Init Sets
    const rawEvents = spec.resources?.events?.event;
    const eventList = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
    eventList.forEach((e: any) => {
      const id = String(e.id);
      const label = labelLookup[id] || id;
      graph.events.add(id);
      graph.labels.add(label);
      graph.labelMap[id] = label;
      if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
      graph.labelMapInv[label].add(id);

      if (e.cost !== undefined && e.cost !== null && e.cost !== '') {
        const c = Number(e.cost);
        if (!isNaN(c)) graph.costMap[id] = c;
      }
      if (e.duration !== undefined && e.duration !== null && e.duration !== '') {
        const d = Number(e.duration);
        if (!isNaN(d)) graph.durationMap[id] = d;
      }

      graph.conditionsFor[id] = new Set();
      graph.milestonesFor[id] = new Set();
      graph.responseTo[id] = new Set();
      graph.includesTo[id] = new Set();
      graph.excludesTo[id] = new Set();
    });
  
    // 3. Global role multipliers: <roles><role name="Expert" costMultiplier="2.0" durationMultiplier="0.5"/></roles>
    const rawRoleMultipliers = spec.resources?.roles?.role;
    if (rawRoleMultipliers) {
      const roleList = Array.isArray(rawRoleMultipliers) ? rawRoleMultipliers : [rawRoleMultipliers];
      roleList.forEach((r: any) => {
        const name = String(r.name || r["@name"] || "");
        const cm = Number(r.costMultiplier ?? r["@costMultiplier"] ?? 1);
        const dm = Number(r.durationMultiplier ?? r["@durationMultiplier"] ?? 1);
        if (name) graph.roleMultipliers[name] = { costMultiplier: cm, durationMultiplier: dm };
      });
    }

    // 4. Constraints (The "Rules")
    const constraints = spec.constraints;
    if (constraints) {
      const parseRel = (relData: any, targetMap: Record<string, Set<string>>, reverse: boolean = false) => {
        if (!relData) return;
        const list = Array.isArray(relData) ? relData : [relData];
        list.forEach((r: any) => {
          const source = String(r.sourceId);
          const target = String(r.targetId);
          if (graph.events.has(source) && graph.events.has(target)) {
            // Conditions and Milestones are usually stored as "Target is conditioned by Source"
            if (reverse) targetMap[target].add(source);
            else targetMap[source].add(target);
          }
        });
      };
  
      parseRel(constraints.conditions?.condition, graph.conditionsFor, true);
      parseRel(constraints.responses?.response, graph.responseTo);
      parseRel(constraints.excludes?.exclude, graph.excludesTo);
      parseRel(constraints.includes?.include, graph.includesTo);
      parseRel(constraints.milestones?.milestone, graph.milestonesFor, true);
    }
  
    // 4. Initial Marking
    const marking = jsonObj.dcrgraph?.runtime?.marking;
    if (marking) {
      const fillSet = (data: any, set: Set<string>) => {
        if (!data) return;
        const items = Array.isArray(data.event) ? data.event : (data.event ? [data.event] : []);
        items.forEach((i: any) => set.add(String(i.id || i)));
      };
      fillSet(marking.executed, graph.marking.executed);
      fillSet(marking.pending, graph.marking.pending);
      fillSet(marking.included, graph.marking.included);
    }
  
    if (graph.marking.included.size === 0) {
      graph.events.forEach(id => graph.marking.included.add(id));
    }
  
    return graph;
  }

// --- HELPER FUNCTIONS ---

function addSubProcesses(graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Array<any>) {
  elements.forEach((element: any) => {
    const elementId = useDescriptionsGlobal ? element.description : element.id;
    const subProcess: SubProcess = { id: elementId, parent: parent, events: new Set() };

    const eventElements = element.children.filter((el: any) => el.type === "dcr:Event");
    const subProcessElements = element.children.filter((el: any) => el.type === "dcr:SubProcess");
    const nestingElements = element.children.filter((el: any) => el.type === "dcr:Nesting");

    addEvents(graph, subProcess, eventElements);
    addEvents(graph, subProcess, subProcessElements);
    addSubProcesses(graph, subProcess, subProcessElements);
    addNestings(graph, subProcess, nestingElements);

    graph.subProcesses[elementId] = subProcess;

    let label = element.businessObject.get("description") || "";
    graph.labelMap[elementId] = label;
    if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
    graph.labelMapInv[label].add(elementId);
  });
}

function addNestings(graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Array<any>) {
  elements.forEach((element: any) => {
    const eventElements = element.children.filter((el: any) => el.type === "dcr:Event");
    const nestingElements = element.children.filter((el: any) => el.type === "dcr:Nesting");
    const subProcessElements = element.children.filter((el: any) => el.type === "dcr:SubProcess");
    
    addEvents(graph, parent, eventElements);
    addEvents(graph, parent, subProcessElements);
    addNestings(graph, parent, nestingElements);
    addSubProcesses(graph, parent, subProcessElements);
  });
}

function addEvents(graph: DCRGraphS, parent: DCRGraphS | SubProcess, elements: Array<any>) {
  elements.forEach((element: any) => {
    const label = element.businessObject.get("description") || "";
    const eventId = useDescriptionsGlobal ? label : element.id;
    let role = element.businessObject.get("role") || "";

    parent.events.add(eventId);
    graph.labels.add(label);
    graph.labelMap[eventId] = label;
    if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
    graph.roles.add(role);
    graph.roleMap[eventId] = role;
    graph.labelMapInv[label].add(eventId);
    if (isSubProcess(parent)) graph.subProcessMap[eventId] = parent;

    if (element.businessObject.get("pending")) graph.marking.pending.add(eventId);
    if (element.businessObject.get("executed")) graph.marking.executed.add(eventId);
    if (element.businessObject.get("included")) graph.marking.included.add(eventId);

    const cost = element.businessObject.get("cost");
    const duration = element.businessObject.get("duration");
    if (cost !== undefined && cost !== null) graph.costMap[eventId] = Number(cost);
    if (duration !== undefined && duration !== null) graph.durationMap[eventId] = Number(duration);

    graph.conditionsFor[eventId] = new Set();
    graph.milestonesFor[eventId] = new Set();
    graph.responseTo[eventId] = new Set();
    graph.includesTo[eventId] = new Set();
    graph.excludesTo[eventId] = new Set();
  });
}

function addRelation(relationSet: EventMap, nestings: Array<any>, source: string, target: string) {
  const findInNestings = (id: string) => nestings.find(el => 
    (useDescriptionsGlobal ? el.businessObject.description : el.businessObject.id) === id
  );

  const sourceNesting = findInNestings(source);
  const targetNesting = findInNestings(target);

  if (sourceNesting) {
    sourceNesting.children.forEach((child: any) => {
      const childId = useDescriptionsGlobal ? child.businessObject.description : child.businessObject.id;
      if (["dcr:SubProcess", "dcr:Event", "dcr:Nesting"].includes(child.type)) {
        addRelation(relationSet, nestings, childId, target);
      }
    });
  } else if (targetNesting) {
    targetNesting.children.forEach((child: any) => {
      const childId = useDescriptionsGlobal ? child.businessObject.description : child.businessObject.id;
      if (["dcr:SubProcess", "dcr:Event", "dcr:Nesting"].includes(child.type)) {
        addRelation(relationSet, nestings, source, childId);
      }
    });
  } else {
    if (relationSet[source]) relationSet[source].add(target);
  }
}

function emptyGraph(): DCRGraphS {
  return {
    events: new Set(),
    labels: new Set(),
    labelMap: {},
    labelMapInv: {},
    roles: new Set(),
    roleMap: {},
    subProcesses: {},
    subProcessMap: {},
    costMap: {},
    durationMap: {},
    roleMultipliers: {},
    conditionsFor: {},
    milestonesFor: {},
    responseTo: {},
    includesTo: {},
    excludesTo: {},
    marking: { executed: new Set(), included: new Set(), pending: new Set() },
  };
}