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

export type Id = string;
export type Event = string;
export type Label = string;

export interface Marking {
  executed: Set<Event>;
  included: Set<Event>;
  pending: Set<Event>;
}

// Map from event to a set of events
// Used to denote different relations between events
export interface EventMap {
  [startEventId: string]: Set<Event>;
}

export interface DCRGraph {
  events: Set<Event>;
  labels: Set<Label>;
  labelMap: { [event: Event]: Label };
  labelMapInv: { [label: Label]: Set<Event> };
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
  subProcesses: Set<SubProcess>;
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export interface SubProcess {
  id: Id;
  parent: SubProcess | DCRGraphS;
  events: Set<Event>;
  subProcesses: Set<SubProcess>;
}

export const isSubProcess = (obj: unknown): obj is SubProcess => {
  return (obj as SubProcess).parent !== undefined;
}

export type Trace = Array<Event>;

export type Traces = { [traceId: string]: Trace };

export interface EventLog {
  events: Set<Event>;
  traces: Traces;
}

export interface XMLEvent {
  string: {
    "@key": "concept:name";
    "@value": string;
  };
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
      string: {
        "@key": "concept:name";
        "@value": "__INVALID__";
      };
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
