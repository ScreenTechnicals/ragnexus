import { MemoryFact, RAGDocument, RAGMessage } from "../types";
import { Guardrails } from "./guardrails";

/**
 * GROUNDING_PREFIX — prepended to every system message when RAG context is injected.
 * Explicitly instructs the model to stay within retrieved context and avoid hallucination.
 */
const GROUNDING_PREFIX = `You are a precise, grounded assistant. Follow these rules strictly:
1. Answer ONLY using the retrieved context provided below.
2. If the context does not contain the answer, say exactly: "I don't have enough information to answer that based on the provided documents."
3. Do NOT speculate, infer beyond what is stated, or use your general training knowledge to fill gaps.
4. Always be concise — avoid padding, repetition, or unnecessary elaboration.
5. If you cite a fact, it must be traceable to a specific document number in the context.`;

/**
 * NO_CONTEXT_NOTICE — injected when retrieval returns zero usable documents.
 * This prevents the model from hallucinating an answer from training data.
 */
const NO_CONTEXT_NOTICE = `[SYSTEM NOTICE] No relevant documents were retrieved for this query.
You MUST respond with: "I don't have enough information to answer that based on the available documents."
Do NOT attempt to answer from your general knowledge.`;

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
     * - When docs are found: prepends grounding instructions + sandboxed context
     * - When NO docs are found: injects a strict "no context" notice that
     *   instructs the model not to answer from training data
     */
    public injectIntoMessages(
        messages: RAGMessage[],
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): RAGMessage[] {
        const parts = this.buildContextParts(systemPrompt, memories, retrievedDocs);
        const hasContext = retrievedDocs.length > 0;

        // Always inject either grounding + context OR the no-context notice
        const injection = hasContext
            ? [GROUNDING_PREFIX, ...parts].join("\n\n---\n\n")
            : NO_CONTEXT_NOTICE;

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
