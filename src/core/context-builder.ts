import { MemoryFact, RAGDocument, RAGMessage } from "../types";
import { Guardrails } from "./guardrails";

/**
 * GROUNDING_INSTRUCTION — appended to the context block (not the full system prompt)
 * ONLY when actual documents were retrieved.
 *
 * The key principle: be a helpful assistant normally, but when you have real retrieved
 * context, stay grounded in it and cite sources rather than hallucinating beyond them.
 */
const GROUNDING_INSTRUCTION = `
When answering, use ONLY the retrieved documents above as your source of truth. You may cite them by document number.
If the user's question cannot be answered from the retrieved context, clearly state that the information was not found in the crawled data.
Do NOT fabricate, guess, or infer content that is not explicitly present in the retrieved documents.`;

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
     *
     * Behaviour:
     * - If docs were retrieved: append the sandboxed context block (+ brief grounding note)
     *   to the existing system message. The model remains fully capable of normal conversation
     *   but is nudged to prefer the retrieved facts.
     * - If NO docs were retrieved: return messages unchanged. The model acts as a normal
     *   assistant — casual greetings, general questions, chitchat all work fine.
     *
     * This prevents the notorious "I don't have enough information" response to "hey hi".
     */
    public injectIntoMessages(
        messages: RAGMessage[],
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): RAGMessage[] {
        // Build the context parts (system prompt + memory + retrieved docs)
        const contextParts = this.buildContextParts(systemPrompt, memories, retrievedDocs);

        // No retrieved docs AND no extra memory/systemPrompt → nothing to inject, leave as-is
        if (contextParts.length === 0) return [...messages];

        // Build the injection string
        // Only append grounding note when actual documents were retrieved
        const hasRetrievedDocs = retrievedDocs.length > 0;
        const injection = hasRetrievedDocs
            ? contextParts.join("\n\n---\n\n") + GROUNDING_INSTRUCTION
            : contextParts.join("\n\n---\n\n");

        const newMessages = [...messages];
        const sysIdx = newMessages.findIndex(m => m.role === "system");

        if (sysIdx >= 0) {
            newMessages[sysIdx] = {
                ...newMessages[sysIdx],
                content: `${newMessages[sysIdx].content}\n\n${injection}`,
            };
        } else {
            newMessages.unshift({ role: "system", content: injection });
        }

        return newMessages;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private buildContextParts(
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): string[] {
        const parts: string[] = [];

        if (systemPrompt) parts.push(systemPrompt);

        if (memories && memories.length > 0) {
            const memoryText = memories
                .sort((a, b) => b.importance - a.importance)
                .map(m => `- ${m.content}`)
                .join("\n");
            parts.push(`Relevant memory about the user:\n${memoryText}`);
        }

        if (retrievedDocs && retrievedDocs.length > 0) {
            parts.push(this.guardrails.sandboxContext(retrievedDocs));
        }

        return parts;
    }
}
