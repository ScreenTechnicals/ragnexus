import { describe, it, expect, vi } from "vitest";
import { Retriever } from "../src/retrieval/retriever";
import { Guardrails } from "../src/core/guardrails";
import { Embedder, RAGDocument, Reranker, VectorStore } from "../src/types";

function createMockEmbedder(): Embedder {
    return {
        embed: vi.fn(async () => [0.5, 0.5, 0.5, 0.5]),
    };
}

function createMockVectorStore(docs: RAGDocument[]): VectorStore {
    return {
        add: vi.fn(),
        upsert: vi.fn(async () => ({ added: 0, updated: 0, skipped: 0 })),
        delete: vi.fn(),
        search: vi.fn(async (_vec: number[], topK?: number) => docs.slice(0, topK ?? 5)),
        searchByText: vi.fn(async (query: string, topK?: number) => docs.slice(0, topK ?? 5)),
    };
}

function doc(id: string, text: string, score: number): RAGDocument {
    return { id, text, score };
}

describe("Retriever", () => {
    it("should run the full retrieval pipeline: embed → search → guardrails", async () => {
        const embedder = createMockEmbedder();
        const docs = [doc("1", "relevant result", 0.9), doc("2", "another result", 0.7)];
        const store = createMockVectorStore(docs);
        const guardrails = new Guardrails({ minRelevanceScore: 0.5 });

        const retriever = new Retriever(store, embedder, guardrails);
        const results = await retriever.retrieve("test query");

        expect(embedder.embed).toHaveBeenCalledWith("test query");
        expect(store.search).toHaveBeenCalled();
        expect(results).toHaveLength(2);
        expect(results.every(r => r.source)).toBe(true); // guardrails assigns default source
    });

    it("should respect topK option", async () => {
        const docs = [doc("1", "a", 0.9), doc("2", "b", 0.8), doc("3", "c", 0.7)];
        const retriever = new Retriever(
            createMockVectorStore(docs),
            createMockEmbedder(),
            new Guardrails()
        );

        const results = await retriever.retrieve("test", { topK: 2 });
        expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should filter low-relevance docs via guardrails", async () => {
        const docs = [doc("1", "good", 0.9), doc("2", "bad", 0.1)];
        const retriever = new Retriever(
            createMockVectorStore(docs),
            createMockEmbedder(),
            new Guardrails({ minRelevanceScore: 0.5 })
        );

        const results = await retriever.retrieve("test");
        expect(results.find(r => r.id === "2")).toBeUndefined();
    });

    it("should use reranker when provided", async () => {
        const docs = [doc("1", "first", 0.5), doc("2", "second", 0.6)];
        const reranker: Reranker = {
            rerank: vi.fn(async (_query, docs) =>
                // Reverse order and assign new scores
                [...docs].reverse().map((d, i) => ({ ...d, score: 1 - i * 0.1 }))
            ),
        };
        const store = createMockVectorStore(docs);

        const retriever = new Retriever(store, createMockEmbedder(), new Guardrails(), reranker);
        const results = await retriever.retrieve("test", { topK: 2 });

        expect(reranker.rerank).toHaveBeenCalled();
        // Store should have fetched more candidates (3x topK or min 20)
        const searchCall = (store.search as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(searchCall[1]).toBeGreaterThanOrEqual(6); // at least topK * 3
    });

    it("should use searchByText for keyword mode", async () => {
        const docs = [doc("1", "keyword result", 0.8)];
        const store = createMockVectorStore(docs);
        const embedder = createMockEmbedder();

        const retriever = new Retriever(store, embedder, new Guardrails());
        await retriever.retrieve("test query", { searchMode: "keyword" });

        expect(store.searchByText).toHaveBeenCalled();
        // Should NOT call embed for keyword mode
        expect(embedder.embed).not.toHaveBeenCalled();
    });

    it("should use searchByText for hybrid mode", async () => {
        const docs = [doc("1", "hybrid result", 0.8)];
        const store = createMockVectorStore(docs);

        const retriever = new Retriever(store, createMockEmbedder(), new Guardrails());
        await retriever.retrieve("test query", { searchMode: "hybrid", alpha: 0.7 });

        expect(store.searchByText).toHaveBeenCalledWith("test query", expect.any(Number), "hybrid", 0.7);
    });

    it("should fall back to semantic search when searchByText is not available", async () => {
        const docs = [doc("1", "result", 0.9)];
        const store: VectorStore = {
            add: vi.fn(),
            upsert: vi.fn(async () => ({ added: 0, updated: 0, skipped: 0 })),
            delete: vi.fn(),
            search: vi.fn(async () => docs),
            // No searchByText
        };

        const embedder = createMockEmbedder();
        const retriever = new Retriever(store, embedder, new Guardrails());
        const results = await retriever.retrieve("test", { searchMode: "hybrid" });

        // Falls back to embed + search since searchByText is undefined
        expect(embedder.embed).toHaveBeenCalled();
        expect(store.search).toHaveBeenCalled();
        expect(results).toHaveLength(1);
    });
});
