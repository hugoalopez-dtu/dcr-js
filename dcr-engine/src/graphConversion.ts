import type { EventMap, SubProcess, DCRGraphS } from "./types";
import { isSubProcess } from "./types";
import { parseDurationMs } from "./utility";

let useDescriptionsGlobal = false;

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
  const eventElements = recFilter(
    root,
    (element: any) => element.type === "dcr:Event"
  );
  const nestingElements = recFilter(
    root,
    (element: any) => element.type === "dcr:Nesting"
  );
  const subProcessElements = recFilter(
    root,
    (element: any) => element.type === "dcr:SubProcess"
  );

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
    const source: string = useDescriptionsGlobal
      ? element.businessObject.get("sourceRef").description
      : element.businessObject.get("sourceRef").id;
    const target: string = useDescriptionsGlobal
      ? element.businessObject.get("targetRef").description
      : element.businessObject.get("targetRef").id;
    const relType = element.businessObject.get("type");
    switch (relType) {
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

    const pairs = resolveNestedPairs(nestingElements, source, target);

    const guard = element.businessObject.get("guard");
    if (guard) {
      if (!graph.guardMap) graph.guardMap = {};
      const guardMap = graph.guardMap;
      pairs.forEach(([s, t]) => {
        if (!guardMap[s]) guardMap[s] = {};
        if (!guardMap[s][t]) guardMap[s][t] = {};
        guardMap[s][t][relType] = guard;
      });
    }

    const time = element.businessObject.get("time");
    if (time && (relType === "condition" || relType === "response")) {
      const ms = parseDurationMs(time);
      if (ms > 0) {
        if (!graph.timeConstraintMap) graph.timeConstraintMap = {};
        const timeConstraintMap = graph.timeConstraintMap;
        pairs.forEach(([s, t]) => {
          if (!timeConstraintMap[s]) timeConstraintMap[s] = {};
          if (!timeConstraintMap[s][t]) timeConstraintMap[s][t] = {};
          if (relType === "condition") {
            const existing = timeConstraintMap[s][t].delay;
            timeConstraintMap[s][t].delay = existing !== undefined ? Math.max(existing, ms) : ms;
          }
          if (relType === "response") {
            const existing = timeConstraintMap[s][t].deadline;
            timeConstraintMap[s][t].deadline = existing !== undefined ? Math.min(existing, ms) : ms;
          }
        });
      }
    }
  });

  return graph;
}

function addSubProcesses(
  graph: DCRGraphS,
  parent: DCRGraphS | SubProcess,
  elements: Array<any>
) {
  elements.forEach((element: any) => {
    const elementId = useDescriptionsGlobal ? element.description : element.id;
    const subProcess: SubProcess = {
      id: elementId,
      parent: parent,
      events: new Set(),
    };

    // Find events, subprocesses and nestings
    const eventElements = element.children.filter(
      (element: any) => element.type === "dcr:Event"
    );
    const subProcessElements = element.children.filter(
      (element: any) => element.type === "dcr:SubProcess"
    );
    const nestingElements = element.children.filter(
      (element: any) => element.type === "dcr:Nesting"
    );

    // Add events to the graph
    addEvents(graph, subProcess, eventElements);
    addEvents(graph, subProcess, subProcessElements);

    // Add subprocesses to the graph
    addSubProcesses(graph, subProcess, subProcessElements);

    // Add events from nested elements to the graph
    addNestings(graph, subProcess, nestingElements);

    // Add subprocess to parent graph
    graph.subProcesses[elementId] = subProcess;

    let label = element.businessObject.get("description");
    if (!label) label = "";
    graph.labelMap[elementId] = label;
    if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
    graph.labelMapInv[label].add(elementId);
  });
}

function addNestings(
  graph: DCRGraphS,
  parent: DCRGraphS | SubProcess,
  elements: Array<any>
) {
  elements.forEach((element: any) => {
    const eventElements = element.children.filter(
      (element: any) => element.type === "dcr:Event"
    );
    const nestingElements = element.children.filter(
      (element: any) => element.type === "dcr:Nesting"
    );
    const subProcessElements = element.children.filter(
      (element: any) => element.type === "dcr:SubProcess"
    );
    addEvents(graph, parent, eventElements);
    addEvents(graph, parent, subProcessElements);
    addNestings(graph, parent, nestingElements);
    addSubProcesses(graph, parent, subProcessElements);
  });
}

function addEvents(
  graph: DCRGraphS,
  parent: DCRGraphS | SubProcess,
  elements: Array<any>
) {
  elements.forEach((element: any) => {
    // Add event to subprocess
    const label = element.businessObject.get("description");
    const eventId = useDescriptionsGlobal ? label : element.id;
    let role = element.businessObject.get("role");
    if (!role) role = "";
    parent.events.add(eventId);
    graph.labels.add(label);
    graph.labelMap[eventId] = label;
    if (!graph.labelMapInv[label]) graph.labelMapInv[label] = new Set();
    graph.roles.add(role);
    graph.roleMap[eventId] = role;
    graph.labelMapInv[label].add(eventId);
    if (isSubProcess(parent)) graph.subProcessMap[eventId] = parent;

    // Add marking for event in graph
    if (element.businessObject.get("pending")) {
      graph.marking.pending.set(eventId, undefined);
    }
    if (element.businessObject.get("executed")) {
      graph.marking.executed.set(eventId, {});
    }
    if (element.businessObject.get("included")) {
      graph.marking.included.add(eventId);
    }

    // Extract default variable value
    const ed = element.businessObject.get("eventData");
    if (ed && ed.name && ed['default'] !== undefined && ed['default'] !== '') {
      if (!graph.initialVariableStore) graph.initialVariableStore = {};
      const val = ed.type === 'Int' ? Number(ed['default'])
                : ed.type === 'Bool' ? ed['default'] === 'true'
                : ed['default'];
      graph.initialVariableStore[ed.name] = val;
    }

    // Initialize relations for event in graph
    graph.conditionsFor[eventId] = new Set();
    graph.milestonesFor[eventId] = new Set();
    graph.responseTo[eventId] = new Set();
    graph.includesTo[eventId] = new Set();
    graph.excludesTo[eventId] = new Set();
  });
}

function addRelation(
  relationSet: EventMap,
  nestings: Array<any>,
  source: string,
  target: string
) {
  // Handle Nesting groupings by adding relations for all nested elements
  if (
    nestings.find(
      (element) =>
        (useDescriptionsGlobal
          ? element.businessObject.description
          : element.businessObject.id) === source
    )
  ) {
    nestings.forEach((element: any) => {
      const elementId = useDescriptionsGlobal
        ? element.businessObject.description
        : element.businessObject.id;
      if (elementId === source) {
        element.children.forEach((nestedElement: any) => {
          const nestedElementId = useDescriptionsGlobal
            ? nestedElement.businessObject.description
            : nestedElement.businessObject.id;
          if (
            nestedElement.type === "dcr:SubProcess" ||
            nestedElement.type === "dcr:Event" ||
            nestedElement.type === "dcr:Nesting"
          ) {
            addRelation(relationSet, nestings, nestedElementId, target);
          }
        });
      }
    });
  } else if (
    nestings.find(
      (element) =>
        (useDescriptionsGlobal
          ? element.businessObject.description
          : element.businessObject.id) === target
    )
  ) {
    nestings.forEach((element: any) => {
      const elementId = useDescriptionsGlobal
        ? element.businessObject.description
        : element.businessObject.id;
      if (elementId === target) {
        element.children.forEach((nestedElement: any) => {
          const nestedElementId = useDescriptionsGlobal
            ? nestedElement.businessObject.description
            : nestedElement.businessObject.id;
          if (
            nestedElement.type === "dcr:SubProcess" ||
            nestedElement.type === "dcr:Event" ||
            nestedElement.type === "dcr:Nesting"
          ) {
            addRelation(relationSet, nestings, source, nestedElementId);
          }
        });
      }
    });
  } else {
    // Add direct relation if neither source nor target is a Nesting group
    relationSet[source].add(target);
  }
}

function resolveNestedPairs(
  nestings: Array<any>,
  source: string,
  target: string
): Array<[string, string]> {
  // Handle Nesting groupings by resolving pairs for all nested elements
  if (
    nestings.find(
      (element) =>
        (useDescriptionsGlobal
          ? element.businessObject.description
          : element.businessObject.id) === source
    )
  ) {
    const pairs: Array<[string, string]> = [];
    nestings.forEach((element: any) => {
      const elementId = useDescriptionsGlobal
        ? element.businessObject.description
        : element.businessObject.id;
      if (elementId === source) {
        element.children.forEach((nestedElement: any) => {
          const nestedElementId = useDescriptionsGlobal
            ? nestedElement.businessObject.description
            : nestedElement.businessObject.id;
          if (
            nestedElement.type === "dcr:SubProcess" ||
            nestedElement.type === "dcr:Event" ||
            nestedElement.type === "dcr:Nesting"
          ) {
            pairs.push(...resolveNestedPairs(nestings, nestedElementId, target));
          }
        });
      }
    });
    return pairs;
  } else if (
    nestings.find(
      (element) =>
        (useDescriptionsGlobal
          ? element.businessObject.description
          : element.businessObject.id) === target
    )
  ) {
    const pairs: Array<[string, string]> = [];
    nestings.forEach((element: any) => {
      const elementId = useDescriptionsGlobal
        ? element.businessObject.description
        : element.businessObject.id;
      if (elementId === target) {
        element.children.forEach((nestedElement: any) => {
          const nestedElementId = useDescriptionsGlobal
            ? nestedElement.businessObject.description
            : nestedElement.businessObject.id;
          if (
            nestedElement.type === "dcr:SubProcess" ||
            nestedElement.type === "dcr:Event" ||
            nestedElement.type === "dcr:Nesting"
          ) {
            pairs.push(...resolveNestedPairs(nestings, source, nestedElementId));
          }
        });
      }
    });
    return pairs;
  } else {
    // Both ends are real events
    return [[source, target]];
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
    conditionsFor: {},
    milestonesFor: {},
    responseTo: {},
    includesTo: {},
    excludesTo: {},
    marking: {
      executed: new Map(),
      included: new Set(),
      pending: new Map(),
    },
  };
}
