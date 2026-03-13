import { MemoryFact, RAGDocument } from "../types";
import { Guardrails } from "./guardrails";

export class ContextBuilder {
    private guardrails: Guardrails;

    constructor(guardrails: Guardrails) {
        this.guardrails = guardrails;
    }

    /**
     * Deterministically assemble the full context payload.
     * Format:
     * SYSTEM
     * ↓
     * MEMORY
     * ↓
     * RETRIEVED DOCS
     * ↓
     * USER MESSAGE
     */
    public buildPrompt(
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[],
        userQuery: string
    ): string {
        const parts: string[] = [];

        // 1. System Prompt
        if (systemPrompt) {
            parts.push(systemPrompt);
        }

        // 2. Memory
        if (memories && memories.length > 0) {
            const memoryText = memories
                .sort((a, b) => b.importance - a.importance) // Most important first
                .map((m) => `- ${m.content}`)
                .join("\n");

            parts.push(`Relevant memory about the user:\n${memoryText}`);
        }

        // 3. Retrieved Docs (Sandboxed by Guardrails)
        if (retrievedDocs && retrievedDocs.length > 0) {
            const sandboxText = this.guardrails.sandboxContext(retrievedDocs);
            parts.push(sandboxText);
        }

        // 4. User Message
        parts.push(`User:\n${userQuery}`);

        return parts.join("\n\n---\n\n");
    }

    /**
     * Inject into AI SDK Messages array.
     * By convention, we can prepend a system message, or combine it.
     */
    public injectIntoMessages(
        messages: any[],
        systemPrompt: string | undefined,
        memories: MemoryFact[],
        retrievedDocs: RAGDocument[]
    ): any[] {
        const newMessages = [...messages];

        // Find if there's an existing system message
        let systemMessageIndex = newMessages.findIndex((m) => m.role === "system");

        // We will build the context to append to the system prompt
        const parts: string[] = [];
        if (systemPrompt) parts.push(systemPrompt);

        if (memories && memories.length > 0) {
            const memoryText = memories
                .sort((a, b) => b.importance - a.importance)
                .map((m) => `- ${m.content}`)
                .join("\n");
            parts.push(`Relevant memory about the user:\n${memoryText}`);
        }

        if (retrievedDocs && retrievedDocs.length > 0) {
            const sandboxText = this.guardrails.sandboxContext(retrievedDocs);
            parts.push(sandboxText);
        }

        const injectedSystemContent = parts.join("\n\n---\n\n");

        if (injectedSystemContent) {
            if (systemMessageIndex >= 0) {
                newMessages[systemMessageIndex] = {
                    ...newMessages[systemMessageIndex],
                    content: `${newMessages[systemMessageIndex].content}\n\n${injectedSystemContent}`,
                };
            } else {
                newMessages.unshift({
                    role: "system",
                    content: injectedSystemContent,
                });
            }
        }

        return newMessages;
    }
}
