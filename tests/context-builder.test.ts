import { describe, it, expect } from "vitest";
import { ContextBuilder } from "../src/core/context-builder";
import { Guardrails } from "../src/core/guardrails";
import { MemoryFact, RAGDocument, RAGMessage } from "../src/types";

function makeBuilder(opts?: Parameters<typeof Guardrails>[0]) {
    return new ContextBuilder(new Guardrails(opts));
}

function doc(id: string, text: string, score?: number, source?: string): RAGDocument {
    return { id, text, score, source };
}

function memory(content: string, importance: number): MemoryFact {
    return {
        id: `m-${Math.random()}`,
        type: "fact",
        userId: "user-1",
        content,
        importance,
        createdAt: Date.now(),
    };
}

describe("ContextBuilder", () => {
    describe("injectIntoMessages", () => {
        it("should return messages unchanged when no context is available", () => {
            const builder = makeBuilder();
            const messages: RAGMessage[] = [
                { role: "user", content: "Hey!" },
            ];

            const result = builder.injectIntoMessages(messages, undefined, [], []);
            expect(result).toEqual(messages);
        });

        it("should inject system prompt when provided with no docs", () => {
            const builder = makeBuilder();
            const messages: RAGMessage[] = [
                { role: "user", content: "Hello" },
            ];

            const result = builder.injectIntoMessages(messages, "You are a helpful bot.", [], []);
            expect(result[0].role).toBe("system");
            expect(result[0].content).toContain("You are a helpful bot.");
        });

        it("should inject retrieved docs into existing system message", () => {
            const builder = makeBuilder();
            const messages: RAGMessage[] = [
                { role: "system", content: "You are helpful." },
                { role: "user", content: "What is RagNexus?" },
            ];

            const docs = [doc("1", "RagNexus is a RAG SDK.", 0.9)];
            const result = builder.injectIntoMessages(messages, undefined, [], docs);

            expect(result[0].role).toBe("system");
            expect(result[0].content).toContain("RETRIEVED CONTEXT");
            expect(result[0].content).toContain("RagNexus is a RAG SDK.");
            expect(result[0].content).toContain("You are helpful.");
        });

        it("should prepend system message when none exists", () => {
            const builder = makeBuilder();
            const messages: RAGMessage[] = [
                { role: "user", content: "What is RAG?" },
            ];

            const docs = [doc("1", "RAG stands for Retrieval-Augmented Generation.", 0.95)];
            const result = builder.injectIntoMessages(messages, undefined, [], docs);

            expect(result).toHaveLength(2);
            expect(result[0].role).toBe("system");
            expect(result[1].role).toBe("user");
        });

        it("should include grounding instruction only when docs are present", () => {
            const builder = makeBuilder();
            const msgs: RAGMessage[] = [{ role: "user", content: "hi" }];

            // With docs
            const withDocs = builder.injectIntoMessages(msgs, "Be helpful", [], [doc("1", "info", 0.9)]);
            expect(withDocs[0].content).toContain("prioritise the retrieved documents");

            // Without docs (just system prompt)
            const noDocs = builder.injectIntoMessages(msgs, "Be helpful", [], []);
            expect(noDocs[0].content).not.toContain("prioritise the retrieved documents");
        });

        it("should inject memory facts sorted by importance", () => {
            const builder = makeBuilder();
            const messages: RAGMessage[] = [{ role: "user", content: "test" }];
            const memories = [
                memory("User likes TypeScript", 0.5),
                memory("User prefers dark mode", 0.9),
            ];

            const result = builder.injectIntoMessages(messages, undefined, memories, []);
            const systemContent = result[0].content as string;
            expect(systemContent).toContain("Relevant memory");
            // Higher importance should come first
            const darkModeIdx = systemContent.indexOf("dark mode");
            const tsIdx = systemContent.indexOf("TypeScript");
            expect(darkModeIdx).toBeLessThan(tsIdx);
        });
    });

    describe("buildPrompt", () => {
        it("should combine system, memory, docs, and query", () => {
            const builder = makeBuilder();
            const result = builder.buildPrompt(
                "You are a helpful assistant.",
                [memory("User likes concise answers", 0.8)],
                [doc("1", "Important fact.", 0.9)],
                "What should I know?"
            );

            expect(result).toContain("You are a helpful assistant.");
            expect(result).toContain("concise answers");
            expect(result).toContain("Important fact.");
            expect(result).toContain("What should I know?");
        });
    });
});
