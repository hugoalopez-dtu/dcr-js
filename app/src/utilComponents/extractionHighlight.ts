import type { ProcessDescription } from "dcr-engine/src/extraction";
import { entityName, mentionName } from "dcr-engine";
import type DCRModeler from "modeler";
import type { DCRGraphEditing } from "modeler";
import type { EventIdMap } from "./applyGraphEdits";

/** What the mouse is over in the extraction view. */
export type ExtractionHoverTarget =
    | { kind: "mention"; index: number; color?: string }
    | { kind: "relation"; index: number; color?: string };

/**
 * Which part of a canvas element to highlight. Each is a CSS class put on the
 * element (styled in index.css):
 * - whole: the entire element (used for relations)
 * - label: only the event's name text
 * - role:  only the event's role text
 */
const MARKERS = {
    whole: "extraction-hover",
    label: "extraction-hover-label",
    role: "extraction-hover-role",
} as const;

/** CSS variable holding the highlight colour (index.css falls back to blue). */
const COLOR_VAR = "--extraction-hover-color";

/** A canvas element and the part of it to highlight. */
export type Highlight = { id: string; part: keyof typeof MARKERS; color?: string };

/** Activity (entity id) → id of the canvas event it was built into. */
export type ActivityIdMap = Record<number, string>;

/**
 * Record which canvas event each activity of `doc` became, right after the
 * graph was built from `doc` and `eventIds` updated.
 */
export function activityIdsFor(doc: ProcessDescription, eventIds: EventIdMap): ActivityIdMap {
    const map: ActivityIdMap = {};
    for (const entity of doc.entities) {
        const name = entityName(doc, entity);
        if (name !== undefined && name in eventIds) map[entity.id] = eventIds[name];
    }
    return map;
}

/**
 * Canvas id of the event a mention belongs to, if it is on the canvas.
 * Found by the mention's activity (entity) id, so neither the activity's name
 * nor the label on the canvas matters. A mention in no activity falls back to
 * its name.
 */
function eventIdOfMention(
    doc: ProcessDescription,
    index: number,
    api: DCRGraphEditing,
    eventIds: EventIdMap,
    activityIds: ActivityIdMap
): string | undefined {
    const entity = doc.entities.find((e) => e.mentionIndices.includes(index));
    const id = entity ? activityIds[entity.id] : eventIds[doc.mentions[index]?.text ?? ""];
    return id !== undefined && api.getNodes().includes(id) ? id : undefined;
}

/** Canvas ids of the events that have the role named by an actor mention. */
function eventIdsOfRole(doc: ProcessDescription, index: number, api: DCRGraphEditing): string[] {
    // The role may be stored under the mention's own text or under its
    // entity's representative text, depending on how the graph was built.
    const names = new Set([doc.mentions[index]?.text, mentionName(doc, index)]);
    const ids = new Set<string>();
    for (const role of names) {
        if (role) api.getNodes({ role }).forEach((id) => ids.add(id));
    }
    return [...ids];
}

/**
 * The canvas elements (and which part of each) that correspond to the hovered
 * part of the extraction view. Empty when nothing on the canvas corresponds to it.
 */
export function elementsForHover(
    target: ExtractionHoverTarget,
    doc: ProcessDescription,
    api: DCRGraphEditing,
    eventIds: EventIdMap,
    activityIds: ActivityIdMap
): Highlight[] {
    return findElements(target, doc, api, eventIds, activityIds).map((h) => ({ ...h, color: target.color }));
}

function findElements(
    target: ExtractionHoverTarget,
    doc: ProcessDescription,
    api: DCRGraphEditing,
    eventIds: EventIdMap,
    activityIds: ActivityIdMap
): Highlight[] {
    if (target.kind === "mention") {
        const mention = doc.mentions[target.index];
        if (!mention) return [];
        if (mention.type.toLowerCase() === "event") {
            const id = eventIdOfMention(doc, target.index, api, eventIds, activityIds);
            return id ? [{ id, part: "label" }] : [];
        }
        return eventIdsOfRole(doc, target.index, api).map((id) => ({ id, part: "role" }));
    }

    const relation = doc.relations[target.index];
    if (!relation) return [];
    const tailId = eventIdOfMention(doc, relation.tailMentionIndex, api, eventIds, activityIds);

    // "executes" is drawn as the role of the event, not as an arrow.
    if (relation.type.toLowerCase() === "executes") {
        return tailId ? [{ id: tailId, part: "role" }] : [];
    }

    const headId = eventIdOfMention(doc, relation.headMentionIndex, api, eventIds, activityIds);
    if (!headId || !tailId) return [];
    try {
        return api
            .getEdges({ type: relation.type, source: headId, target: tailId })
            .map((id) => ({ id, part: "whole" }));
    } catch {
        return []; // relation type the modeler does not know
    }
}

/** Replace the highlighted canvas elements; returns what is now highlighted. */
export function setHighlight(modeler: DCRModeler, previous: Highlight[], next: Highlight[]): Highlight[] {
    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    for (const { id, part } of previous) {
        if (!registry.get(id)) continue;
        canvas.removeMarker(id, MARKERS[part]);
        canvas.getGraphics(id)?.style.removeProperty(COLOR_VAR);
    }
    for (const { id, part, color } of next) {
        if (!registry.get(id)) continue;
        canvas.addMarker(id, MARKERS[part]);
        if (color) canvas.getGraphics(id)?.style.setProperty(COLOR_VAR, color);
    }
    return next;
}

/** The entries of the extraction view to highlight for what the mouse is over on the canvas. */
export type ViewHighlight = { mentions: Set<number>; relations: Set<number> };

/**
 * The inverse of elementsForHover: every mention and relation whose highlight
 * would include `hovered` (the same canvas element and part). Using the same
 * mapping keeps both directions consistent.
 */
export function entriesForElement(
    hovered: Highlight,
    doc: ProcessDescription,
    api: DCRGraphEditing,
    eventIds: EventIdMap,
    activityIds: ActivityIdMap
): ViewHighlight {
    const matches = (target: ExtractionHoverTarget) =>
        findElements(target, doc, api, eventIds, activityIds)
            .some((h) => h.id === hovered.id && h.part === hovered.part);
    const mentions = new Set<number>();
    const relations = new Set<number>();
    if (hovered.part !== "whole") {
        doc.mentions.forEach((_, index) => {
            if (matches({ kind: "mention", index })) mentions.add(index);
        });
    }
    doc.relations.forEach((_, index) => {
        if (matches({ kind: "relation", index })) relations.add(index);
    });
    return { mentions, relations };
}

/** Height of an event's role (upper) part, as drawn by DCRRenderer. */
const ROLE_PART_HEIGHT = 30;

/**
 * The canvas element and part under the mouse: the role or label part of an
 * event, or a whole relation. Undefined for anything else.
 */
export function hoveredPart(modeler: DCRModeler, element: any, event: MouseEvent | undefined): Highlight | undefined {
    const target = element?.labelTarget ?? element;
    const type = target?.type;
    if (type === "dcr:Relation") return { id: target.id, part: "whole" };
    if (type !== "dcr:Event" || !event) return undefined;
    // Measure from the event's drawn box on screen, so pan and zoom don't matter.
    const canvas = modeler.get("canvas") as any;
    const visual = canvas.getGraphics(target)?.querySelector(".djs-visual");
    if (!visual) return { id: target.id, part: "label" };
    const top = visual.getBoundingClientRect().top;
    const y = (event.clientY - top) / canvas.viewbox().scale;
    return { id: target.id, part: y < ROLE_PART_HEIGHT ? "role" : "label" };
}
