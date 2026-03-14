export interface RAGDocument {
    id: string;
    text: string;
    metadata?: Record<string, any>;
    source?: string;
    score?: number;        // Similarity score from vector search
    contentHash?: string;  // SHA-256 of doc.text — used for change detection
    updatedAt?: number;    // Unix ms timestamp of last successful ingest
    expiresAt?: number;    // Optional TTL — doc is considered stale after this timestamp
}

/** Stats returned by VectorStore.upsert() */
export interface UpsertResult {
    added: number;
    updated: number;
    skipped: number;
}

export interface MemoryFact {
    id: string;
    type: "fact" | "preference" | "summary" | string;
    userId: string;
    content: string;
    importance: number; // 0 to 1
    createdAt: number;
}

/**
 * A single content part inside a message (Vercel AI SDK / Genkit array format).
 */
export interface MessageContentPart {
    type?: string;
    text: string;
}

/**
 * Message content can be a plain string OR an array of content parts
 * (as used by Genkit, Anthropic, and Vercel AI SDK).
 */
export type MessageContent = string | MessageContentPart[];

export interface RAGMessage {
    role: 'user' | 'assistant' | 'system' | string;
    content: MessageContent;
}

export interface RAGQueryOptions {
    messages: RAGMessage[];
    userId?: string;
    memory?: boolean;     // Enable memory extraction/injection
    topK?: number;        // Max documents to retrieve (default: 5)
    systemPrompt?: string;
    searchMode?: SearchMode;  // Search mode: 'semantic' | 'keyword' | 'hybrid' (default: 'semantic')
    alpha?: number;           // Hybrid blend weight: 0 = pure keyword, 1 = pure semantic (default: 0.5)
}

// Storage Interfaces
export interface VectorStore {
    add(docs: RAGDocument[]): Promise<void>;
    upsert(docs: RAGDocument[]): Promise<UpsertResult>;
    delete(ids: string[]): Promise<void>;
    search(vector: number[], topK?: number): Promise<RAGDocument[]>;
    /** Optional text-based search for keyword/hybrid modes. */
    searchByText?(query: string, topK?: number, mode?: SearchMode, alpha?: number): Promise<RAGDocument[]>;
}

export interface MemoryStore {
    get(userId: string): Promise<MemoryFact[]>;
    add(userId: string, memory: MemoryFact): Promise<void>;
    delete?(userId: string, memoryId: string): Promise<void>;
}

// Embedder Interface
export interface Embedder {
    embed(text: string): Promise<number[]>;
    embedBatch?(texts: string[]): Promise<number[][]>;
}

/**
 * Reranker — plugged in between vector retrieval and context injection.
 * Returns docs in re-scored order (highest relevance first).
 */
export interface Reranker {
    rerank(query: string, docs: RAGDocument[]): Promise<RAGDocument[]>;
}

/**
 * Search mode for VectorStore.search():
 * - 'semantic' : pure cosine similarity (default)
 * - 'keyword'  : BM25 keyword scoring
 * - 'hybrid'   : weighted combination of BM25 + cosine (best for mixed queries)
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

