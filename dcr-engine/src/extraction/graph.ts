import type { Event, EventMap, Role, RoleDataDCR } from "../types";
import type { Entity, ProcessDescription } from "./models";

function addToEventMap(eventMap: EventMap, source: string, target: string) {
    if (!(source in eventMap)) {
        eventMap[source] = new Set<Event>();
    }
    eventMap[source].add(target);
}

export function buildGraph(doc: ProcessDescription): RoleDataDCR {
    const graph: RoleDataDCR = {
        events: new Set<Event>(),
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Map<Event, import("../types").ExecutionRecord>(),
            pending: new Map<Event, Date | undefined>(),
            included: new Set<Event>(),
        },
        data: {},
        expressions: {},
        roles: new Set<Role>(),
        roleMap: {},
    };

    const mentionToEntity = new Map<number, Entity>();
    for (const entity of doc.entities) {
        for (const index of entity.mentionIndices) {
            if (!mentionToEntity.has(index)) {
                mentionToEntity.set(index, entity);
            }
        }
    }

    // Resolve a mention index to the event name of the entity it belongs to,
    // falling back to the raw mention text for mentions outside any entity.
    const eventNameOfMention = (index: number): string => {
        const entity = mentionToEntity.get(index);
        const eventName = entity
            ? doc.mentions[entity.representativeIndex]?.text
            : doc.mentions[index]?.text;
        return eventName ?? `#[${index}]`;
    };

    // One event per entity, named after its representative mention.
    for (const entity of doc.entities) {
        const representative = doc.mentions[entity.representativeIndex];
        if (!representative) continue;
        if (representative.type.toLowerCase() !== "event") continue;
        graph.events.add(representative.text);
        graph.marking.included.add(representative.text);
    }

    // Mentions that are not covered by any entity still act as single events.
    const coveredMentions = new Set<number>();
    for (const entity of doc.entities) {
        for (const index of entity.mentionIndices) {
            coveredMentions.add(index);
        }
    }
    doc.mentions.forEach((m, index) => {
        console.log(`${m.text} (${m.type})`);
        if (m.type.toLowerCase() !== "event") return;
        if (coveredMentions.has(index)) return;
        graph.events.add(m.text);
        graph.marking.included.add(m.text);
    });

    graph.data = {};
    for (const v of doc.variables) {
        graph.events.add(v.name);
        graph.data[v.name] = {
            name: v.name,
            type: v.type
        }
    }

    for (const r of doc.relations) {
        const head = eventNameOfMention(r.headMentionIndex);
        const tail = eventNameOfMention(r.tailMentionIndex);
        switch (r.type.toLowerCase()) {
            case "executes": {
                graph.roles.add(head);
                if (!graph.roleMap[tail]) graph.roleMap[tail] = head;
                break;
            }
            case "condition": {
                addToEventMap(graph.conditionsFor, tail, head);
                break;
            }
            case "response": {
                addToEventMap(graph.responseTo, head, tail);
                break;
            }
            case "excludes": {
                addToEventMap(graph.excludesTo, head, tail);
                break;
            }
            case "includes": {
                addToEventMap(graph.includesTo, head, tail);
                break;
            }
        }
    }

    graph.expressions = {};
    for (const e of doc.expressions) {
        const r = doc.relations[e.boundToRelation];
        if (!r) continue;
        const head = eventNameOfMention(r.headMentionIndex);
        const tail = eventNameOfMention(r.tailMentionIndex);
        if (graph.expressions[head] === undefined) {
            graph.expressions[head] = {};
        }
        graph.expressions[head][tail] = {text: e.text};
    }

    return graph;
}
