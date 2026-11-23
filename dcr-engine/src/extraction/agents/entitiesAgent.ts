import { ExtractionAgent, type AgentContext } from "./base";
import type { Entity } from "../models";
import entitiesPrompt from "../../prompts/entities";
import { tagMentions } from "../preprocessing";

export interface EntitiesAgentInput extends AgentContext {
    description: string;
}

export class EntitiesAgent extends ExtractionAgent<EntitiesAgentInput, Entity[]> {
    name = "entities";

    getPrompt(input: EntitiesAgentInput): string {
        const taggedSentences = tagMentions(input.doc.sentences, input.doc.mentions);
        let prompt = entitiesPrompt;
        prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
        prompt = prompt.replaceAll("{{description}}", input.description);
        return prompt;
    }

    prepareInput(input: EntitiesAgentInput): EntitiesAgentInput {
        return input;
    }

    parseResponse(response: string, input: EntitiesAgentInput): Entity[] {
        const entities: Entity[] = [];
        let nextEntityId = 0;

        for (const rawEntity of response.trim().split("\n")) {
            if (!rawEntity.trim()) continue;
            const indices = rawEntity.trim().split("\t").map(Number);
            const valid = Array.from(new Set(indices)).filter(
                (i) => Number.isInteger(i) && i >= 0 && i < input.doc.mentions.length
            );

            if (valid.length === 0) continue;

            const byType = new Map<string, number[]>();
            for (const index of valid) {
                const type = input.doc.mentions[index].type;
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

        for (let i = 0; i < input.doc.mentions.length; i++) {
            if (covered.has(i)) continue;
            entities.push({
                id: nextEntityId++,
                representativeIndex: i,
                mentionIndices: [i],
            });
        }

        return entities;
    }
}
