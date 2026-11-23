import { ExtractionAgent, type AgentContext } from "./base";
import type { Expression, Variable } from "../models";
import dataPrompt from "../../prompts/guards";
import { tagMentions } from "../preprocessing";

export interface DataAgentInput extends AgentContext {
    description: string;
}

export interface DataAgentOutput {
    variables: Variable[];
    expressions: Expression[];
}

export class DataAgent extends ExtractionAgent<DataAgentInput, DataAgentOutput> {
    name = "data";

    getPrompt(input: DataAgentInput): string {
        const taggedSentences = tagMentions(input.doc.sentences, input.doc.mentions);
        const relations = input.doc.relations.map((r, i) => `${i}\t${r.type}\t${r.headMentionIndex}\t${r.tailMentionIndex}`);
        let prompt = dataPrompt;
        prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
        prompt = prompt.replaceAll("{{relations}}", relations.join('\n'));
        prompt = prompt.replaceAll("{{description}}", input.description);
        return prompt;
    }

    prepareInput(input: DataAgentInput): DataAgentInput {
        return input;
    }

    parseResponse(response: string, input: DataAgentInput): DataAgentOutput {
        const split = response.trim().split("\n\n");

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
            const parts = v.split("\t");
            if (parts.length < 2) continue;
            const [name, type] = parts;
            variables.push({name, type})
        }

        for (const e of rawExpressions) {
            if (!e.trim()) continue;
            const parts = e.split("\t");
            if (parts.length < 2) continue;
            const [bound, text] = parts;
            const boundToRelation = Number(bound);
            if (input.doc.relations[boundToRelation] !== undefined) {
                expressions.push({text, boundToRelation});
            } else {
                console.error(`Skipping expression ${text}, as it is bound to a non existent relation with id ${boundToRelation}`);
            }
        }

        return {expressions, variables}
    }
}
