import {type DataDCR, type Event, type EventMap} from "./types";
import mentionPrompt from "./prompts/mentions";
import relationsPrompt from "./prompts/relations";
import dataPrompt from "./prompts/guards";

export type Variable = {
    name: string;
    type: string;
}

export type Expression = {
    text: string;
    boundToRelation: number;
}

export type Mention = {
    text: string;
    type: string;
    sentence: number;
};

export type Entity = {
    representativeIndex: number;
    mentionIndices: number[];
}

export type Relation = {
    type: string;
    headMentionIndex: number;
    tailMentionIndex: number;
};

export type ProcessDescription = {
    text: string;
    sentences: string[];
    mentions: Mention[];
    entities: Entity[];
    relations: Relation[];
    variables: Variable[];
    expressions: Expression[];
}

export type ExtractionConfig = {
    text: string;
    modelName: string;
    apiKey: string;
    mentionDescription: string;
    relationDescription: string;
    dataDescription: string;
}

export type ExtractionResult = {
    graph: DataDCR;
    doc: ProcessDescription;
}

export default async function extractGraph(
    config: ExtractionConfig
): Promise<ExtractionResult> {
    // Initialize graph
    const graph: DataDCR = {
        events: new Set<Event>(),
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set<Event>(),
            pending: new Set<Event>(),
            included: new Set<Event>(),
        },
        data: {},
        expressions: {}
    };

    const doc = preprocessText(config.text);
    doc.mentions = await extractEntityMentions(config.modelName, doc, config.apiKey, config.mentionDescription);
    doc.relations = await extractRelations(config.modelName, doc, config.apiKey, config.relationDescription);
    const {
        variables,
        expressions
    } = await extractDataAndExpressions(config.modelName, doc, config.apiKey, config.dataDescription);
    doc.variables = variables;
    doc.expressions = expressions;

    for (const m of doc.mentions) {
        if (m.type.toLowerCase() !== "event") continue;
        graph.events.add(m.text);
        graph.marking.included.add(m.text);
    }

    graph.data = {};
    for (const v of doc.variables) {
        graph.events.add(v.name);
        graph.data[v.name] = {
            name: v.name,
            type: v.type
        }
    }

    for (const r of doc.relations) {
        const head = doc.mentions[r.headMentionIndex];
        const tail = doc.mentions[r.tailMentionIndex];
        switch (r.type.toLowerCase()) {
            case "executes": {
                break;
            }
            case "condition": {
                addToEventMap(graph.conditionsFor, tail.text, head.text);
                break;
            }
            case "response": {
                addToEventMap(graph.responseTo, head.text, tail.text);
                break;
            }
            case "excludes": {
                addToEventMap(graph.excludesTo, head.text, tail.text);
                break;
            }
            case "includes": {
                addToEventMap(graph.includesTo, head.text, tail.text);
                break;
            }
        }
    }

    graph.expressions = {};
    for (const e of doc.expressions) {
        const r = doc.relations[e.boundToRelation];
        const head = doc.mentions[r.headMentionIndex];
        const tail = doc.mentions[r.tailMentionIndex];
        if (graph.expressions[head.text] === undefined) {
            graph.expressions[head.text] = {};
        }
        graph.expressions[head.text][tail.text] = {text: e.text};
    }

    return {graph, doc};
}

function addToEventMap(eventMap: EventMap, source: string, target: string) {
    if (!(source in eventMap)) {
        eventMap[source] = new Set<Event>();
    }
    eventMap[source].add(target);
}

function preprocessText(text: string): ProcessDescription {
    const processed: ProcessDescription = {
        text: text,
        sentences: [],
        mentions: [],
        entities: [],
        relations: [],
        variables: [],
        expressions: [],
    };

    const segmenter = new Intl.Segmenter('en', {granularity: 'sentence'});
    const segments = segmenter.segment(text);
    processed.sentences = Array.from(segments).map(s => s.segment);

    return processed;
}

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

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: model,
            input: prompt,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const result: string = data.output[0].content[0].text;

    console.log(result);

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
        const [name, type] = v.split("\t");
        variables.push({name, type})
    }

    for (const e of rawExpressions) {
        const [bound, text] = e.split("\t");
        const boundToRelation = Number(bound);
        if (doc.relations[boundToRelation] !== undefined) {
            expressions.push({text, boundToRelation});
        } else {
            console.log(`Skipping expression ${text}, as it is bound to a non existent relation with id ${boundToRelation}`);
        }
    }

    return {expressions, variables}
}

export async function extractRelations(model: string, doc: ProcessDescription, apiKey: string, relationDescription: string): Promise<Relation[]> {
    const taggedSentences = tagMentions(doc.sentences, doc.mentions);
    let prompt = relationsPrompt;
    prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
    prompt = prompt.replaceAll("{{description}}", relationDescription);

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: model,
            input: prompt,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    const result = data.output[0].content[0].text;

    const relations: Relation[] = [];
    for (const rawRelation of result.trim().split("\n")) {
        const [relationType, head, tail] = rawRelation.split("\t");
        relations.push({
            type: relationType,
            headMentionIndex: Number(head),
            tailMentionIndex: Number(tail),
        });
    }

    return relations;
}

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

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: model,
            input: prompt,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    console.log(data)

    const result = data.output[0].content[0].text;

    for (const rawMention of result.trim().split("\n")) {
        const [mentionText, mentionType, mentionSentenceStr] = rawMention.trim().split("\t");
        const mentionSentence = Number(mentionSentenceStr);

        if (doc.sentences[mentionSentence].indexOf(mentionText) === -1) {
            console.log(`Ignoring '${mentionText}', which is not in the referenced sentence ${mentionSentence} ('${doc.sentences[mentionSentence]}').`);
            continue;
        }

        const mention: Mention = {
            text: mentionText,
            type: mentionType,
            sentence: mentionSentence,
        }

        mentions.push(mention);
    }
    console.log(mentions);
    return mentions;
}

export function tagMentions(
    sentences: string[],
    mentions: Mention[]
): string[] {
    // Group mentions by sentence index
    const mentionsBySentence: Record<number, (Mention & { index: number })[]> =
        {};

    mentions.forEach((m, index) => {
        if (!mentionsBySentence[m.sentence]) {
            mentionsBySentence[m.sentence] = [];
        }
        mentionsBySentence[m.sentence].push({...m, index});
    });

    return sentences.map((sentence, sentenceIndex) => {
        const sentenceMentions = mentionsBySentence[sentenceIndex];
        if (!sentenceMentions || sentenceMentions.length === 0) {
            return sentence;
        }

        // Sort by position in sentence (first occurrence)
        const sorted = sentenceMentions
            .map((m) => {
                const start = sentence.indexOf(m.text);
                if (start === -1) return null;
                return {...m, start, end: start + m.text.length};
            })
            .filter((m): m is NonNullable<typeof m> => m !== null)
            .sort((a, b) => b.start - a.start); // IMPORTANT: reverse order

        let result = sentence;

        for (const m of sorted) {
            const before = result.slice(0, m.start);
            const match = result.slice(m.start, m.end);
            const after = result.slice(m.end);

            const tagged = `<${m.type} id=${m.index}>${match}</${m.type}>`;
            result = before + tagged + after;
        }

        return result;
    });
}