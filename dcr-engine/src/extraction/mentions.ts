import type { Mention, MentionTypeDefinition, ProcessDescription } from "./models";
import mentionPrompt from "../prompts/mentions";
import { routePrompt } from "./router";

export async function extractEntityMentions(
    model: string,
    doc: ProcessDescription,
    apiKey: string,
    mentionDescriptions: MentionTypeDefinition[]
): Promise<Mention[]> {
    let text = "";
    let i = 0;
    for (const s of doc.sentences) {
        text += `${i}: ${s.trim()}\n`;
        i++;
    }

    const typeByName = new Map<string, string>();
    for (const d of mentionDescriptions) {
        typeByName.set(d.name, d.type);
    }

    const mentions: Mention[] = [];

    const descriptionText = mentionDescriptions
        .filter((d) => d.type && d.name && d.description)
        .map((d) => `${d.name}: ${d.description}`)
        .join("\n");

    let prompt = mentionPrompt;
    prompt = prompt.replaceAll("{{text}}", text);
    prompt = prompt.replaceAll("{{description}}", descriptionText);
    const result = await routePrompt(prompt, apiKey, model);

    for (const rawMention of result.trim().split("\n")) {
        const [mentionText, mentionName, mentionSentenceStr] = rawMention.trim().split("\t");
        const mentionSentence = Number(mentionSentenceStr);

        if (doc.sentences.length <= mentionSentence){
            console.error(`Ignoring '${mentionText}', references a non existent sentence ${mentionSentence} (${doc.sentences.length} sentences in doc).`);
            continue;
        }

        if (doc.sentences[mentionSentence].toLowerCase().indexOf(mentionText.toLowerCase()) === -1) {
            console.error(`Ignoring '${mentionText}', which is not in the referenced sentence ${mentionSentence} ('${doc.sentences[mentionSentence]}').`);
            continue;
        }

        const mentionType = typeByName.get(mentionName);
        if (!mentionType) {
            console.error(`Ignoring '${mentionText}', no matching mention type definition for name '${mentionName}'.`);
            continue;
        }

        const mention: Mention = {
            text: mentionText,
            type: mentionType,
            name: mentionName,
            sentence: mentionSentence,
        }

        mentions.push(mention);
    }
    return mentions;
}
