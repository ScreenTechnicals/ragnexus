import { MemoryManager } from "../memory/memory-manager";
import { Retriever } from "../retrieval/retriever";
import { Embedder, MemoryStore, RAGDocument, RAGQueryOptions, VectorStore } from "../types";
import { ContextBuilder } from "./context-builder";
import { GuardrailOptions, Guardrails } from "./guardrails";

export interface RAGEngineConfig {
    storage: {
        vectorModel?: VectorStore;          // Changed from vectorStore to vectorModel to match standard config names, but internally we use VectorStore
        vector?: VectorStore;
        memory?: MemoryStore;
    };
    embedder: Embedder;
    guardrails?: GuardrailOptions;
}

export class RAGEngine {
    private vectorStore?: VectorStore;
    private memoryManager?: MemoryManager;
    private embedder: Embedder;

    public guardrails: Guardrails;
    public contextBuilder: ContextBuilder;
    public retriever?: Retriever;

    constructor(config: RAGEngineConfig) {
        this.vectorStore = config.storage.vector ?? config.storage.vectorModel;
        this.embedder = config.embedder;

        if (config.storage.memory) {
            this.memoryManager = new MemoryManager(config.storage.memory);
        }

        this.guardrails = new Guardrails(config.guardrails);
        this.contextBuilder = new ContextBuilder(this.guardrails);

        if (this.vectorStore) {
            this.retriever = new Retriever(this.vectorStore, this.embedder, this.guardrails);
        }
    }

    /**
     * Generates the injected messages array for LLM consumption.
     * Format matches Vercel AI SDK `{ role, content }[]`.
     */
    public async buildContext(options: RAGQueryOptions): Promise<any[]> {
        const { messages, userId, memory = true, systemPrompt } = options;

        // 1. Setup variables
        let retrievedDocs: RAGDocument[] = [];
        let memoryFacts: any[] = [];

        // Extract the latest query
        const userMessage = messages.filter((m) => m.role === "user").pop();
        const query = userMessage?.content ?? "";

        // 2. Retrieve Memory
        if (memory && userId && this.memoryManager) {
            memoryFacts = await this.memoryManager.getMemory(userId);
        }

        // 3. Retrieve Documents
        if (this.retriever && query) {
            retrievedDocs = await this.retriever.retrieve(query);
        }

        // 4. Build and inject context
        // This mutates/copies the messages array to have a fully prepared context
        const enrichedMessages = this.contextBuilder.injectIntoMessages(
            messages,
            systemPrompt,
            memoryFacts,
            retrievedDocs
        );

        return enrichedMessages;
    }

    /**
     * Utility to manually add documents to the Vector DB
     */
    public async addDocuments(docs: Omit<RAGDocument, "score">[]): Promise<void> {
        if (!this.vectorStore) {
            throw new Error("VectorStore not configured.");
        }
        // We assume the caller provides raw text, we need to embed it
        // Wait, typical VectorStores expect docs to be embedded by the user or the store handles it.
        // Let's standardise: the VectorStore interface handles just documents or we embed here.
        // If VectorStore expects embeddings handled by the store, we just pass docs.
        // We'll pass docs directly and assume vectorstore adapter computes embeddings if needed.
        // Or we compute them here. Let's design the VectorStore adapter to embed.
        await this.vectorStore.add(docs);
    }
}

/**
 * Factory function for minimal setup.
 */
export function createRag(config: RAGEngineConfig): RAGEngine {
    return new RAGEngine(config);
}
