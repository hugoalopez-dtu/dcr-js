import type { Mention, ProcessDescription } from "./models";
import mentionPrompt from "../prompts/mentions";
import { routePrompt } from "./router";

export async function extractEntityMentions(model: string, doc: ProcessDescription, apiKey: string, mentionDescription: string): Promise<Mention[]> {
    let text = "";
    let i = 0;
    for (const s of doc.sentences) {
        text += `${i}: ${s.trim()}\n`;
        i++;
    }

    const mentions: Mention[] = [];

    let prompt = mentionPrompt;
    prompt = prompt.replaceAll("{{text}}", text);
    prompt = prompt.replaceAll("{{description}}", mentionDescription);
    const result = await routePrompt(prompt, apiKey, model);

    for (const rawMention of result.trim().split("\n")) {
        const [mentionText, mentionType, mentionSentenceStr] = rawMention.trim().split("\t");
        const mentionSentence = Number(mentionSentenceStr);

        if (doc.sentences.length <= mentionSentence){
            console.error(`Ignoring '${mentionText}', references a non existent sentence ${mentionSentence} (${doc.sentences.length} sentences in doc).`);
            continue;
        }

        if (doc.sentences[mentionSentence].toLowerCase().indexOf(mentionText.toLowerCase()) === -1) {
            console.error(`Ignoring '${mentionText}', which is not in the referenced sentence ${mentionSentence} ('${doc.sentences[mentionSentence]}').`);
            continue;
        }

        const mention: Mention = {
            text: mentionText,
            type: mentionType,
            sentence: mentionSentence,
        }

        mentions.push(mention);
    }
    return mentions;
}
