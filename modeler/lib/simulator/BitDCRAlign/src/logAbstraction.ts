import { EventLog, Event, Trace } from "../types";
import { BitEventMap, BitLogAbstraction, BitSet } from "../bitTypes";


export const bitAbstractLog = (log: EventLog): BitLogAbstraction => {
  const events = new BitSet({ startingElems: log.events, allElems: log.events });

  const emptySet = events.copy();
  emptySet.clear();

  const logAbstraction: BitLogAbstraction = {
    events,
    traces: { ...log.traces },
    // At first we assume all events will be seen at least once
    // Once we see them twice in a trace, they are removed from atMostOnce
    atMostOnce: events.copy(),
    chainPrecedenceFor: {},
    precedenceFor: {},
    predecessor: {},
    responseTo: {},
    successor: {},
  };
  // Initialize all EventMaps in the Log Abstraction.
  // Predecessor and successor sets start empty,
  // while the rest are initialized to be all events besides itself
  for (const event of log.events) {
    logAbstraction.chainPrecedenceFor[event] = events.copy();
    logAbstraction.chainPrecedenceFor[event].deleteString(event);
    logAbstraction.precedenceFor[event] = events.copy();
    logAbstraction.precedenceFor[event].deleteString(event);
    logAbstraction.responseTo[event] = events.copy();
    logAbstraction.responseTo[event].deleteString(event);
    logAbstraction.predecessor[event] = emptySet.copy();
    logAbstraction.successor[event] = emptySet.copy();
  }

  const parseTrace = (trace: Trace) => {
    const localAtLeastOnce = emptySet.copy();
    const localSeenOnlyBefore: BitEventMap = {};
    let lastEvent: bigint = 0n;
    for (const event of trace) {
      const maskedEvent = events.map[event];
      // All events seen before this one must be predecessors
      logAbstraction.predecessor[event].union(localAtLeastOnce);
      // If event seen before in trace, remove from atMostOnce
      if (localAtLeastOnce.has(maskedEvent)) {
        logAbstraction.atMostOnce.delete(maskedEvent);
      }
      localAtLeastOnce.add(maskedEvent);
      // Precedence for (event): All events that occured
      // before (event) are kept in the precedenceFor set
      logAbstraction.precedenceFor[event].intersect(localAtLeastOnce);
      // Chain-Precedence for (event): Some event must occur
      // immediately before (event) in all traces
      if (lastEvent !== 0n) {
        // If first time this clause is encountered - leaves lastEvent in chain-precedence set.
        // The intersect is empty if this clause is encountered again with another lastEvent.
        logAbstraction.chainPrecedenceFor[event].set = logAbstraction.chainPrecedenceFor[event].set & lastEvent;
      } else {
        // First event in a trace, and chainPrecedence is therefore not possible
        logAbstraction.chainPrecedenceFor[event] = emptySet.copy();
      }
      // To later compute responses we note which events were seen
      // before (event) and not after
      if (logAbstraction.responseTo[event].set !== 0n) {
        // Save all events seen before (event)
        localSeenOnlyBefore[event] = localAtLeastOnce.copy();
      }
      // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
      for (const key in localSeenOnlyBefore) {
        localSeenOnlyBefore[key].delete(maskedEvent);
      }
      lastEvent = maskedEvent;
    }
    for (const event in localSeenOnlyBefore) {
      const maskedEvent = events.map[event];
      // Compute set of events in trace that happened after (event)
      const seenOnlyAfter = localAtLeastOnce.copy().difference(
        localSeenOnlyBefore[event],
      );
      // Delete self-relation
      seenOnlyAfter.delete(maskedEvent);
      // Set of events that always happens after (event)
      logAbstraction.responseTo[event].intersect(seenOnlyAfter);
    }
  };

  for (const traceId in log.traces) {
    const trace = log.traces[traceId];
    parseTrace(trace);
  }


  // BETTER WAY OF DOING THIS BITWISE??
  // Compute successor set based on duality with predecessor set
  for (const i in logAbstraction.predecessor) {
    for (const j of logAbstraction.predecessor[i]) {
      logAbstraction.successor[j].addString(i);
    }
  }

  return logAbstraction;
};