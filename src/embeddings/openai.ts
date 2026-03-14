import { Embedder } from "../types";
import { RetryOptions, withRetry } from "../utils/retry";

export interface OpenAIEmbeddingsOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    retry?: RetryOptions;
}

export class OpenAIEmbedder implements Embedder {
    private apiKey: string;
    private model: string;
    private baseUrl: string;
    private retryOpts: RetryOptions;

    constructor(options: OpenAIEmbeddingsOptions = {}) {
        this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
        this.model = options.model || "text-embedding-3-small";
        this.baseUrl = options.baseUrl || "https://api.openai.com/v1";
        this.retryOpts = options.retry ?? {};

        if (!this.apiKey) {
            console.warn("OpenAIEmbedder: No API key provided.");
        }
    }

    public async embed(text: string): Promise<number[]> {
        return withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: this.model,
                }),
            });

            if (!res.ok) {
                throw new Error(`OpenAI Embedding failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            return data.data[0].embedding;
        }, this.retryOpts);
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        return withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    input: texts,
                    model: this.model,
                }),
            });

            if (!res.ok) {
                throw new Error(`OpenAI Embedding failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            return data.data.map((item: any) => item.embedding);
        }, this.retryOpts);
    }
}
