import { Label, Trace, Event } from "./types";

export class BitSet {
  size: number;
  set: bigint;
  map: { [elem: string]: bigint }


  constructor(params: { allElems: Set<string>, startingElems: Set<string> } | { size: number, set: bigint, map: { [elem: string]: bigint } }
  ) {
    const realParams = params as any;
    if (realParams?.size) {
      this.size = realParams.size;
      this.set = realParams.set;
      this.map = realParams.map;
    } else {
      this.size = realParams.allElems.size;
      this.map = {};
      this.set = 0n;
      let mask = 1n;
      for (const elem of realParams.allElems) {
        this.map[elem] = mask;
        if (realParams.startingElems.has(elem)) {
          this.set = this.set | mask
        }
        mask = mask << 1n;
      }
    }
  }

  *[Symbol.iterator]() {
    for (const elem in this.map) {
      if (this.has(this.map[elem])) {
        yield elem;
      }
    }
  }

  clear() {
    this.set = 0n
    return this;
  }

  copy(): BitSet {
    return new BitSet({ size: this.size, set: this.set, map: this.map });
  }

  print() {
    console.log(this.set.toString(2));
  }

  isEmpty(): boolean {
    return this.set === 0n;
  }

  has(elem: bigint): boolean {
    return !!(elem & this.set);
  }

  hasString(elem: string): boolean {
    const mask = this.map[elem];
    if (mask === undefined) throw new Error("Unknown elem: " + elem);
    return !!(mask & this.set);
  }

  compliment() {
    this.set = ~this.set;
    return this;
  }

  add(elem: bigint) {
    this.set = this.set | elem;
    return this;
  }

  addString(elem: string) {
    try {
      const mask = this.map[elem];
      this.set = this.set | mask;
      return this;
    } catch (e) {
      console.log(elem, this.map[elem]);
      console.log(Object.keys(this.map))
      throw e;
    }
  }

  delete(elem: bigint) {
    this.set = this.set & ~(elem);
    return this;
  }

  deleteString(elem: string) {
    const mask = this.map[elem];
    this.set = this.set & (~mask);
    return this;
  }

  union(otherSet: BitSet) {
    this.set = this.set | otherSet.set;
    return this;
  }

  intersect(otherSet: BitSet) {
    this.set = this.set & otherSet.set;
    return this;
  }

  difference(otherSet: BitSet) {
    this.set = this.set & (~otherSet.set)
    return this;
  }
}

export interface BitMarking {
  executed: BitSet;
  included: BitSet;
  pending: BitSet;
}

// Map from event to a set of events
// Used to denote different relations between events
export interface BitEventMap {
  [startEventId: string]: BitSet;
}

export interface BitDCRGraph {
  events: BitSet;
  conditionsFor: BitEventMap;
  milestonesFor: BitEventMap;
  responseTo: BitEventMap;
  includesTo: BitEventMap;
  excludesTo: BitEventMap;
  marking: BitMarking;
}

export type LabelMap = { [e: Event]: Label };
export type LabelMapInv = { [l: Label]: Set<Event> };

export interface BitLabelling {
  labels: Set<Label>;
  labelMap: LabelMap;
  labelMapInv: LabelMapInv;
}

export interface BitOptimizations {
  conditions: BitSet;
  includesFor: BitEventMap;
  excludesFor: BitEventMap;
}

export type BitLabelDCR = BitDCRGraph & BitLabelling;

export type BitLabelDCRPP = BitDCRGraph & BitLabelling & BitOptimizations;

export type BitDCRGraphPP = BitDCRGraph & BitOptimizations;

// Abstraction of the log used for mining
export interface BitLogAbstraction {
  events: BitSet;
  traces: {
    [traceId: string]: Trace;
  };
  chainPrecedenceFor: BitEventMap;
  precedenceFor: BitEventMap;
  responseTo: BitEventMap;
  predecessor: BitEventMap;
  successor: BitEventMap;
  atMostOnce: BitSet;
}