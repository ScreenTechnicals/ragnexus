interface RAGDocument {
    id: string;
    text: string;
    metadata?: Record<string, any>;
    source?: string;
    score?: number;
}
interface MemoryFact {
    id: string;
    type: "fact" | "preference" | "summary" | string;
    userId: string;
    content: string;
    importance: number;
    createdAt: number;
}
interface RAGQueryOptions {
    messages: any[];
    userId?: string;
    memory?: boolean;
    systemPrompt?: string;
}
interface VectorStore {
    add(docs: RAGDocument[]): Promise<void>;
    search(vector: number[], topK?: number): Promise<RAGDocument[]>;
}
interface MemoryStore {
    get(userId: string): Promise<MemoryFact[]>;
    add(userId: string, memory: MemoryFact): Promise<void>;
    delete?(userId: string, memoryId: string): Promise<void>;
}
interface Embedder {
    embed(text: string): Promise<number[]>;
    embedBatch?(texts: string[]): Promise<number[][]>;
}

interface GuardrailOptions {
    minRelevanceScore?: number;
    blockedPatterns?: string[];
    maxTokens?: number;
}
declare class Guardrails {
    private options;
    constructor(options?: GuardrailOptions);
    /**
     * Layer 1: Instruction Stripping
     * Removes known adversarial patterns from retrieved text.
     */
    stripInstructions(text: string): string;
    /**
     * Layer 2: Context Sandboxing
     * Wraps the retrieved context safely so the model knows it is untrusted data.
     */
    sandboxContext(docs: RAGDocument[]): string;
    /**
     * Layer 3: Relevance Threshold
     * Discards documents that fall below the similarity threshold.
     */
    filterRelevance(docs: RAGDocument[]): RAGDocument[];
    /**
     * Process retrieved documents through the full guardrail pipeline.
     */
    processRetrievedDocs(docs: RAGDocument[]): RAGDocument[];
}

declare class ContextBuilder {
    private guardrails;
    constructor(guardrails: Guardrails);
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
    buildPrompt(systemPrompt: string | undefined, memories: MemoryFact[], retrievedDocs: RAGDocument[], userQuery: string): string;
    /**
     * Inject into AI SDK Messages array.
     * By convention, we can prepend a system message, or combine it.
     */
    injectIntoMessages(messages: any[], systemPrompt: string | undefined, memories: MemoryFact[], retrievedDocs: RAGDocument[]): any[];
}

interface RetrieverOptions {
    topK?: number;
}
declare class Retriever {
    private vectorStore;
    private embedder;
    private guardrails;
    constructor(vectorStore: VectorStore, embedder: Embedder, guardrails: Guardrails);
    /**
     * Full retrieval pipeline:
     * 1. Embed query
     * 2. Semantic search
     * 3. (Optional Rerank)
     * 4. Context Poisoning Check (Layer 1 & 3 via Guardrails)
     */
    retrieve(query: string, options?: RetrieverOptions): Promise<RAGDocument[]>;
    private rerank;
}

interface RAGEngineConfig {
    storage: {
        vectorModel?: VectorStore;
        vector?: VectorStore;
        memory?: MemoryStore;
    };
    embedder: Embedder;
    guardrails?: GuardrailOptions;
}
declare class RAGEngine {
    private vectorStore?;
    private memoryManager?;
    private embedder;
    guardrails: Guardrails;
    contextBuilder: ContextBuilder;
    retriever?: Retriever;
    constructor(config: RAGEngineConfig);
    /**
     * Generates the injected messages array for LLM consumption.
     * Format matches Vercel AI SDK `{ role, content }[]`.
     */
    buildContext(options: RAGQueryOptions): Promise<any[]>;
    /**
     * Utility to manually add documents to the Vector DB
     */
    addDocuments(docs: Omit<RAGDocument, "score">[]): Promise<void>;
}
/**
 * Factory function for minimal setup.
 */
declare function createRag(config: RAGEngineConfig): RAGEngine;

declare class MemoryManager {
    private store;
    constructor(store: MemoryStore);
    /**
     * Fetch memory facts for a given user.
     */
    getMemory(userId: string): Promise<MemoryFact[]>;
    /**
     * Extract memory from messages and persist it.
     * This is a placeholder for automatic memory extraction using an LLM.
     * In a real system, you'd pass the new message sequence to an LLM,
     * ask it to extract facts/preferences, and then call this method.
     */
    addMemory(userId: string, fact: Omit<MemoryFact, "id" | "createdAt" | "userId">): Promise<void>;
}

declare class InMemoryStore implements MemoryStore {
    private store;
    get(userId: string): Promise<MemoryFact[]>;
    add(userId: string, memory: MemoryFact): Promise<void>;
    delete(userId: string, memoryId: string): Promise<void>;
}

interface QdrantClientInstance {
    upsert(collectionName: string, config: {
        wait: boolean;
        points: any[];
    }): Promise<any>;
    search(collectionName: string, config: {
        vector: number[];
        limit: number;
    }): Promise<any[]>;
}
declare class QdrantVectorStore implements VectorStore {
    private client;
    private collectionName;
    private embedder;
    constructor(client: QdrantClientInstance, embedder: Embedder, collectionName?: string);
    add(docs: RAGDocument[]): Promise<void>;
    search(vector: number[], topK?: number): Promise<RAGDocument[]>;
}

interface RedisClient {
    zadd(key: string, score: number, member: string): Promise<any>;
    zrevrange(key: string, start: number, stop: number): Promise<string[]>;
    zrem(key: string, member: string): Promise<any>;
}
declare class RedisMemoryStore implements MemoryStore {
    private redis;
    private prefix;
    constructor(redisClient: RedisClient, prefix?: string);
    private getKey;
    get(userId: string): Promise<MemoryFact[]>;
    add(userId: string, memory: MemoryFact): Promise<void>;
    delete(userId: string, memoryId: string): Promise<void>;
}

declare class InMemoryVectorStore implements VectorStore {
    private docs;
    private documentVectors;
    private embedder;
    constructor(embedder: Embedder);
    add(docs: RAGDocument[]): Promise<void>;
    search(vector: number[], topK?: number): Promise<RAGDocument[]>;
    private cosineSimilarity;
}

interface OpenAIEmbeddingsOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}
declare class OpenAIEmbedder implements Embedder {
    private apiKey;
    private model;
    private baseUrl;
    constructor(options?: OpenAIEmbeddingsOptions);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Adapter for Google Genkit framework.
 */
declare class GenkitAdapter {
    private engine;
    constructor(engine: RAGEngine);
    /**
     * Genkit's `generate()` function accepts a `messages` array in its payload.
     * This prepares the payload for Genkit.
     */
    getGenerateOptions(generateOptions: any, ragOptions: Omit<RAGQueryOptions, "messages">): Promise<any>;
}

/**
 * Adapter for OpenAI native client compatibility.
 * Useful when users are interacting with OpenAI directly instead of the Vercel AI SDK.
 */
declare class OpenAIAdapter {
    private engine;
    constructor(engine: RAGEngine);
    /**
     * Returns a modified parameters object for `openai.chat.completions.create(...)`
     */
    getCompletionConfig(chatCompletionParams: any, ragOptions: Omit<RAGQueryOptions, "messages">): Promise<any>;
}

/**
 * Adapter for Vercel AI SDK compatibility.
 * This takes your standard createRag() instance and allows you to
 * wrap the AI SDK calls natively.
 */
declare class VercelAIAdapter {
    private engine;
    constructor(engine: RAGEngine);
    /**
     * Used before calling `streamText` or `generateText`.
     * Given messages, it builds the safe RAG context and returns the augmented message array.
     */
    getMessages(options: RAGQueryOptions): Promise<any[]>;
    /**
     * Higher order wrapper. Can wrap the `streamText` natively.
     * `options` are properties that apply to both AI SDK and the RAGEngine.
     */
    streamTextWithContext(aiSdkStreamText: any, options: any, ragOptions: Omit<RAGQueryOptions, "messages">): Promise<any>;
}

interface CrawleeOptions {
    maxRequestsPerCrawl?: number;
    headless?: boolean;
}
declare class WebCrawler {
    private options;
    constructor(options?: CrawleeOptions);
    /**
     * Crawls a single URL and extracts the text content.
     */
    scrapeUrl(url: string): Promise<RAGDocument>;
    /**
     * Crawls a list of URLs concurrently and extracts text content.
     */
    scrapeBatch(urls: string[]): Promise<RAGDocument[]>;
}

export { ContextBuilder, type CrawleeOptions, type Embedder, GenkitAdapter, type GuardrailOptions, Guardrails, InMemoryStore, InMemoryVectorStore, type MemoryFact, MemoryManager, type MemoryStore, OpenAIAdapter, OpenAIEmbedder, type OpenAIEmbeddingsOptions, type QdrantClientInstance, QdrantVectorStore, type RAGDocument, RAGEngine, type RAGEngineConfig, type RAGQueryOptions, type RedisClient, RedisMemoryStore, Retriever, type RetrieverOptions, type VectorStore, VercelAIAdapter, WebCrawler, createRag };
