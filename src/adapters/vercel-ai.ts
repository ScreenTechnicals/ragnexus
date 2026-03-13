import { RAGEngine } from "../core/rag-engine";
import { RAGQueryOptions } from "../types";

/**
 * Adapter for Vercel AI SDK compatibility.
 * This takes your standard createRag() instance and allows you to
 * wrap the AI SDK calls natively.
 */
export class VercelAIAdapter {
    private engine: RAGEngine;

    constructor(engine: RAGEngine) {
        this.engine = engine;
    }

    /**
     * Used before calling `streamText` or `generateText`.
     * Given messages, it builds the safe RAG context and returns the augmented message array.
     */
    public async getMessages(options: RAGQueryOptions): Promise<any[]> {
        return this.engine.buildContext(options);
    }

    /**
     * Higher order wrapper. Can wrap the `streamText` natively.
     * `options` are properties that apply to both AI SDK and the RAGEngine.
     */
    public async streamTextWithContext(
        aiSdkStreamText: any,
        options: any,
        ragOptions: Omit<RAGQueryOptions, "messages">
    ) {
        const enrichedMessages = await this.engine.buildContext({
            messages: options.messages,
            ...ragOptions,
        });

        return aiSdkStreamText({
            ...options,
            messages: enrichedMessages,
        });
    }
}
