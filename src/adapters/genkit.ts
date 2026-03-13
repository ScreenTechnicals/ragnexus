import { RAGEngine } from "../core/rag-engine";
import { RAGQueryOptions } from "../types";

/**
 * Adapter for Google Genkit framework.
 */
export class GenkitAdapter {
    private engine: RAGEngine;

    constructor(engine: RAGEngine) {
        this.engine = engine;
    }

    /**
     * Genkit's `generate()` function accepts a `messages` array in its payload.
     * This prepares the payload for Genkit.
     */
    public async getGenerateOptions(
        generateOptions: any,
        ragOptions: Omit<RAGQueryOptions, "messages">
    ): Promise<any> {
        const rawMessages = generateOptions.messages || [];

        // Assuming Genkit uses an AI SDK compatible message format { role, content } internally
        // or we might need minor mapping. Usually standard text blocks are similar.
        const enrichedMessages = await this.engine.buildContext({
            messages: rawMessages,
            ...ragOptions,
        });

        return {
            ...generateOptions,
            messages: enrichedMessages,
        };
    }
}
