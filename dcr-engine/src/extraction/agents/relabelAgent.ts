import { ExtractionAgent, type AgentContext } from "./base";
import type { Entity } from "../models";
import relabelPrompt from "../../prompts/relabel";
import { tagMentions } from "../preprocessing";

export interface RelabelAgentInput extends AgentContext {
    description: string;
}

/** Entities whose representative mention is an event, i.e., the activities. */
function activities(input: RelabelAgentInput): Entity[] {
    return input.doc.entities.filter(
        (e) => input.doc.mentions[e.representativeIndex]?.type.toLowerCase() === "event"
    );
}

/**
 * Gives every activity (event entity) a name following the guidelines.
 * Returns the entities with `label` set; activities the LLM did not name keep
 * no label, so they fall back to their representative mention's text.
 */
export class RelabelAgent extends ExtractionAgent<RelabelAgentInput, Entity[]> {
    name = "relabel";

    getPrompt(input: RelabelAgentInput): string {
        const taggedSentences = tagMentions(input.doc.sentences, input.doc.mentions);
        const list = activities(input).map((e) => {
            const texts = e.mentionIndices.map((i) => input.doc.mentions[i]?.text).filter(Boolean);
            return `${e.id}\t${texts.join(" | ")}`;
        });
        let prompt = relabelPrompt;
        prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
        prompt = prompt.replaceAll("{{activities}}", list.join('\n'));
        prompt = prompt.replaceAll("{{description}}", input.description);
        return prompt;
    }

    prepareInput(input: RelabelAgentInput): RelabelAgentInput {
        return input;
    }

    parseResponse(response: string, input: RelabelAgentInput): Entity[] {
        const ids = new Set(activities(input).map((e) => e.id));
        const labels = new Map<number, string>();

        for (const line of response.trim().split("\n")) {
            const [rawId, ...rest] = line.trim().split("\t");
            const id = Number(rawId);
            const label = rest.join(" ").trim();
            if (!Number.isInteger(id) || !ids.has(id) || !label || labels.has(id)) continue;
            labels.set(id, label);
        }

        // Activity names must be unique (they become event names): number repeats.
        const used = new Set<string>();
        for (const e of input.doc.entities) {
            if (ids.has(e.id) && !labels.has(e.id)) {
                const text = input.doc.mentions[e.representativeIndex]?.text;
                if (text) used.add(text);
            }
        }
        for (const [id, label] of labels) {
            let unique = label;
            for (let n = 2; used.has(unique); n++) unique = `${label} (${n})`;
            used.add(unique);
            labels.set(id, unique);
        }

        return input.doc.entities.map((e) =>
            labels.has(e.id) ? { ...e, label: labels.get(e.id) } : e
        );
    }
}
