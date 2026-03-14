import { Embedder } from "../types";
import { RetryOptions, withRetry } from "../utils/retry";

export interface OllamaEmbeddingsOptions {
    model?: string;
    baseUrl?: string;
    retry?: RetryOptions;
}

export class OllamaEmbedder implements Embedder {
    private model: string;
    private baseUrl: string;
    private retryOpts: RetryOptions;

    constructor(options: OllamaEmbeddingsOptions = {}) {
        this.model = options.model || "llama3";
        this.baseUrl = options.baseUrl || "http://localhost:11434/api";
        this.retryOpts = options.retry ?? {};
    }

    public async embed(text: string): Promise<number[]> {
        return withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: text,
                }),
            });

            if (!res.ok) {
                throw new Error(`Ollama Embedding failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            return data.embedding;
        }, this.retryOpts);
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const promises = texts.map((text) => this.embed(text));
        return Promise.all(promises);
    }
}
