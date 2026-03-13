import { Embedder } from "../types";

export interface GeminiEmbeddingsOptions {
    apiKey?: string;
    model?: string;
}

export class GeminiEmbedder implements Embedder {
    private apiKey: string;
    private model: string;

    constructor(options: GeminiEmbeddingsOptions = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
        this.model = options.model || "text-embedding-004";

        if (!this.apiKey) {
            console.warn("GeminiEmbedder: No API key provided.");
        }
    }

    public async embed(text: string): Promise<number[]> {
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
            throw new Error(`Gemini Embedding failed: ${res.statusText}`);
        }

        const data = await res.json();
        return data.embedding.values;
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        // execute concurrently
        const promises = texts.map((text) => this.embed(text));
        return Promise.all(promises);
    }
}
