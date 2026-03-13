import { ContextBuilder } from "./core/context-builder";
import { GuardrailOptions, Guardrails } from "./core/guardrails";
import { createRag, RAGEngine, RAGEngineConfig } from "./core/rag-engine";
import { MemoryManager } from "./memory/memory-manager";
import { Retriever, RetrieverOptions } from "./retrieval/retriever";

// Types
export type * from "./types";

// Storage
export { InMemoryStore } from "./storage/memory-store";
export { QdrantVectorStore } from "./storage/qdrant-store";
export type { QdrantClientInstance } from "./storage/qdrant-store";
export { RedisMemoryStore } from "./storage/redis-store";
export type { RedisClient } from "./storage/redis-store";
export { InMemoryVectorStore } from "./storage/vector-store";

// Embeddings
export { OpenAIEmbedder } from "./embeddings/openai";
export type { OpenAIEmbeddingsOptions } from "./embeddings/openai";

// Adapters
export { GenkitAdapter } from "./adapters/genkit";
export { OpenAIAdapter } from "./adapters/openai";
export { VercelAIAdapter } from "./adapters/vercel-ai";

// Crawlers
export { WebCrawler } from "./crawlers/crawlee";
export type { CrawleeOptions } from "./crawlers/crawlee";

// Core exports
export {
    ContextBuilder,
    createRag,
    Guardrails,
    MemoryManager,
    RAGEngine,
    Retriever
};

export type {
    GuardrailOptions,
    RAGEngineConfig,
    RetrieverOptions
};

