import type { DCRGraph, EventMap, Marking, Event } from "./types";

export const avg = (arr: Array<number>): number => arr.reduce((partialSum, a) => partialSum + a, 0) / arr.length;

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