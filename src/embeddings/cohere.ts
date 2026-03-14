import { Embedder } from "../types";
import { RetryOptions, withRetry } from "../utils/retry";

export interface CohereEmbeddingsOptions {
    apiKey?: string;
    model?: string;
    inputType?: "search_document" | "search_query" | "classification" | "clustering";
    baseUrl?: string;
    retry?: RetryOptions;
}

export class CohereEmbedder implements Embedder {
    private apiKey: string;
    private model: string;
    private inputType: string;
    private baseUrl: string;
    private retryOpts: RetryOptions;

    constructor(options: CohereEmbeddingsOptions = {}) {
        this.apiKey = options.apiKey || process.env.COHERE_API_KEY || "";
        this.model = options.model || "embed-english-v3.0";
        this.inputType = options.inputType || "search_document";
        this.baseUrl = options.baseUrl || "https://api.cohere.ai/v1";
        this.retryOpts = options.retry ?? {};

        if (!this.apiKey) {
            console.warn("CohereEmbedder: No API key provided.");
        }
    }

    public async embed(text: string): Promise<number[]> {
        const res = await this.embedBatch([text]);
        return res[0];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        return withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/embed`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    texts,
                    model: this.model,
                    input_type: this.inputType,
                }),
            });

            if (!res.ok) {
                throw new Error(`Cohere Embedding failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            return data.embeddings;
        }, this.retryOpts);
    }
}
