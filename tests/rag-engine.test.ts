import { describe, it, expect, vi } from "vitest";
import { RAGEngine } from "../src/core/rag-engine";
import { Embedder, RAGDocument, UpsertResult, VectorStore } from "../src/types";

function mockEmbedder(): Embedder {
    return {
        embed: vi.fn(async () => [0.5, 0.5, 0.5]),
        embedBatch: vi.fn(async (texts) => texts.map(() => [0.5, 0.5, 0.5])),
    };
}

function mockVectorStore(searchResults: RAGDocument[] = []): VectorStore {
    return {
        add: vi.fn(),
        upsert: vi.fn(async () => ({ added: 1, updated: 0, skipped: 0 })),
        delete: vi.fn(),
        search: vi.fn(async () => searchResults),
    };
}

describe("RAGEngine EventEmitter", () => {
    it("should emit 'retrieve' event when docs are retrieved", async () => {
        const docs = [{ id: "1", text: "hello", score: 0.9 }];
        const engine = new RAGEngine({
            storage: { vector: mockVectorStore(docs) },
            embedder: mockEmbedder(),
        });

        const handler = vi.fn();
        engine.on("retrieve", handler);

        await engine.buildContext({
            messages: [{ role: "user", content: "test" }],
        });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toHaveLength(1);
        expect(handler.mock.calls[0][0][0].id).toBe("1");
    });

    it("should not emit 'retrieve' when no docs are found", async () => {
        const engine = new RAGEngine({
            storage: { vector: mockVectorStore([]) },
            embedder: mockEmbedder(),
        });

        const handler = vi.fn();
        engine.on("retrieve", handler);

        await engine.buildContext({
            messages: [{ role: "user", content: "test" }],
        });

        expect(handler).not.toHaveBeenCalled();
    });

    it("should emit 'upsert' event after upsertDocuments", async () => {
        const store = mockVectorStore();
        const engine = new RAGEngine({
            storage: { vector: store },
            embedder: mockEmbedder(),
        });

        const handler = vi.fn();
        engine.on("upsert", handler);

        await engine.upsertDocuments([{ id: "1", text: "hello" }]);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual({ added: 1, updated: 0, skipped: 0 });
    });

    it("should emit 'guardrail:reject' when a doc is filtered by relevance", async () => {
        const lowScoreDoc = { id: "low", text: "irrelevant", score: 0.1 };
        const engine = new RAGEngine({
            storage: { vector: mockVectorStore([lowScoreDoc]) },
            embedder: mockEmbedder(),
            guardrails: { minRelevanceScore: 0.5 },
        });

        const handler = vi.fn();
        engine.on("guardrail:reject", handler);

        await engine.buildContext({
            messages: [{ role: "user", content: "test" }],
        });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].id).toBe("low");
        expect(handler.mock.calls[0][1]).toContain("relevance");
    });

    it("should support legacy onRetrieve callback", async () => {
        const docs = [{ id: "1", text: "data", score: 0.9 }];
        const legacyHandler = vi.fn();

        const engine = new RAGEngine({
            storage: { vector: mockVectorStore(docs) },
            embedder: mockEmbedder(),
            onRetrieve: legacyHandler,
        });

        await engine.buildContext({
            messages: [{ role: "user", content: "test" }],
        });

        expect(legacyHandler).toHaveBeenCalledTimes(1);
    });

    it("should throw VectorStoreError when vector store is not configured", async () => {
        const engine = new RAGEngine({
            storage: {},
            embedder: mockEmbedder(),
        });

        await expect(engine.addDocuments([{ id: "1", text: "test" }]))
            .rejects.toThrow("VectorStore not configured");
    });
});
