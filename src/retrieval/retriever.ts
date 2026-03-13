import { Guardrails } from "../core/guardrails";
import { Embedder, RAGDocument, VectorStore } from "../types";

export interface RetrieverOptions {
    topK?: number;
}

export class Retriever {
    private vectorStore: VectorStore;
    private embedder: Embedder;
    private guardrails: Guardrails;

    constructor(vectorStore: VectorStore, embedder: Embedder, guardrails: Guardrails) {
        this.vectorStore = vectorStore;
        this.embedder = embedder;
        this.guardrails = guardrails;
    }

    /**
     * Full retrieval pipeline:
     * 1. Embed query
     * 2. Semantic search
     * 3. (Optional Rerank)
     * 4. Context Poisoning Check (Layer 1 & 3 via Guardrails)
     */
    public async retrieve(query: string, options?: RetrieverOptions): Promise<RAGDocument[]> {
        // 1. Embed
        const queryVector = await this.embedder.embed(query);

        // 2. Search
        const topK = options?.topK ?? 5;
        const rawResults = await this.vectorStore.search(queryVector, topK);

        // 3. Rerank (Stub for now, could integrate Cohere/Jina)
        const rankedResults = this.rerank(query, rawResults);

        // 4. Guardrails processing (relevance filter + instruction strip)
        const safeResults = this.guardrails.processRetrievedDocs(rankedResults);

        return safeResults;
    }

    private rerank(query: string, docs: RAGDocument[]): RAGDocument[] {
        // Basic implementation: trust the vector store ordering
        // In production, we'd use a cross-encoder model here
        return docs;
    }
}
