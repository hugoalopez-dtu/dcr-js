import { LLMProvider, type LLMProviderConfig, type LLMResponse } from "./llmProvider";

export class AnthropicProvider extends LLMProvider {
    constructor(config: LLMProviderConfig) {
        super(config);
    }

    private extractTextFromResponse(data: any): string {
        if (data.content && Array.isArray(data.content)) {
            const textBlocks = data.content
                .filter((block: any) => block.type === "text")
                .map((block: any) => block.text)
                .join("");
            if (textBlocks) {
                return textBlocks;
            }
        }
        if (data.text) {
            return data.text;
        }
        if (data.completion) {
            return data.completion;
        }
        throw new Error("No text content found in Anthropic response");
    }

    async call(prompt: string, options?: Record<string, any>): Promise<LLMResponse> {
        const baseUrl = this.config.baseUrl || "https://api.anthropic.com/v1/messages";
        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.config.apiKey,
                "anthropic-version": "2023-06-13",
                ...(options?.headers || {}),
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: options?.maxTokens || 4096,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                ...(options?.body || {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json();
        const text = this.extractTextFromResponse(data);

        return {
            rawResponse: data,
            text,
        };
    }
}
