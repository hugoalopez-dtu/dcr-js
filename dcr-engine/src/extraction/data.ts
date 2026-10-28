import type { Expression, ProcessDescription, Variable } from "./models";
import dataPrompt from "../prompts/guards";
import { tagMentions } from "./preprocessing";
import { routePrompt } from "./router";

interface DataExtractionResult {
    variables: Variable[];
    expressions: Expression[];
}

export async function extractDataAndExpressions(model: string, doc: ProcessDescription, apiKey: string, description: string): Promise<DataExtractionResult> {
    const taggedSentences = tagMentions(doc.sentences, doc.mentions);
    const relations = doc.relations.map((r, i) => `${i}\t${r.type}\t${r.headMentionIndex}\t${r.tailMentionIndex}`);
    let prompt = dataPrompt;

    prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
    prompt = prompt.replaceAll("{{relations}}", relations.join('\n'));
    prompt = prompt.replaceAll("{{description}}", description);

    const result: string = await routePrompt(prompt, apiKey, model);

    const split = result.trim().split("\n\n");

    let rawVariables: string[] = [];
    let rawExpressions: string[] = [];

    if (split.length == 1) {
        rawVariables = split[0].split("\n");
    } else if (split.length == 2) {
        rawVariables = split[0].split("\n");
        rawExpressions = split[1].split("\n");
    } else {
        console.log("No variables nor guards, deadlines found.")
    }

    const variables: Variable[] = [];
    const expressions: Expression[] = [];

    for (const v of rawVariables) {
        if (!v.trim()) continue;
        const [name, type] = v.split("\t");
        variables.push({name, type})
    }

    for (const e of rawExpressions) {
        if (!e.trim()) continue;
        const [bound, text] = e.split("\t");
        const boundToRelation = Number(bound);
        if (doc.relations[boundToRelation] !== undefined) {
            expressions.push({text, boundToRelation});
        } else {
            console.error(`Skipping expression ${text}, as it is bound to a non existent relation with id ${boundToRelation}`);
        }
    }

    return {expressions, variables}
}
