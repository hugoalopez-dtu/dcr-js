import { LLMProvider, type LLMProviderConfig, type LLMResponse } from "./llmProvider";

function extractOutputText(data: any): string {
    const messageItem = data.output?.find((item: any) => item.type === "message");
    if (!messageItem) {
        throw new Error("No message item found in OpenAI response output");
    }
    return messageItem.content[0].text;
}

export class OpenAIProvider extends LLMProvider {
    constructor(config: LLMProviderConfig) {
        super(config);
    }

    async call(prompt: string, options?: Record<string, any>): Promise<LLMResponse> {
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.apiKey}`,
                ...(options?.headers || {}),
            },
            body: JSON.stringify({
                model: this.config.model,
                input: prompt,
                ...(options?.body || {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const text = extractOutputText(data);

        return {
            rawResponse: data,
            text,
        };
    }
}
