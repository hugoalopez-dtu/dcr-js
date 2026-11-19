import type { Entity, ProcessDescription } from "./models";
import entitiesPrompt from "../prompts/entities";
import { tagMentions } from "./preprocessing";
import { routePrompt } from "./router";

export async function resolveEntities(model: string, doc: ProcessDescription, apiKey: string, entityDescription: string): Promise<Entity[]> {
    const taggedSentences = tagMentions(doc.sentences, doc.mentions);
    let prompt = entitiesPrompt;
    prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
    prompt = prompt.replaceAll("{{description}}", entityDescription);

    const result = await routePrompt(prompt, apiKey, model);

    const entities: Entity[] = [];

    let nextEntityId = 0;

    for (const rawEntity of result.trim().split("\n")) {
        const indices = rawEntity.trim().split("\t").map(Number);
        const valid = Array.from(new Set(indices)).filter(
            (i) => Number.isInteger(i) && i >= 0 && i < doc.mentions.length
        );

        if (valid.length === 0) continue;

        const byType = new Map<string, number[]>();
        for (const index of valid) {
            const type = doc.mentions[index].type;
            const list = byType.get(type);
            if (list) {
                list.push(index);
            } else {
                byType.set(type, [index]);
            }
        }

        for (const indicesOfType of byType.values()) {
            entities.push({
                id: nextEntityId++,
                representativeIndex: indicesOfType[0],
                mentionIndices: indicesOfType,
            });
        }
    }

    const covered = new Set<number>();
    for (const entity of entities) {
        for (const index of entity.mentionIndices) {
            covered.add(index);
        }
    }

    for (let i = 0; i < doc.mentions.length; i++) {
        if (covered.has(i)) continue;
        entities.push({
            id: nextEntityId++,
            representativeIndex: i,
            mentionIndices: [i],
        });
    }

    return entities;
}
