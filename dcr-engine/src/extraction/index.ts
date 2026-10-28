import { preprocessText } from "./preprocessing";
import { extractEntityMentions } from "./mentions";
import { resolveEntities } from "./entities";
import { extractRelations } from "./relations";
import { extractDataAndExpressions } from "./data";
import { buildGraph } from "./graph";
import type { ExtractionConfig, ExtractionResult } from "./models";

export type * from "./models";
export { buildGraph } from "./graph";
export { filterProcessDescription } from "./filter";
export { preprocessText, tagMentions } from "./preprocessing";
export { extractEntityMentions } from "./mentions";
export { resolveEntities } from "./entities";
export { extractRelations } from "./relations";
export { extractDataAndExpressions } from "./data";
export { routePrompt, getProvider } from "./router";
export { OpenAIProvider } from "./openaiProvider";
export { AnthropicProvider } from "./anthropicProvider";
export { GeminiProvider } from "./geminiProvider";
export { LLMProvider } from "./llmProvider";

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

export { extractGraph };
