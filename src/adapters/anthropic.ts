
export interface AnthropicEmbeddingsOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}

export class AnthropicAdapter {
    private engine: any;

    constructor(engine: any) {
        this.engine = engine;
    }

    public async getCompletionConfig(
        messagesParams: any,
        ragOptions: any
    ): Promise<any> {
        const rawMessages = messagesParams.messages || [];

        const enrichedMessages = await this.engine.buildContext({
            messages: rawMessages,
            ...ragOptions,
        });

        // Anthropic separates system prompt
        // Let's filter out system prompt and put it in 'system' if present, or just pass enriched.
        // Actually, buildContext already tries to put it in a "system" role at the front.
        // If the user's Anthropic SDK version handles 'system' role inside messages (as some do now, though usually it's separated),
        // we'll just pass it along like we do for Vercel AI
        return {
            ...messagesParams,
            messages: enrichedMessages,
        };
    }
}
