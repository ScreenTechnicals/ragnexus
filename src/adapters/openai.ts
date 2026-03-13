import { RAGEngine } from "../core/rag-engine";
import { RAGQueryOptions } from "../types";

/**
 * Adapter for OpenAI native client compatibility.
 * Useful when users are interacting with OpenAI directly instead of the Vercel AI SDK.
 */
export class OpenAIAdapter {
    private engine: RAGEngine;

    constructor(engine: RAGEngine) {
        this.engine = engine;
    }

    /**
     * Returns a modified parameters object for `openai.chat.completions.create(...)`
     */
    public async getCompletionConfig(
        chatCompletionParams: any,
        ragOptions: Omit<RAGQueryOptions, "messages">
    ): Promise<any> {
        const rawMessages = chatCompletionParams.messages || [];

        // Inject the ContextKit memory and retrieved docs into the messages
        const enrichedMessages = await this.engine.buildContext({
            messages: rawMessages,
            ...ragOptions,
        });

        return {
            ...chatCompletionParams,
            messages: enrichedMessages,
        };
    }
}
