import { EmbeddingError } from "../errors";
import { Embedder } from "../types";
import { RetryOptions, withRetry } from "../utils/retry";

export interface GeminiEmbeddingsOptions {
    apiKey?: string;
    model?: string;
    retry?: RetryOptions;
}

export class GeminiEmbedder implements Embedder {
    private apiKey: string;
    private model: string;
    private retryOpts: RetryOptions;

    constructor(options: GeminiEmbeddingsOptions = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
        this.model = options.model || "text-embedding-004";
        this.retryOpts = options.retry ?? {};

        if (!this.apiKey) {
            console.warn("GeminiEmbedder: No API key provided.");
        }
    }

    public async embed(text: string): Promise<number[]> {
        return withRetry(async () => {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: `models/${this.model}`,
                        content: {
                            parts: [{ text }],
                        },
                    }),
                }
            );

            if (!res.ok) {
                throw new EmbeddingError(`Gemini Embedding failed: ${res.status} ${res.statusText}`, { statusCode: res.status });
            }

            const data = await res.json();
            return data.embedding.values;
        }, this.retryOpts);
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const promises = texts.map((text) => this.embed(text));
        return Promise.all(promises);
    }
}
