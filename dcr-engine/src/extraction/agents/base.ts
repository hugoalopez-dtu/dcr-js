import type { ProcessDescription } from "../models";
import { routePrompt } from "../router";

export interface AgentContext {
    doc: ProcessDescription;
    apiKey: string;
    modelName: string;
    description?: string | any[];
    [key: string]: any;
}

export interface AgentResult<T = any> {
    data: T;
    rawResponse: string;
}

export abstract class ExtractionAgent<TInput = AgentContext, TOutput = any> {
    abstract name: string;

    protected config: {
        apiKey: string;
        modelName: string;
    };

    constructor(config: {
        apiKey: string;
        modelName: string;
    }) {
        this.config = config;
    }

    abstract getPrompt(input: TInput): string;

    abstract prepareInput(input: TInput): TInput;

    abstract parseResponse(response: string, input: TInput): TOutput;

    async run(input: TInput): Promise<AgentResult<TOutput>> {
        const preparedInput = this.prepareInput(input);
        const prompt = this.getPrompt(preparedInput);
        const rawResponse = await routePrompt(prompt, this.config.apiKey, this.config.modelName);
        const data = this.parseResponse(rawResponse, preparedInput);
        
        return {
            data,
            rawResponse,
        };
    }
}
