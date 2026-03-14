import { describe, it, expect } from "vitest";
import { TextSplitter } from "../src/utils/text-splitter";
import { RAGDocument } from "../src/types";

describe("TextSplitter", () => {
    describe("splitText", () => {
        it("should return text as-is if under chunk size", () => {
            const splitter = new TextSplitter({ chunkSize: 1000 });
            const result = splitter.splitText("short text");
            expect(result).toEqual(["short text"]);
        });

        it("should split on paragraph boundaries first", () => {
            const splitter = new TextSplitter({ chunkSize: 50, chunkOverlap: 0 });
            const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
            const chunks = splitter.splitText(text);
            expect(chunks.length).toBeGreaterThan(1);
            // Each chunk should be within size limit
            chunks.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(50);
            });
        });

        it("should produce overlapping chunks", () => {
            const splitter = new TextSplitter({ chunkSize: 30, chunkOverlap: 10 });
            const text = "Hello world this is a test of the text splitter functionality.";
            const chunks = splitter.splitText(text);

            if (chunks.length > 1) {
                // The end of chunk[0] should appear at the start of chunk[1]
                const endOfFirst = chunks[0].slice(-10);
                expect(chunks[1].startsWith(endOfFirst)).toBe(true);
            }
        });

        it("should handle zero overlap", () => {
            const splitter = new TextSplitter({ chunkSize: 20, chunkOverlap: 0 });
            const text = "word ".repeat(20);
            const chunks = splitter.splitText(text.trim());
            expect(chunks.length).toBeGreaterThan(1);
        });

        it("should throw if overlap >= chunkSize", () => {
            expect(() => new TextSplitter({ chunkSize: 10, chunkOverlap: 10 })).toThrow();
            expect(() => new TextSplitter({ chunkSize: 10, chunkOverlap: 15 })).toThrow();
        });
    });

    describe("splitDocuments", () => {
        it("should not split documents that fit in one chunk", () => {
            const splitter = new TextSplitter({ chunkSize: 1000 });
            const docs: RAGDocument[] = [{ id: "1", text: "Short doc." }];
            const result = splitter.splitDocuments(docs);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1"); // Original ID preserved
        });

        it("should split large documents into multiple chunks", () => {
            const splitter = new TextSplitter({ chunkSize: 50, chunkOverlap: 10 });
            const docs: RAGDocument[] = [{
                id: "doc-1",
                text: "Lorem ipsum dolor sit amet. ".repeat(20),
                source: "https://example.com",
            }];

            const result = splitter.splitDocuments(docs);
            expect(result.length).toBeGreaterThan(1);
            // Each chunk should have metadata
            result.forEach((chunk, idx) => {
                expect(chunk.metadata?.sourceDocId).toBe("doc-1");
                expect(chunk.metadata?.chunkIndex).toBe(idx);
                expect(chunk.metadata?.totalChunks).toBe(result.length);
                expect(chunk.source).toBe("https://example.com");
            });
        });

        it("should generate deterministic chunk IDs", () => {
            const splitter = new TextSplitter({ chunkSize: 50, chunkOverlap: 0 });
            const docs: RAGDocument[] = [{ id: "doc-1", text: "word ".repeat(100) }];

            const result1 = splitter.splitDocuments(docs);
            const result2 = splitter.splitDocuments(docs);

            expect(result1.map(d => d.id)).toEqual(result2.map(d => d.id));
        });

        it("should preserve metadata from parent document", () => {
            const splitter = new TextSplitter({ chunkSize: 30, chunkOverlap: 0 });
            const docs: RAGDocument[] = [{
                id: "1",
                text: "word ".repeat(50),
                metadata: { author: "test", category: "docs" },
            }];

            const result = splitter.splitDocuments(docs);
            result.forEach(chunk => {
                expect(chunk.metadata?.author).toBe("test");
                expect(chunk.metadata?.category).toBe("docs");
            });
        });
    });
});
