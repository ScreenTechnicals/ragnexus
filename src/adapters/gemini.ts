import { RAGEngine } from "../core/rag-engine";
import { RAGQueryOptions } from "../types";

export class GeminiAdapter {
    private engine: RAGEngine;

    constructor(engine: RAGEngine) {
        this.engine = engine;
    }

    /**
     * Adapts RagNexus messages to the @google/genai SDK format
     */
    public async getCompletionConfig(
        messages: any[],
        ragOptions: Omit<RAGQueryOptions, "messages">,
        model: string = "gemini-2.0-flash"
    ): Promise<any> {
        // 1. Get standard Vercel AI / OpenAI shaped messages from RagNexus
        const enrichedMessages = await this.engine.buildContext({
            messages,
            ...ragOptions,
        });

        // 2. Map them to Gemini SDK's expected structure
        // Gemini handles System instructions separately
        const systemMessages = enrichedMessages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
        const chatMessages = enrichedMessages.filter(m => m.role !== "system").map(m => ({
            role: m.role === "assistant" ? "model" : "user", // Gemini uses 'model' instead of 'assistant'
            parts: [{ text: m.content }]
        }));

        const config: any = {
            contents: chatMessages,
        };

        if (systemMessages) {
            config.systemInstruction = {
                role: "system",
                parts: [{ text: systemMessages }]
            };
        }

        return config;
    }
}
