import type { ProcessDescription, Relation, RelationTypeDefinition } from "./models";
import relationsPrompt from "../prompts/relations";
import { buildTaggedText } from "./preprocessing";
import { routePrompt } from "./router";

export async function extractRelations(
    model: string,
    doc: ProcessDescription,
    apiKey: string,
    relationDescriptions: RelationTypeDefinition[]
): Promise<Relation[]> {
    const text = buildTaggedText(doc.sentences, doc.mentions);
    const descriptionText = relationDescriptions
        .filter((d) => d.type && d.name && d.description)
        .map((d) => `${d.name}: ${d.description}`)
        .join("\n");

    let prompt = relationsPrompt;
    prompt = prompt.replaceAll("{{text}}", text);
    prompt = prompt.replaceAll("{{description}}", descriptionText);

    const result = await routePrompt(prompt, apiKey, model);

    const typeByName = new Map<string, string>();
    for (const d of relationDescriptions) {
        typeByName.set(d.name, d.type);
    }

    const relations: Relation[] = [];
    for (const rawRelation of result.trim().split("\n")) {
        const [relationName, head, tail] = rawRelation.split("\t");
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
