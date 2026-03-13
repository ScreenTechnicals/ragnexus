import { Guardrails } from "../core/guardrails";
import { Embedder, RAGDocument, Reranker, VectorStore } from "../types";

export interface RetrieverOptions {
    topK?: number;
}

export class Retriever {
    private vectorStore: VectorStore;
    private embedder: Embedder;
    private guardrails: Guardrails;
    private reranker?: Reranker;

    constructor(
        vectorStore: VectorStore,
        embedder: Embedder,
        guardrails: Guardrails,
        reranker?: Reranker
    ) {
        this.vectorStore = vectorStore;
        this.embedder = embedder;
        this.guardrails = guardrails;
        this.reranker = reranker;
    }

    /**
     * Full retrieval pipeline:
     * 1. Embed query
     * 2. Vector / hybrid search
     * 3. Cross-encoder rerank (if configured)
     * 4. Guardrails (relevance filter, density rejection, instruction strip)
     */
    public async retrieve(query: string, options?: RetrieverOptions): Promise<RAGDocument[]> {
        const topK = options?.topK ?? 5;

        // 1. Embed
        const queryVector = await this.embedder.embed(query);

        // 2. Search — fetch more candidates when a reranker will trim the list
        const fetchK = this.reranker ? Math.max(topK * 3, 20) : topK;
        const rawResults = await this.vectorStore.search(queryVector, fetchK);

        // 3. Rerank (cross-encoder) then trim to topK
        const rankedResults = this.reranker
            ? (await this.reranker.rerank(query, rawResults)).slice(0, topK)
            : rawResults;

        // 4. Guardrails
        return this.guardrails.processRetrievedDocs(rankedResults);
    }
}
