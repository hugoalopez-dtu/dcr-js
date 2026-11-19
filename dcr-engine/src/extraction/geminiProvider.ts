import { LLMProvider, type LLMProviderConfig, type LLMResponse } from "./llmProvider";

export class GeminiProvider extends LLMProvider {
    constructor(config: LLMProviderConfig) {
        super(config);
    }

    private extractTextFromResponse(data: any): string {
        if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
                const textParts = candidate.content.parts
                    .filter((part: any) => part.text)
                    .map((part: any) => part.text)
                    .join("");
                if (textParts) {
                    return textParts;
                }
            }
        }
        if (data.text) {
            return data.text;
        }
        throw new Error("No text content found in Gemini response");
    }

    async call(prompt: string, options?: Record<string, any>): Promise<LLMResponse> {
        const model = this.config.model;
        const baseUrl = this.config.baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const url = `${baseUrl}?key=${this.config.apiKey}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(options?.headers || {}),
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                ...(options?.body || {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = this.extractTextFromResponse(data);

        return {
            rawResponse: data,
            text,
        };
    }
}
