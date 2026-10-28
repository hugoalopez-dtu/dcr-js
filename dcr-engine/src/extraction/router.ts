import { OpenAIProvider } from "./openaiProvider";
import { AnthropicProvider } from "./anthropicProvider";
import { GeminiProvider } from "./geminiProvider";
import type { LLMProvider } from "./llmProvider";

export interface RouterConfig {
    apiKey: string;
    model: string;
    provider?: string;
    baseUrl?: string;
}

const MODEL_PROVIDER_MAP: Record<string, string> = {
    "gpt": "openai",
    "o1": "openai",
    "o3": "openai",
    "o4": "openai",
    "claude": "anthropic",
    "gemini": "gemini",
};

function detectProvider(model: string): string {
    const modelLower = model.toLowerCase();
    for (const key of Object.keys(MODEL_PROVIDER_MAP)) {
        if (modelLower.includes(key)) {
            return MODEL_PROVIDER_MAP[key];
        }
    }
    // Default to openai if unclear
    return "openai";
}

export function getProvider(config: RouterConfig): LLMProvider {
    const provider = config.provider || detectProvider(config.model);
    
    switch (provider.toLowerCase()) {
        case "anthropic":
        case "claude":
            return new AnthropicProvider({
                apiKey: config.apiKey,
                model: config.model,
                baseUrl: config.baseUrl,
            });
        case "gemini":
        case "google":
            return new GeminiProvider({
                apiKey: config.apiKey,
                model: config.model,
                baseUrl: config.baseUrl,
            });
        case "openai":
        case "gpt":
        default:
            return new OpenAIProvider({
                apiKey: config.apiKey,
                model: config.model,
                baseUrl: config.baseUrl,
            });
    }
}

export async function routePrompt(
    prompt: string,
    apiKey: string,
    model: string,
    options?: {
        provider?: string;
        baseUrl?: string;
        callOptions?: Record<string, any>;
    }
): Promise<string> {
    const provider = getProvider({
        apiKey,
        model,
        provider: options?.provider,
        baseUrl: options?.baseUrl,
    });
    
    const response = await provider.call(prompt, options?.callOptions);
    return response.text;
}
