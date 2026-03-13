import { MemoryFact, RAGDocument, RAGMessage } from "../types";
import { Guardrails } from "./guardrails";

export class ContextBuilder {
    private guardrails: Guardrails;

    constructor(guardrails: Guardrails) {
        this.guardrails = guardrails;
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Build a standalone prompt string (useful for single-turn APIs).
     */
    public buildPrompt(
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[],
        userQuery: string
    ): string {
        const parts = this.buildContextParts(systemPrompt, memories, retrievedDocs);
        parts.push(`User:\n${userQuery}`);
        return parts.join("\n\n---\n\n");
    }

    /**
     * Inject RAG context into a messages array (Vercel AI SDK / Genkit format).
     * Prepends or augments the system message with memory + retrieved docs.
     */
    public injectIntoMessages(
        messages: RAGMessage[],
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): RAGMessage[] {
        const parts = this.buildContextParts(systemPrompt, memories, retrievedDocs);
        if (!parts.length) return [...messages];

        const injected = parts.join("\n\n---\n\n");
        const newMessages = [...messages];
        const sysIdx = newMessages.findIndex((m) => m.role === "system");

        if (sysIdx >= 0) {
            newMessages[sysIdx] = {
                ...newMessages[sysIdx],
                content: `${newMessages[sysIdx].content}\n\n${injected}`,
            };
        } else {
            newMessages.unshift({ role: "system", content: injected });
        }

        return newMessages;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Shared core: assembles the ordered list of context parts.
     * Used by both buildPrompt() and injectIntoMessages() to avoid duplication.
     */
    private buildContextParts(
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): string[] {
        const parts: string[] = [];

        if (systemPrompt) {
            parts.push(systemPrompt);
        }

        if (memories && memories.length > 0) {
            const memoryText = memories
                .sort((a, b) => b.importance - a.importance)
                .map((m) => `- ${m.content}`)
                .join("\n");
            parts.push(`Relevant memory about the user:\n${memoryText}`);
        }

        if (retrievedDocs && retrievedDocs.length > 0) {
            parts.push(this.guardrails.sandboxContext(retrievedDocs));
        }

        return parts;
    }
}
