import type { GraphEdit } from "dcr-engine";
import type { DCRGraphEditing } from "modeler";

/**
 * Maps an event name, as used in the built graph (e.g. from extraction), to
 * the id of the event on the canvas. Lets edits find an event even after it
 * was renamed on the canvas.
 */
export type EventIdMap = Record<string, string>;

export interface ApplyResult {
  applied: number;
  /** edits that were not applied, with the reason */
  skipped: Array<{ edit: GraphEdit; reason: string }>;
  /** the mapping after the edits (added events in, removed events out) */
  eventIds: EventIdMap;
}

/**
 * Build the name -> id mapping from the canvas, e.g. right after a graph was
 * drawn from scratch (names are then unique).
 */
export function eventIdsFromCanvas(api: DCRGraphEditing): EventIdMap {
  const map: EventIdMap = {};
  for (const e of api.listEvents()) {
    if (!(e.name in map)) map[e.name] = e.id;
  }
  return map;
}

/**
 * Apply edits to the rendered diagram one at a time.
 *
 * Events are found through `eventIds` (by id), so events renamed on the
 * canvas are still found. Edits that are already satisfied on the canvas
 * (e.g. removing an event the user already deleted by hand) are skipped, as
 * are edits the editor rejects. Nothing the edits do not mention is touched.
 */
export function applyGraphEdits(
  api: DCRGraphEditing,
  edits: GraphEdit[],
  eventIds: EventIdMap
): ApplyResult {
  const result: ApplyResult = { applied: 0, skipped: [], eventIds: { ...eventIds } };

  for (const edit of edits) {
    try {
      const reason = applyOne(api, edit, result.eventIds);
      if (reason) result.skipped.push({ edit, reason });
      else result.applied++;
    } catch (e) {
      result.skipped.push({ edit, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/**
 * The canvas id of the event built under `name`, or undefined if it no longer
 * exists. Names not in the mapping fall back to a unique label match.
 */
function findId(api: DCRGraphEditing, ids: EventIdMap, name: string): string | undefined {
  if (name in ids) {
    const id = ids[name];
    return api.getNodes().includes(id) ? id : undefined;
  }
  const matches = api.getNodes({ name });
  if (matches.length > 1) {
    throw new Error(`"${name}" matches ${matches.length} events (${matches.join(", ")}).`);
  }
  return matches[0];
}

function requireId(api: DCRGraphEditing, ids: EventIdMap, name: string): string {
  const id = findId(api, ids, name);
  if (!id) throw new Error(`Event "${name}" is no longer in the graph.`);
  return id;
}

/** Returns a skip reason, or undefined when the edit was applied. */
function applyOne(api: DCRGraphEditing, edit: GraphEdit, ids: EventIdMap): string | undefined {
  switch (edit.op) {
    case "addEvent": {
      const existing = findId(api, ids, edit.name);
      if (existing) {
        ids[edit.name] = existing;
        return `event "${edit.name}" already exists`;
      }
      const near = edit.near ? findId(api, ids, edit.near) : undefined;
      const id = api.addEvent(edit.name, {
        role: edit.role,
        included: edit.included,
        pending: edit.pending,
        executed: edit.executed,
        near,
      });
      ids[edit.name] = id;
      if (edit.variable) api.setVariable(id, edit.variable);
      return;
    }
    case "removeEvent": {
      const id = findId(api, ids, edit.name);
      delete ids[edit.name];
      if (!id) return `event "${edit.name}" is already gone`;
      api.removeEvent(id);
      return;
    }
    case "setRole":
      api.setRole(requireId(api, ids, edit.name), edit.role);
      return;
    case "setMarking":
      api.setMarking(requireId(api, ids, edit.name), {
        included: edit.included,
        pending: edit.pending,
        executed: edit.executed,
      });
      return;
    case "setVariable":
      api.setVariable(requireId(api, ids, edit.name), edit.variable);
      return;
    case "addRelation": {
      const src = requireId(api, ids, edit.source);
      const tgt = requireId(api, ids, edit.target);
      if (api.hasRelation(edit.type, src, tgt)) {
        return `${edit.type} relation "${edit.source}" → "${edit.target}" already exists`;
      }
      api.addRelation(edit.type, src, tgt, { guard: edit.guard });
      return;
    }
    case "removeRelation": {
      const id = edgeId(api, ids, edit.type, edit.source, edit.target);
      if (!id) return `${edit.type} relation "${edit.source}" → "${edit.target}" is already gone`;
      api.removeRelation(id);
      return;
    }
    case "changeRelationType": {
      const id = edgeId(api, ids, edit.from, edit.source, edit.target);
      if (!id) {
        // The old relation was removed by hand; add the new one instead.
        const src = requireId(api, ids, edit.source);
        const tgt = requireId(api, ids, edit.target);
        if (api.hasRelation(edit.to, src, tgt)) {
          return `${edit.to} relation "${edit.source}" → "${edit.target}" already exists`;
        }
        api.addRelation(edit.to, src, tgt);
        return;
      }
      api.changeRelationType(id, edit.to);
      return;
    }
    case "setGuard": {
      const id = edgeId(api, ids, edit.type, edit.source, edit.target);
      if (!id) return `${edit.type} relation "${edit.source}" → "${edit.target}" does not exist`;
      api.setGuard(id, edit.guard);
      return;
    }
  }
}

function edgeId(
  api: DCRGraphEditing,
  ids: EventIdMap,
  type: string,
  source: string,
  target: string
): string | undefined {
  const src = findId(api, ids, source);
  const tgt = findId(api, ids, target);
  if (!src || !tgt) return undefined;
  return api.getEdges({ type, source: src, target: tgt })[0];
}
