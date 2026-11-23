import { ExtractionAgent, type AgentContext } from "./base";
import type { Relation, RelationTypeDefinition } from "../models";
import relationsPrompt from "../../prompts/relations";
import { buildTaggedText } from "../preprocessing";

export interface RelationsAgentInput extends AgentContext {
    relationDescriptions: RelationTypeDefinition[];
}

export class RelationsAgent extends ExtractionAgent<RelationsAgentInput, Relation[]> {
    name = "relations";

    getPrompt(input: RelationsAgentInput): string {
        const text = buildTaggedText(input.doc.sentences, input.doc.mentions);
        const descriptionText = input.relationDescriptions
            .filter((d) => d.type && d.name && d.description)
            .map((d) => `${d.name}: ${d.description}`)
            .join("\n");

        let prompt = relationsPrompt;
        prompt = prompt.replaceAll("{{text}}", text);
        prompt = prompt.replaceAll("{{description}}", descriptionText);
        return prompt;
    }

    prepareInput(input: RelationsAgentInput): RelationsAgentInput {
        return input;
    }

    parseResponse(response: string, input: RelationsAgentInput): Relation[] {
        const typeByName = new Map<string, string>();
        for (const d of input.relationDescriptions) {
            typeByName.set(d.name, d.type);
        }

        const relations: Relation[] = [];
        for (const rawRelation of response.trim().split("\n")) {
            if (!rawRelation.trim()) continue;
            const parts = rawRelation.split("\t");
            if (parts.length < 3) continue;
            const [relationName, head, tail] = parts;
            const relationType = typeByName.get(relationName);
            if (!relationType) {
                console.error(`Ignoring relation '${relationName}', no matching relation type definition found.`);
                continue;
            }
            relations.push({
                type: relationType,
                name: relationName,
                headMentionIndex: Number(head),
                tailMentionIndex: Number(tail),
            });
        }
        return relations;
    }
}
