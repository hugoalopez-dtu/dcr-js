export interface LLMResponse {
    rawResponse: any;
    text: string;
}

export interface LLMProviderConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    [key: string]: any;
}

export abstract class LLMProvider {
    protected config: LLMProviderConfig;

    constructor(config: LLMProviderConfig) {
        this.config = config;
    }

    abstract call(prompt: string, options?: Record<string, any>): Promise<LLMResponse>;
}
