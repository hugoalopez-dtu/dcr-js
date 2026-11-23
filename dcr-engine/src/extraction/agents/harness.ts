import type {ExtractionConfig, ExtractionResult} from "../models";
import {preprocessText} from "../preprocessing";
import {buildGraph} from "../graph";
import {MentionsAgent} from "./mentionsAgent";
import {EntitiesAgent} from "./entitiesAgent";
import {RelationsAgent} from "./relationsAgent";
import {DataAgent} from "./dataAgent";

export interface ExtractionHarnessOptions {
    includeData?: boolean;
}

function groupByOrder<T extends { order: number }>(items: T[]): T[][] {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    const groups: T[][] = [];
    let currentGroup: T[] = [];
    let currentOrder: number | null = null;

    for (const item of sorted) {
        if (currentOrder === null || item.order === currentOrder) {
            currentGroup.push(item);
            currentOrder = item.order;
        } else {
            groups.push(currentGroup);
            currentGroup = [item];
            currentOrder = item.order;
        }
    }
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    return groups;
}

function pluralize(name: string): string {
    return name + "s";
}

function formatExtractionStep(names: string[]): string {
    const pluralized = names.map(pluralize);
    if (pluralized.length === 1) {
        return `Extracting ${pluralized[0]}`;
    }
    return `Extracting ${pluralized.slice(0, -1).join(", ")} and ${pluralized[pluralized.length - 1]}`;
}

export async function extractGraph(
    config: ExtractionConfig,
    onStep?: (step: string) => void,
    options: ExtractionHarnessOptions = {}
): Promise<ExtractionResult> {
    const includeData = options.includeData ?? config.includeData ?? true;
    const doc = preprocessText(config.text);

    const mentionsAgent = new MentionsAgent(config);
    const entitiesAgent = new EntitiesAgent(config);
    const relationsAgent = new RelationsAgent(config);
    const dataAgent = new DataAgent(config);

    // --- Mentions: run by order groups ---
    const mentionGroups = groupByOrder(config.mentionDescriptions);
    doc.mentions = [];
    for (const group of mentionGroups) {
        console.log(`Running ${group.map(g => g.name)}`);
        onStep?.(formatExtractionStep(group.map((d) => d.name)));
        const result = await mentionsAgent.run({
            doc,
            apiKey: config.apiKey,
            modelName: config.modelName,
            mentionDescriptions: group,
        });
        doc.mentions.push(...result.data);
    }

    // --- Entities ---
    onStep?.("Resolving entities");
    const entitiesResult = await entitiesAgent.run({
        doc,
        apiKey: config.apiKey,
        modelName: config.modelName,
        description: config.entityDescription,
    });
    doc.entities = entitiesResult.data;

    // --- Relations: run by order groups ---
    const relationGroups = groupByOrder(config.relationDescriptions);
    doc.relations = [];
    for (const group of relationGroups) {
        console.log(`Running ${group.map(g => g.name)}`);
        onStep?.(formatExtractionStep(group.map((d) => d.name)));
        const result = await relationsAgent.run({
            doc,
            apiKey: config.apiKey,
            modelName: config.modelName,
            relationDescriptions: group,
        });
        doc.relations.push(...result.data);
    }

    if (includeData) {
        onStep?.("Extracting data guards");
        const dataResult = await dataAgent.run({
            doc,
            apiKey: config.apiKey,
            modelName: config.modelName,
            description: config.dataDescription,
        });
        doc.variables = dataResult.data.variables;
        doc.expressions = dataResult.data.expressions;
    } else {
        doc.variables = [];
        doc.expressions = [];
    }

    onStep?.("Building DCR graph");
    const graph = buildGraph(doc);

    return {graph, doc};
}
