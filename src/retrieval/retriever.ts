import { Guardrails } from "../core/guardrails";
import { Embedder, RAGDocument, Reranker, SearchMode, VectorStore } from "../types";

export interface RetrieverOptions {
    topK?: number;
    searchMode?: SearchMode;
    alpha?: number;
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
     * 1. Embed query (skipped for pure keyword mode)
     * 2. Vector / keyword / hybrid search
     * 3. Cross-encoder rerank (if configured)
     * 4. Guardrails (relevance filter, density rejection, instruction strip)
     */
    public async retrieve(query: string, options?: RetrieverOptions): Promise<RAGDocument[]> {
        const topK = options?.topK ?? 5;
        const searchMode = options?.searchMode ?? 'semantic';
        const alpha = options?.alpha ?? 0.5;

        // Fetch more candidates when a reranker will trim the list
        const fetchK = this.reranker ? Math.max(topK * 3, 20) : topK;

        let rawResults: RAGDocument[];

        if (searchMode !== 'semantic' && this.vectorStore.searchByText) {
            // Use text-based search for keyword/hybrid modes
            rawResults = await this.vectorStore.searchByText(query, fetchK, searchMode, alpha);
        } else {
            // Default semantic search: embed query then search by vector
            const queryVector = await this.embedder.embed(query);
            rawResults = await this.vectorStore.search(queryVector, fetchK);
        }

        // 3. Rerank (cross-encoder) then trim to topK
        const rankedResults = this.reranker
            ? (await this.reranker.rerank(query, rawResults)).slice(0, topK)
            : rawResults;

        // 4. Guardrails
        return this.guardrails.processRetrievedDocs(rankedResults);
    }
}
