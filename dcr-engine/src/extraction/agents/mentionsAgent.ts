import { ExtractionAgent, type AgentContext } from "./base";
import type { Mention, MentionTypeDefinition } from "../models";
import mentionPrompt from "../../prompts/mentions";
import { buildTaggedNumberedText } from "../preprocessing";

export interface MentionsAgentInput extends AgentContext {
    mentionDescriptions: MentionTypeDefinition[];
}

export class MentionsAgent extends ExtractionAgent<MentionsAgentInput, Mention[]> {
    name = "mentions";

    getPrompt(input: MentionsAgentInput): string {
        const text = buildTaggedNumberedText(input.doc.sentences, input.doc.mentions);
        const descriptionText = input.mentionDescriptions
            .filter((d) => d.type && d.name && d.description)
            .map((d) => `${d.name}: ${d.description}`)
            .join("\n");

        let prompt = mentionPrompt;
        prompt = prompt.replaceAll("{{text}}", text);
        prompt = prompt.replaceAll("{{description}}", descriptionText);
        return prompt;
    }

    prepareInput(input: MentionsAgentInput): MentionsAgentInput {
        return input;
    }

    parseResponse(response: string, input: MentionsAgentInput): Mention[] {
        const typeByName = new Map<string, string>();
        for (const d of input.mentionDescriptions) {
            typeByName.set(d.name, d.type);
        }
        console.log(typeByName);
        for (const e in typeByName.entries()) {
            console.log(`${e[0]}: ${e[1]}`);
        }

        const mentions: Mention[] = [];
        for (const rawMention of response.trim().split("\n")) {
            if (!rawMention.trim()) continue;
            const parts = rawMention.trim().split("\t");
            if (parts.length < 3) continue;
            const [mentionText, mentionName, mentionSentenceStr] = parts;
            const mentionSentence = Number(mentionSentenceStr);

            if (input.doc.sentences.length <= mentionSentence) {
                console.error(`Ignoring '${mentionText}', references a non existent sentence ${mentionSentence} (${input.doc.sentences.length} sentences in doc).`);
                continue;
            }

            if (input.doc.sentences[mentionSentence].toLowerCase().indexOf(mentionText.toLowerCase()) === -1) {
                console.error(`Ignoring '${mentionText}', which is not in the referenced sentence ${mentionSentence} ('${input.doc.sentences[mentionSentence]}').`);
                continue;
            }

            const mentionType = typeByName.get(mentionName);
            if (!mentionType) {
                console.error(`Ignoring '${mentionText}', no matching mention type definition for name '${mentionName}'.`);
                continue;
            }

            mentions.push({
                text: mentionText,
                type: mentionType,
                name: mentionName,
                sentence: mentionSentence,
            });
        }
        return mentions;
    }
}
