export interface RAGDocument {
    id: string;
    text: string;
    metadata?: Record<string, any>;
    source?: string;
    score?: number; // Similarity score
}

export interface MemoryFact {
    id: string;
    type: "fact" | "preference" | "summary" | string;
    userId: string;
    content: string;
    importance: number; // 0 to 1
    createdAt: number;
}

export interface RAGQueryOptions {
    messages: any[]; // Vercel AI SDK compatible message format
    userId?: string;
    memory?: boolean; // Enable memory extraction/injection
    systemPrompt?: string;
}

// Storage Interfaces
export interface VectorStore {
    add(docs: RAGDocument[]): Promise<void>;
    search(vector: number[], topK?: number): Promise<RAGDocument[]>;
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
