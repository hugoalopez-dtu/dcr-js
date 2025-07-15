import type { DCRGraph, EventMap, Marking, Event, Traces } from "./types";

export const avg = (arr: Array<number>): number => arr.reduce((partialSum, a) => partialSum + a, 0) / arr.length;

export const getRandomInt = (min: number, max: number): number => {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

export const getRandomItem = <T>(set: Set<T>) => {
  let items = Array.from(set);
  return items[Math.floor(Math.random() * items.length)];
}

export const randomChoice = () => {
  return Math.random() < 0.5;
}

// Makes deep copy of a eventMap
export const copyEventMap = (eventMap: EventMap): EventMap => {
  const copy: EventMap = {};
  for (const startEvent in eventMap) {
    copy[startEvent] = new Set(eventMap[startEvent]);
  }
  return copy;
};

export const copySet = <T>(set: Set<T>): Set<T> => {
  return new Set(set);
};

export const copyMarking = (marking: Marking): Marking => {
  return {
    executed: copySet(marking.executed),
    included: copySet(marking.included),
    pending: copySet(marking.pending),
  };
};

export const reverseRelation = (relation: EventMap): EventMap => {
  const retRelation: EventMap = {};
  for (const e in relation) {
    retRelation[e] = new Set();
  }
  for (const e in relation) {
    for (const j of relation[e]) {
      retRelation[j].add(e);
    }
  }
  return retRelation;
};

export const relationCount = (model: DCRGraph) => {
  let count = 0;
  const relCount = (rel: EventMap) => {
    for (const e in rel) {
      for (const _ of rel[e]) {
        count += 1;
      }
    }
  };
  relCount(model.conditionsFor);
  relCount(model.excludesTo);
  relCount(model.includesTo);
  relCount(model.responseTo);
  relCount(model.milestonesFor);
  return count;
};

export const fullRelation = (events: Set<Event>): EventMap => {
  const retrel: EventMap = {};
  for (const event of events) {
    retrel[event] = copySet(events);
    retrel[event].delete(event);
  }
  return retrel
}

export const flipEventMap = (em: EventMap): EventMap => {
  const retval: EventMap = {};
  for (const event of Object.keys(em)) {
    retval[event] = new Set();
  }
  for (const e1 in em) {
    for (const e2 of em[e1]) {
      if (!retval[e2]) retval[e2] = new Set();
      retval[e2].add(e1);
    }
  }
  return retval;
}


export const intersect = <T>(s1: Set<T>, s2: Set<T>): Set<T> => {
  const retset = new Set<T>();
  const { smallestSet, otherSet } = s1.size > s2.size ? { smallestSet: s2, otherSet: s1 } : { smallestSet: s1, otherSet: s2 };
  for (const elem of smallestSet) {
    if (otherSet.has(elem)) retset.add(elem);
  }
  return retset;
}

// Allows sets to be serialized by converting them to arrays
function set2JSON(_: any, value: any) {
  if (typeof value === "object" && value instanceof Set) {
    return [...value];
  }
  return value;
}
// Parses arrays back to sets
function JSON2Set(key: any, value: any) {
  if (typeof value === "object" && value instanceof Array && key !== "trace") {
    return new Set(value);
  }
  return value;
}

export const writeSerialized = <T>(obj: T): string => {
  return JSON.stringify(obj, set2JSON, 4);
};

export const parseSerialized = <T>(data: string): T => {
  const obj = JSON.parse(data, JSON2Set);
  return obj;
};

export const copyTraces = (traces: Traces): Traces => {
  const copy: Traces = {};
  for (const traceId in traces) {
    copy[traceId] = [...traces[traceId]];
  }
  return copy;
};

export const copyGraph = (graph: DCRGraph): DCRGraph => {
  return {
    conditionsFor: copyEventMap(graph.conditionsFor),
    events: copySet(graph.events),
    excludesTo: copyEventMap(graph.excludesTo),
    includesTo: copyEventMap(graph.includesTo),
    marking: copyMarking(graph.marking),
    milestonesFor: copyEventMap(graph.milestonesFor),
    responseTo: copyEventMap(graph.responseTo),
  };
};

export const makeEmptyGraph = (events: Set<string>) => {
  const graph: DCRGraph = {
    events: copySet(events),
    conditionsFor: {},
    excludesTo: {},
    includesTo: {},
    milestonesFor: {},
    responseTo: {},
    marking: {
      executed: new Set<Event>(),
      pending: new Set<Event>(),
      included: copySet(events),
    },
  };
  for (const event of events) {
    graph.conditionsFor[event] = new Set();
    graph.responseTo[event] = new Set();
    graph.excludesTo[event] = new Set();
    graph.includesTo[event] = new Set();
    graph.milestonesFor[event] = new Set();
  }
  return graph;
};

export const makeFullGraph = (events: Set<string>) => {
  const graph: DCRGraph = {
    events: copySet(events),
    conditionsFor: {},
    excludesTo: {},
    includesTo: {},
    milestonesFor: {},
    responseTo: {},
    marking: {
      executed: new Set<Event>(),
      pending: new Set<Event>(),
      included: copySet(events),
    },
  };
  for (const e of events) {
    graph.conditionsFor[e] = new Set();
    graph.responseTo[e] = new Set();
    graph.excludesTo[e] = new Set();
    graph.includesTo[e] = new Set();
    //graph.excludesTo[e].add(e);
    for (const j of events) {
      if (e !== j) {
        graph.conditionsFor[e].add(j);
        graph.responseTo[e].add(j);
        //graph.includesTo[e].add(j);
      }
      graph.excludesTo[e].add(j);
    }
  }
  return graph;
};

export class StopWatch {
  prevTime: number;

  constructor() {
    this.prevTime = Date.now();
  }

  reset() {
    this.prevTime = Date.now();
  }

  click() {
    const now = Date.now();
    console.log(`Took ${now - this.prevTime}ms`);
    this.prevTime = now;
  }
}