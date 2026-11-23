import type { DCRGraph, Event, EventMap, RelationType, Role, Variable, VariableType } from "./types";

/**
 * A single edit to a DCR graph, expressed with event names.
 * Mirrors the operations of the modeler's `dcrGraphEditing` service, so a
 * list of edits can be applied to a rendered diagram one by one.
 */
export type GraphEdit =
  | {
      op: "addEvent";
      name: Event;
      role?: Role;
      included: boolean;
      pending: boolean;
      executed: boolean;
      variable?: { name: string; type: string };
      /** an event that already exists, to place the new one next to */
      near?: Event;
    }
  | { op: "removeEvent"; name: Event }
  | { op: "setRole"; name: Event; role?: Role }
  | { op: "setMarking"; name: Event; included: boolean; pending: boolean; executed: boolean }
  | { op: "setVariable"; name: Event; variable: { name: string; type: string } | null }
  | { op: "addRelation"; type: RelationType; source: Event; target: Event; guard?: string }
  | { op: "removeRelation"; type: RelationType; source: Event; target: Event }
  | { op: "changeRelationType"; source: Event; target: Event; from: RelationType; to: RelationType }
  | { op: "setGuard"; type: RelationType; source: Event; target: Event; guard?: string };

export interface GraphRelation {
  type: RelationType;
  source: Event;
  target: Event;
  guard?: string;
}

/** The optional parts of DataDCR / RoleDataDCR that the diff understands. */
type EditableGraph = DCRGraph & {
  expressions?: { [source: Event]: { [target: Event]: { text: string } } };
  data?: { [event: Event]: Variable<VariableType> };
  roleMap?: { [event: Event]: Role };
};

// conditionsFor / milestonesFor are keyed by target, the others by source.
const RELATION_MAPS: Array<[RelationType, keyof DCRGraph, "byTarget" | "bySource"]> = [
  ["condition", "conditionsFor", "byTarget"],
  ["milestone", "milestonesFor", "byTarget"],
  ["response", "responseTo", "bySource"],
  ["exclude", "excludesTo", "bySource"],
  ["include", "includesTo", "bySource"],
];

/** Flatten a graph's relation maps into (type, source, target, guard) records. */
export function relationsOf(graph: EditableGraph): GraphRelation[] {
  const out: GraphRelation[] = [];
  for (const [type, key, direction] of RELATION_MAPS) {
    const map = graph[key] as EventMap;
    for (const k of Object.keys(map)) {
      for (const other of map[k]) {
        const source = direction === "byTarget" ? other : k;
        const target = direction === "byTarget" ? k : other;
        const guard = graph.expressions?.[source]?.[target]?.text;
        out.push(guard ? { type, source, target, guard } : { type, source, target });
      }
    }
  }
  return out;
}

const relKey = (r: { type: string; source: string; target: string }) =>
  `${r.type}\u0000${r.source}\u0000${r.target}`;
const pairKey = (r: { source: string; target: string }) => `${r.source}\u0000${r.target}`;

function markingOf(graph: DCRGraph, event: Event) {
  return {
    included: graph.marking.included.has(event),
    pending: graph.marking.pending.has(event),
    executed: graph.marking.executed.has(event),
  };
}

function variableOf(graph: EditableGraph, event: Event) {
  const v = graph.data?.[event];
  return v ? { name: v.name, type: v.type } : undefined;
}

/**
 * Compute the edits that turn `prev` into `next`.
 *
 * Edits are ordered so they can be applied in sequence: relation removals and
 * type changes, event removals, event additions, event property updates,
 * relation additions, guard updates. Relations of removed events are not
 * listed separately, because removing an event removes its relations.
 */
export function diffGraphs(prev: EditableGraph, next: EditableGraph): GraphEdit[] {
  const edits: GraphEdit[] = [];

  const prevRels = relationsOf(prev);
  const nextRels = relationsOf(next);
  const prevRelKeys = new Map(prevRels.map((r) => [relKey(r), r]));
  const nextRelKeys = new Map(nextRels.map((r) => [relKey(r), r]));

  const removedRels = prevRels.filter(
    (r) => !nextRelKeys.has(relKey(r)) && next.events.has(r.source) && next.events.has(r.target)
  );
  const addedRels = nextRels.filter((r) => !prevRelKeys.has(relKey(r)));

  // A relation that only changed type is changed in place (keeps its route).
  const addedByPair = new Map<string, GraphRelation[]>();
  for (const r of addedRels) {
    const list = addedByPair.get(pairKey(r)) ?? [];
    list.push(r);
    addedByPair.set(pairKey(r), list);
  }
  // new relation -> the old relation it replaces
  const retyped = new Map<GraphRelation, GraphRelation>();
  for (const r of removedRels) {
    const candidate = addedByPair.get(pairKey(r))?.shift();
    if (candidate) {
      edits.push({ op: "changeRelationType", source: r.source, target: r.target, from: r.type, to: candidate.type });
      retyped.set(candidate, r);
    } else {
      edits.push({ op: "removeRelation", type: r.type, source: r.source, target: r.target });
    }
  }

  // Events
  for (const e of prev.events) {
    if (!next.events.has(e)) edits.push({ op: "removeEvent", name: e });
  }

  const addedEvents = [...next.events].filter((e) => !prev.events.has(e));
  const placed = new Set([...prev.events].filter((e) => next.events.has(e)));
  for (const e of addedEvents) {
    const near = nextRels
      .filter((r) => r.source === e || r.target === e)
      .map((r) => (r.source === e ? r.target : r.source))
      .find((other) => other !== e && placed.has(other));
    const role = next.roleMap?.[e];
    const variable = variableOf(next, e);
    edits.push({
      op: "addEvent",
      name: e,
      ...markingOf(next, e),
      ...(role ? { role } : {}),
      ...(variable ? { variable } : {}),
      ...(near ? { near } : {}),
    });
    placed.add(e);
  }

  // Properties of events present in both graphs
  for (const e of next.events) {
    if (!prev.events.has(e)) continue;

    const prevRole = prev.roleMap?.[e];
    const nextRole = next.roleMap?.[e];
    if ((prevRole ?? "") !== (nextRole ?? "")) {
      edits.push(nextRole ? { op: "setRole", name: e, role: nextRole } : { op: "setRole", name: e });
    }

    const pm = markingOf(prev, e);
    const nm = markingOf(next, e);
    if (pm.included !== nm.included || pm.pending !== nm.pending || pm.executed !== nm.executed) {
      edits.push({ op: "setMarking", name: e, ...nm });
    }

    const pv = variableOf(prev, e);
    const nv = variableOf(next, e);
    if (pv?.name !== nv?.name || pv?.type !== nv?.type) {
      edits.push({ op: "setVariable", name: e, variable: nv ?? null });
    }
  }

  // New relations
  for (const r of addedRels) {
    if (retyped.has(r)) continue;
    edits.push({
      op: "addRelation",
      type: r.type,
      source: r.source,
      target: r.target,
      ...(r.guard ? { guard: r.guard } : {}),
    });
  }

  // Guards on relations that survive (unchanged or retyped)
  for (const r of nextRels) {
    if (addedRels.includes(r) && !retyped.has(r)) continue;
    const before = (retyped.get(r) ?? prevRelKeys.get(relKey(r)))?.guard;
    if ((before ?? "") !== (r.guard ?? "")) {
      edits.push(
        r.guard
          ? { op: "setGuard", type: r.type, source: r.source, target: r.target, guard: r.guard }
          : { op: "setGuard", type: r.type, source: r.source, target: r.target }
      );
    }
  }

  return edits;
}
