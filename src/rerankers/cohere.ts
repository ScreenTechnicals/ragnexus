import { CohereClientV2 } from "cohere-ai";
import { RAGDocument, Reranker } from "../types";

export interface CohereRerankerOptions {
    /** Cohere API key. Falls back to COHERE_API_KEY env var. */
    apiKey?: string;
    /** Model to use for reranking. Default: 'rerank-v3.5' */
    model?: string;
    /**
     * Maximum number of documents to return after reranking.
     * If not set, returns all documents in reranked order.
     */
    topN?: number;
}

/**
 * CohereReranker — a cross-encoder reranker using the Cohere Rerank API.
 *
 * Unlike the bi-encoder used for vector search (which compares query and doc
 * embeddings independently), a cross-encoder scores the (query, doc) pair
 * jointly — this is much more precise but slower, so it's applied AFTER the
 * initial vector retrieval to reorder a small candidate set.
 *
 * Usage:
 *   const reranker = new CohereReranker({ topN: 3 });
 *   const rag = createRag({ ..., reranker });
 */
export class CohereReranker implements Reranker {
    private client: CohereClientV2;
    private model: string;
    private topN?: number;

    constructor(options: CohereRerankerOptions = {}) {
        const apiKey = options.apiKey ?? process.env.COHERE_API_KEY;
        if (!apiKey) {
            throw new Error(
                "CohereReranker requires an API key. Pass apiKey or set COHERE_API_KEY."
            );
        }
        this.client = new CohereClientV2({ token: apiKey });
        this.model = options.model ?? "rerank-v3.5";
        this.topN = options.topN;
    }

    /**
     * Rerank docs using Cohere's cross-encoder model.
     * Returns docs sorted by relevance (highest first), with updated `score`.
     */
    public async rerank(query: string, docs: RAGDocument[]): Promise<RAGDocument[]> {
        if (!docs.length) return docs;

        const response = await this.client.rerank({
            model: this.model,
            query,
            documents: docs.map(d => d.text),
            topN: this.topN ?? docs.length,
        });

        // Map rerank results back to RAGDocuments with updated scores
        return (response.results ?? []).map(result => ({
            ...docs[result.index],
            score: result.relevanceScore,
        }));
    }
}
