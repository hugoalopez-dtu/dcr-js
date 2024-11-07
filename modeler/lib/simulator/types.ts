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