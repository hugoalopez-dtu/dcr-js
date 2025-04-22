// -----------------------------------------------------------
// -------------------- Extended Set Type --------------------
// -----------------------------------------------------------

declare global {
  interface Set<T> {
    union(b: Set<T>): Set<T>;
    intersect(b: Set<T>): Set<T>;
    difference(b: Set<T>): Set<T>;
  }
}

// -----------------------------------------------------------
// --------------------- DCR Graph Types ---------------------
// -----------------------------------------------------------

export type Event = string;
export type Label = string;
export type Role = string;

export type RelationType = "condition" | "response" | "include" | "exclude" | "milestone";

export interface Marking {
  executed: Set<Event>;
  included: Set<Event>;
  pending: Set<Event>;
}

export type Nestings = { nestingIds: Set<string>, nestingRelations: { [event: Event]: string } };

// Map from event to a set of events
// Used to denote different relations between events
export interface EventMap {
  [startEventId: string]: Set<Event>;
}

export interface FuzzyRelation {
  [startEvent: string]: {
    [endEvent: string]: number;
  };
}

export interface DCRGraph {
  events: Set<Event>;
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export interface DCRGraphS {
  events: Set<Event>;
  labels: Set<Label>;
  labelMap: { [event: Event]: Label };
  labelMapInv: { [label: Label]: Set<Event> };
  subProcesses: {
    [id: string]: SubProcess;
  };
  subProcessMap: {
    [event: Event]: SubProcess;
  };
  roles: Set<Role>;
  roleMap: { [event: Event]: Role };
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export interface SubProcess {
  id: string;
  parent: SubProcess | DCRGraphS;
  events: Set<Event>;
}

export const isSubProcess = (obj: unknown): obj is SubProcess => {
  return (obj as SubProcess).parent !== undefined;
}

export type Trace = Array<Event>;
export type RoleTrace = Array<{ activity: Label, role: Role }>

export interface EventLog<T extends RoleTrace | Trace> {
  events: Set<Event>;
  traces: {
    [traceId: string]: T;
  }
}

export interface XMLEvent {
  string: [{
    "@key": "concept:name";
    "@value": string;
  }, {
    "@key": "role";
    "@value": string;
  }];

}

export interface XMLTrace {
  string: {
    "@key": "concept:name";
    "@value": string;
  };
  boolean: {
    "@key": "pdc:isPos";
    "@value": boolean;
  };
  event: Array<XMLEvent>;
}

export interface XMLLog {
  log: {
    "@xes.version": "1.0";
    "@xes.features": "nested-attributes";
    "@openxes.version": "1.0RC7";
    global: {
      "@scope": "event";
      string: [{
        "@key": "concept:name";
        "@value": "__INVALID__";
      }, {
        "@key": "role";
        "@value": "__INVALID__";
      }];
    };
    classifier: {
      "@name": "Event Name";
      "@keys": "concept:name";
    };
    trace: Array<XMLTrace>;
  };
}

// Abstraction of the log used for mining
export interface LogAbstraction {
  events: Set<Event>;
  traces: {
    [traceId: string]: Trace;
  };
  chainPrecedenceFor: EventMap;
  precedenceFor: EventMap;
  responseTo: EventMap;
  predecessor: EventMap;
  successor: EventMap;
  atMostOnce: Set<Event>;
  nonCoExisters?: EventMap;
  precedesButNeverSuceeds?: EventMap;
}
