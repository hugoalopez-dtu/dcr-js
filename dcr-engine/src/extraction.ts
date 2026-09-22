import {type Event, type EventMap, type ExecutionRecord, type Role, type RoleDataDCR} from "./types";
import mentionPrompt from "./prompts/mentions";
import entitiesPrompt from "./prompts/entities";
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
    id: number;
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
    entityDescription: string;
    relationDescription: string;
    dataDescription: string;
}

export type ExtractionResult = {
    graph: RoleDataDCR;
    doc: ProcessDescription;
}

export default async function extractGraph(
    config: ExtractionConfig,
    onStep?: (step: string) => void
): Promise<ExtractionResult> {
    const doc = preprocessText(config.text);
    onStep?.("Extracting actors and events");
    doc.mentions = await extractEntityMentions(config.modelName, doc, config.apiKey, config.mentionDescription);
    onStep?.("Resolving entities");
    doc.entities = await resolveEntities(config.modelName, doc, config.apiKey, config.entityDescription);
    onStep?.("Extracting relations");
    doc.relations = await extractRelations(config.modelName, doc, config.apiKey, config.relationDescription);
    onStep?.("Extracting data guards");
    const {
        variables,
        expressions
    } = await extractDataAndExpressions(config.modelName, doc, config.apiKey, config.dataDescription);
    doc.variables = variables;
    doc.expressions = expressions;

    onStep?.("Building DCR graph");
    const graph = buildGraph(doc);

    return {graph, doc};
}

export function buildGraph(doc: ProcessDescription): RoleDataDCR {
    const graph: RoleDataDCR = {
        events: new Set<Event>(),
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Map<Event, ExecutionRecord>(),
            pending: new Map<Event, Date | undefined>(),
            included: new Set<Event>(),
        },
        data: {},
        expressions: {},
        roles: new Set<Role>(),
        roleMap: {},
    };

    const mentionToEntity = new Map<number, Entity>();
    for (const entity of doc.entities) {
        for (const index of entity.mentionIndices) {
            if (!mentionToEntity.has(index)) {
                mentionToEntity.set(index, entity);
            }
        }
    }

    // Resolve a mention index to the event name of the entity it belongs to,
    // falling back to the raw mention text for mentions outside any entity.
    const eventNameOfMention = (index: number): string => {
        const entity = mentionToEntity.get(index);
        const eventName = entity
            ? doc.mentions[entity.representativeIndex]?.text
            : doc.mentions[index]?.text;
        return eventName ?? `#[${index}]`;
    };

    // One event per entity, named after its representative mention.
    for (const entity of doc.entities) {
        const representative = doc.mentions[entity.representativeIndex];
        if (!representative) continue;
        if (representative.type.toLowerCase() !== "event") continue;
        graph.events.add(representative.text);
        graph.marking.included.add(representative.text);
    }

    // Mentions that are not covered by any entity still act as single events.
    const coveredMentions = new Set<number>();
    for (const entity of doc.entities) {
        for (const index of entity.mentionIndices) {
            coveredMentions.add(index);
        }
    }
    doc.mentions.forEach((m, index) => {
        if (m.type.toLowerCase() !== "event") return;
        if (coveredMentions.has(index)) return;
        graph.events.add(m.text);
        graph.marking.included.add(m.text);
    });

    graph.data = {};
    for (const v of doc.variables) {
        graph.events.add(v.name);
        graph.data[v.name] = {
            name: v.name,
            type: v.type
        }
    }

    for (const r of doc.relations) {
        const head = eventNameOfMention(r.headMentionIndex);
        const tail = eventNameOfMention(r.tailMentionIndex);
        switch (r.type.toLowerCase()) {
            case "executes": {
                graph.roles.add(head);
                if (!graph.roleMap[tail]) graph.roleMap[tail] = head;
                break;
            }
            case "condition": {
                addToEventMap(graph.conditionsFor, tail, head);
                break;
            }
            case "response": {
                addToEventMap(graph.responseTo, head, tail);
                break;
            }
            case "excludes": {
                addToEventMap(graph.excludesTo, head, tail);
                break;
            }
            case "includes": {
                addToEventMap(graph.includesTo, head, tail);
                break;
            }
        }
    }

    graph.expressions = {};
    for (const e of doc.expressions) {
        const r = doc.relations[e.boundToRelation];
        if (!r) continue;
        const head = eventNameOfMention(r.headMentionIndex);
        const tail = eventNameOfMention(r.tailMentionIndex);
        if (graph.expressions[head] === undefined) {
            graph.expressions[head] = {};
        }
        graph.expressions[head][tail] = {text: e.text};
    }

    return graph;
}

export function filterProcessDescription(
    doc: ProcessDescription,
    selectedMentionIndices: Set<number>,
    selectedRelationIndices: Set<number>
): ProcessDescription {
    const mentionIndexMap = new Map<number, number>();
    const mentions: Mention[] = [];
    doc.mentions.forEach((m, i) => {
        if (!selectedMentionIndices.has(i)) return;
        mentionIndexMap.set(i, mentions.length);
        mentions.push({...m});
    });

    const relationIndexMap = new Map<number, number>();
    const relations: Relation[] = [];
    doc.relations.forEach((r, i) => {
        if (!selectedRelationIndices.has(i)) return;
        const head = mentionIndexMap.get(r.headMentionIndex);
        const tail = mentionIndexMap.get(r.tailMentionIndex);
        if (head === undefined || tail === undefined) return;
        relationIndexMap.set(i, relations.length);
        relations.push({
            type: r.type,
            headMentionIndex: head,
            tailMentionIndex: tail,
        });
    });

    const expressions: Expression[] = [];
    for (const e of doc.expressions) {
        const boundToRelation = relationIndexMap.get(e.boundToRelation);
        if (boundToRelation === undefined) continue;
        expressions.push({...e, boundToRelation});
    }

    // Filter entities: keep entities that still have at least one mention,
    // remapping their mention indices to the filtered mentions array.
    const entities: Entity[] = [];
    doc.entities.forEach((entity) => {
        const mentionIndices = entity.mentionIndices
            .map((i) => mentionIndexMap.get(i))
            .filter((i): i is number => i !== undefined);

        if (mentionIndices.length === 0) return;

        entities.push({
            id: entity.id,
            representativeIndex:
                mentionIndexMap.get(entity.representativeIndex) ?? mentionIndices[0],
            mentionIndices,
        });
    });

    return {
        ...doc,
        mentions,
        relations,
        expressions,
        entities,
    };
}

function extractOutputText(data: any): string {
    const messageItem = data.output?.find((item: any) => item.type === "message");
    if (!messageItem) {
        throw new Error("No message item found in OpenAI response output");
    }
    return messageItem.content[0].text;
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

    // fix manual new lines in input text, to prevent problems with segmenting
    text = text.replace(/([\w,-])\s*\n/gm, "$1 ");

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

    const response = await callAi(apiKey, model, prompt);

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const result: string = extractOutputText(data);

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
            console.error(`Skipping expression ${text}, as it is bound to a non existent relation with id ${boundToRelation}`);
        }
    }

    return {expressions, variables}
}

export async function extractRelations(model: string, doc: ProcessDescription, apiKey: string, relationDescription: string): Promise<Relation[]> {
    const taggedSentences = tagMentions(doc.sentences, doc.mentions);
    let prompt = relationsPrompt;
    prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
    prompt = prompt.replaceAll("{{description}}", relationDescription);

    const response = await callAi(apiKey, model, prompt);

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    const result = extractOutputText(data);

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

export async function resolveEntities(model: string, doc: ProcessDescription, apiKey: string, entityDescription: string): Promise<Entity[]> {
    const taggedSentences = tagMentions(doc.sentences, doc.mentions);
    let prompt = entitiesPrompt;
    prompt = prompt.replaceAll("{{text}}", taggedSentences.join('\n'));
    prompt = prompt.replaceAll("{{description}}", entityDescription);

    const response = await callAi(apiKey, model, prompt);

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    const result = extractOutputText(data);

    const entities: Entity[] = [];

    let nextEntityId = 0;

    for (const rawEntity of result.trim().split("\n")) {
        const indices = rawEntity.trim().split("\t").map(Number);
        const valid = Array.from(new Set(indices)).filter(
            (i) => Number.isInteger(i) && i >= 0 && i < doc.mentions.length
        );

        if (valid.length === 0) continue;

        const byType = new Map<string, number[]>();
        for (const index of valid) {
            const type = doc.mentions[index].type;
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

    for (let i = 0; i < doc.mentions.length; i++) {
        if (covered.has(i)) continue;
        entities.push({
            id: nextEntityId++,
            representativeIndex: i,
            mentionIndices: [i],
        });
    }

    return entities;
}

async function callAi(apiKey: string, model: string, prompt: string) {
    return await fetch("https://api.openai.com/v1/responses", {
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
    const response = await callAi(apiKey, model, prompt);

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    const result = extractOutputText(data);

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
