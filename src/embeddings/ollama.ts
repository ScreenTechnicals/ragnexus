import { Embedder } from "../types";

export interface OllamaEmbeddingsOptions {
    model?: string;
    baseUrl?: string;
}

export class OllamaEmbedder implements Embedder {
    private model: string;
    private baseUrl: string;

    constructor(options: OllamaEmbeddingsOptions = {}) {
        this.model = options.model || "llama3";
        this.baseUrl = options.baseUrl || "http://localhost:11434/api";
    }

    public async embed(text: string): Promise<number[]> {
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
            throw new Error(`Ollama Embedding failed: ${res.statusText}`);
        }

        const data = await res.json();
        return data.embedding;
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        // Ollama's default embeddings API typically handles one prompt at a time
        // We will execute them concurrently.
        const promises = texts.map((text) => this.embed(text));
        return Promise.all(promises);
    }
}
