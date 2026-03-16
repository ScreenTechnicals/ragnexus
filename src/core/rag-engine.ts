import { EventEmitter } from "node:events";
import { VectorStoreError } from "../errors";
import { MemoryManager } from "../memory/memory-manager";
import { Retriever } from "../retrieval/retriever";
import { Embedder, MemoryStore, RAGDocument, RAGMessage, RAGQueryOptions, Reranker, UpsertResult, VectorStore } from "../types";
import { ContextBuilder } from "./context-builder";
import { GuardrailOptions, Guardrails } from "./guardrails";

// ─── Event types ─────────────────────────────────────────────────────────────

export interface RAGEngineEvents {
    /** Emitted after retrieval with the filtered docs (before context injection). */
    retrieve: [docs: RAGDocument[]];
    /** Emitted after upsert with the result stats. */
    upsert: [result: UpsertResult];
    /** Emitted when guardrails reject a document (with the rejected doc and reason). */
    "guardrail:reject": [doc: RAGDocument, reason: string];
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface RAGEngineConfig {
    storage: {
        /** Primary vector store. */
        vector?: VectorStore;
        /** @deprecated Use `vector` instead. */
        vectorModel?: VectorStore;
        memory?: MemoryStore;
    };
    embedder: Embedder;
    guardrails?: GuardrailOptions;
    /**
     * Optional cross-encoder reranker.
     * When provided, retrieval fetches more candidates and the reranker
     * reorders them by joint (query, doc) relevance before context injection.
     */
    reranker?: Reranker;
    /**
     * @deprecated Use `engine.on('retrieve', fn)` instead.
     * Observability hook — called after retrieval with the final filtered docs.
     */
    onRetrieve?: (docs: RAGDocument[]) => void;
    /**
     * Optional tree-store for structured knowledge routing.
     * Duck-typed to avoid circular dependency on the tree-store plugin.
     */
    treeStore?: { query: (query: string, options?: any) => Promise<RAGDocument[]> };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class RAGEngine extends EventEmitter<RAGEngineEvents> {
    private vectorStore?: VectorStore;
    private memoryManager?: MemoryManager;
    private embedder: Embedder;
    private treeStore?: { query: (query: string, options?: any) => Promise<RAGDocument[]> };

    public guardrails: Guardrails;
    public contextBuilder: ContextBuilder;
    public retriever?: Retriever;

    constructor(config: RAGEngineConfig) {
        super();

        this.vectorStore = config.storage.vector ?? config.storage.vectorModel;
        this.embedder = config.embedder;

        // Backward compat: wire legacy onRetrieve callback into the event emitter
        if (config.onRetrieve) {
            this.on("retrieve", config.onRetrieve);
        }

        if (config.storage.memory) {
            this.memoryManager = new MemoryManager(config.storage.memory);
        }

        this.guardrails = new Guardrails(config.guardrails);
        this.guardrails.onReject = (doc, reason) => this.emit("guardrail:reject", doc, reason);
        this.contextBuilder = new ContextBuilder(this.guardrails);

        if (this.vectorStore) {
            this.retriever = new Retriever(this.vectorStore, this.embedder, this.guardrails, config.reranker);
        }

        if (config.treeStore) {
            this.treeStore = config.treeStore;
        }
    }

    /**
     * Generates the injected messages array for LLM consumption.
     * Format matches Vercel AI SDK `{ role, content }[]`.
     */
    public async buildContext(options: RAGQueryOptions): Promise<RAGMessage[]> {
        const { messages, userId, memory = true, systemPrompt, topK, searchMode, alpha } = options;

        let retrievedDocs: RAGDocument[] = [];
        let memoryFacts: any[] = [];

        // Extract the latest user message — handles both string and content-array formats
        const userMessage = messages.filter((m) => m.role === "user").pop();
        const query = extractText(userMessage?.content);

        // Retrieve memory
        if (memory && userId && this.memoryManager) {
            memoryFacts = await this.memoryManager.getMemory(userId);
        }

        // Retrieve documents from tree-store (structured knowledge)
        if (this.treeStore && query) {
            const treeDocs = await this.treeStore.query(query);
            retrievedDocs = [...treeDocs, ...retrievedDocs];
        }

        // Retrieve documents from vector store
        if (this.retriever && query) {
            const vectorDocs = await this.retriever.retrieve(query, { topK, searchMode, alpha });
            retrievedDocs = [...retrievedDocs, ...vectorDocs];
        }

        // Fire retrieve event
        if (retrievedDocs.length > 0) {
            this.emit("retrieve", retrievedDocs);
        }

        return this.contextBuilder.injectIntoMessages(
            messages,
            systemPrompt,
            memoryFacts,
            retrievedDocs
        );
    }

    /**
     * Add documents to the vector store.
     * Skips any document whose id already exists. Use upsertDocuments() for
     * change-detection / replace semantics.
     */
    public async addDocuments(docs: Omit<RAGDocument, "score">[]): Promise<void> {
        if (!this.vectorStore) throw new VectorStoreError("VectorStore not configured.");
        await this.vectorStore.add(docs as RAGDocument[]);
    }

    /**
     * Upsert documents with content-hash change detection.
     * - skip   : document exists and content is unchanged
     * - update : document exists but content has changed → re-embed and replace
     * - add    : new document → embed and insert
     */
    public async upsertDocuments(docs: Omit<RAGDocument, "score">[]): Promise<UpsertResult> {
        if (!this.vectorStore) throw new VectorStoreError("VectorStore not configured.");
        const result = await this.vectorStore.upsert(docs as RAGDocument[]);
        this.emit("upsert", result);
        return result;
    }

    /**
     * Remove documents from the vector store by id.
     */
    public async removeDocuments(ids: string[]): Promise<void> {
        if (!this.vectorStore) throw new VectorStoreError("VectorStore not configured.");
        await this.vectorStore.delete(ids);
    }
}

/**
 * Factory function for minimal setup.
 */
export function createRag(config: RAGEngineConfig): RAGEngine {
    return new RAGEngine(config);
}

// ─── Internal utility ────────────────────────────────────────────────────────

/**
 * Extract a plain text string from a message content value.
 * Handles: plain string, Vercel/Genkit content-array, undefined.
 */
function extractText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
            .join(" ")
            .trim();
    }
    return String(content);
}
