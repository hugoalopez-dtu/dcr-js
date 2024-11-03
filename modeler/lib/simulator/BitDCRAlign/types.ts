
// -----------------------------------------------------------
// ------------------------ Alignment ------------------------
// -----------------------------------------------------------

export type AlignAction = "consume" | "model-skip" | "trace-skip";

export type CostFun = (action: AlignAction, target: Event) => number;

export type Alignment = { cost: number; trace: Trace };

export type Test = {
  polarity: "+" | "-",
  trace: Trace,
  context: Set<Event>
}

// -----------------------------------------------------------
// --------------------- DCR Graph Types ---------------------
// -----------------------------------------------------------

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
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export type LabelMap = { [e: Event]: Label };
export type LabelMapInv = { [l: Label]: Set<Event> };

export interface Labelling {
  labels: Set<Label>;
  labelMap: LabelMap;
  labelMapInv: LabelMapInv;
}

export interface Optimizations {
  conditions: Set<Event>;
  includesFor: EventMap;
  excludesFor: EventMap;
}

export type LabelDCR = DCRGraph & Labelling;

export type LabelDCRPP = DCRGraph & Labelling & Optimizations;

export type DCRGraphPP = DCRGraph & Optimizations;

// -----------------------------------------------------------
// ------------------------ Log Types ------------------------
// -----------------------------------------------------------

export type Trace = Array<Event>;

type Traces = { [traceId: string]: Trace };

export interface EventLog {
  events: Set<Event>;
  traces: Traces;
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
}