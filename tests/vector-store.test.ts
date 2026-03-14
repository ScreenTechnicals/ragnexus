import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { InMemoryVectorStore } from "../src/storage/vector-store";
import { Embedder, RAGDocument } from "../src/types";

/** Deterministic fake embedder: returns a vector based on doc text length. */
function createMockEmbedder(): Embedder {
    return {
        embed: vi.fn(async (text: string) => {
            // Simple deterministic embedding: normalized character code sums
            const vec = new Array(4).fill(0);
            for (let i = 0; i < text.length; i++) {
                vec[i % 4] += text.charCodeAt(i);
            }
            const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            return norm > 0 ? vec.map(v => v / norm) : vec;
        }),
        embedBatch: vi.fn(async (texts: string[]) => {
            const embedder = createMockEmbedder();
            return Promise.all(texts.map(t => embedder.embed(t)));
        }),
    };
}

function doc(id: string, text: string, extra?: Partial<RAGDocument>): RAGDocument {
    return { id, text, ...extra };
}

describe("InMemoryVectorStore", () => {
    describe("add", () => {
        it("should add documents and make them searchable", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            await store.add([doc("1", "hello world"), doc("2", "foo bar")]);

            const embedder = createMockEmbedder();
            const query = await embedder.embed("hello");
            const results = await store.search(query, 5);

            expect(results).toHaveLength(2);
            expect(results.every(r => r.score !== undefined)).toBe(true);
        });

        it("should skip documents with duplicate IDs", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([doc("1", "hello world")]);
            await store.add([doc("1", "different text"), doc("2", "new doc")]);

            const query = await embedder.embed("test");
            const results = await store.search(query, 10);
            expect(results).toHaveLength(2);
            // Original text should be preserved
            expect(results.find(r => r.id === "1")?.text).toBe("hello world");
        });

        it("should stamp docs with contentHash and updatedAt", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            await store.add([doc("1", "hello world")]);

            const embedder = createMockEmbedder();
            const query = await embedder.embed("hello");
            const results = await store.search(query, 5);

            expect(results[0].contentHash).toBeDefined();
            expect(results[0].updatedAt).toBeDefined();
            expect(typeof results[0].updatedAt).toBe("number");
        });
    });

    describe("upsert", () => {
        it("should add new documents", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            const result = await store.upsert([doc("1", "hello"), doc("2", "world")]);

            expect(result).toEqual({ added: 2, updated: 0, skipped: 0 });
        });

        it("should skip unchanged documents", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            await store.upsert([doc("1", "hello world")]);
            const result = await store.upsert([doc("1", "hello world")]);

            expect(result).toEqual({ added: 0, updated: 0, skipped: 1 });
        });

        it("should update documents with changed content", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.upsert([doc("1", "hello world")]);
            const result = await store.upsert([doc("1", "goodbye world")]);

            expect(result).toEqual({ added: 0, updated: 1, skipped: 0 });

            const query = await embedder.embed("test");
            const results = await store.search(query, 10);
            expect(results.find(r => r.id === "1")?.text).toBe("goodbye world");
        });

        it("should handle mixed add/update/skip in a single call", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            await store.upsert([doc("1", "unchanged"), doc("2", "will change")]);
            const result = await store.upsert([
                doc("1", "unchanged"),   // skip
                doc("2", "changed!"),    // update
                doc("3", "brand new"),   // add
            ]);

            expect(result).toEqual({ added: 1, updated: 1, skipped: 1 });
        });
    });

    describe("delete", () => {
        it("should remove documents by ID", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([doc("1", "hello"), doc("2", "world"), doc("3", "test")]);
            await store.delete(["2"]);

            const query = await embedder.embed("test");
            const results = await store.search(query, 10);
            expect(results).toHaveLength(2);
            expect(results.find(r => r.id === "2")).toBeUndefined();
        });

        it("should handle deleting non-existent IDs gracefully", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            await store.add([doc("1", "hello")]);
            await expect(store.delete(["nonexistent"])).resolves.not.toThrow();
        });
    });

    describe("search", () => {
        it("should return results sorted by score descending", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "quick brown fox"),
                doc("2", "lazy dog"),
                doc("3", "the quick brown fox jumps"),
            ]);

            const query = await embedder.embed("fox");
            const results = await store.search(query, 3);

            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score!).toBeGreaterThanOrEqual(results[i].score!);
            }
        });

        it("should respect topK", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "a"), doc("2", "b"), doc("3", "c"),
                doc("4", "d"), doc("5", "e"),
            ]);

            const query = await embedder.embed("test");
            const results = await store.search(query, 2);
            expect(results).toHaveLength(2);
        });

        it("should filter expired documents", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "active doc"),
                doc("2", "expired doc", { expiresAt: Date.now() - 1000 }),
            ]);

            const query = await embedder.embed("test");
            const results = await store.search(query, 10);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe("1");
        });

        it("should return empty array for empty store", async () => {
            const store = new InMemoryVectorStore(createMockEmbedder());
            const results = await store.search([1, 0, 0, 0], 5);
            expect(results).toEqual([]);
        });
    });

    describe("searchByText (keyword mode)", () => {
        it("should find documents by keyword match", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "machine learning algorithms are powerful"),
                doc("2", "cooking recipes for dinner"),
                doc("3", "deep learning neural networks"),
            ]);

            const results = await store.searchByText("learning algorithms", 5, "keyword");
            expect(results.length).toBeGreaterThan(0);
            // Doc with "machine learning algorithms" should rank highest
            expect(results[0].id).toBe("1");
        });
    });

    describe("searchByText (hybrid mode)", () => {
        it("should return results combining semantic and keyword scores", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "python programming language"),
                doc("2", "javascript framework react"),
                doc("3", "python web framework django"),
            ]);

            const results = await store.searchByText("python framework", 5, "hybrid", 0.5);
            expect(results.length).toBeGreaterThan(0);
            expect(results.every(r => r.score !== undefined)).toBe(true);
        });
    });

    describe("save / load", () => {
        const tmpPath = join(tmpdir(), `ragnexus-test-${Date.now()}.json`);

        afterEach(() => {
            if (existsSync(tmpPath)) unlinkSync(tmpPath);
        });

        it("should save and load a store with identical search results", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "machine learning algorithms"),
                doc("2", "cooking recipes for dinner"),
                doc("3", "deep learning neural networks"),
            ]);

            // Search before save
            const queryVec = await embedder.embed("learning");
            const beforeResults = await store.search(queryVec, 3);

            // Save and load
            await store.save(tmpPath);
            const loaded = await InMemoryVectorStore.load(tmpPath, embedder);

            // Search after load — should produce identical results
            const afterResults = await loaded.search(queryVec, 3);
            expect(afterResults.map(r => r.id)).toEqual(beforeResults.map(r => r.id));
            expect(afterResults.map(r => r.text)).toEqual(beforeResults.map(r => r.text));
        });

        it("should preserve upsert change detection after load", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.upsert([doc("1", "original text")]);

            await store.save(tmpPath);
            const loaded = await InMemoryVectorStore.load(tmpPath, embedder);

            // Same content → should skip
            const result = await loaded.upsert([doc("1", "original text")]);
            expect(result.skipped).toBe(1);

            // Changed content → should update
            const result2 = await loaded.upsert([doc("1", "updated text")]);
            expect(result2.updated).toBe(1);
        });

        it("should support keyword search after load", async () => {
            const embedder = createMockEmbedder();
            const store = new InMemoryVectorStore(embedder);
            await store.add([
                doc("1", "machine learning algorithms"),
                doc("2", "cooking recipes"),
            ]);

            await store.save(tmpPath);
            const loaded = await InMemoryVectorStore.load(tmpPath, embedder);

            const results = await loaded.searchByText("learning", 5, "keyword");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe("1");
        });
    });
});
