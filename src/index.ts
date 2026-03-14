import { ContextBuilder } from "./core/context-builder";
import { GuardrailOptions, Guardrails } from "./core/guardrails";
import { createRag, RAGEngine, RAGEngineConfig, RAGEngineEvents } from "./core/rag-engine";
import { MemoryManager } from "./memory/memory-manager";
import { Retriever, RetrieverOptions } from "./retrieval/retriever";

// Types
export type * from "./types";

// Errors
export {
    CrawlError,
    EmbeddingError,
    GuardrailError,
    MemoryStoreError,
    RagNexusError,
    RerankerError,
    VectorStoreError
} from "./errors";

// Utils
export { sha256 } from "./utils/hash";
export { withRetry } from "./utils/retry";
export type { RetryOptions } from "./utils/retry";
export { TextSplitter } from "./utils/text-splitter";
export type { TextSplitterOptions } from "./utils/text-splitter";

// Storage
export { InMemoryStore } from "./storage/memory-store";
export { QdrantVectorStore } from "./storage/qdrant-store";
export type { QdrantClientInstance } from "./storage/qdrant-store";
export { RedisMemoryStore } from "./storage/redis-store";
export type { RedisClient } from "./storage/redis-store";
export { InMemoryVectorStore } from "./storage/vector-store";

// Embeddings
export { CohereEmbedder } from "./embeddings/cohere";
export type { CohereEmbeddingsOptions } from "./embeddings/cohere";
export { GeminiEmbedder } from "./embeddings/gemini";
export type { GeminiEmbeddingsOptions } from "./embeddings/gemini";
export { OllamaEmbedder } from "./embeddings/ollama";
export type { OllamaEmbeddingsOptions } from "./embeddings/ollama";
export { OpenAIEmbedder } from "./embeddings/openai";
export type { OpenAIEmbeddingsOptions } from "./embeddings/openai";

// Adapters
export { AnthropicAdapter } from "./adapters/anthropic";
export { GeminiAdapter } from "./adapters/gemini";
export { GenkitAdapter } from "./adapters/genkit";
export { OpenAIAdapter } from "./adapters/openai";
export { VercelAIAdapter } from "./adapters/vercel-ai";

// Rerankers
export { CohereReranker } from "./rerankers/cohere";
export type { CohereRerankerOptions } from "./rerankers/cohere";

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
    RAGEngineEvents,
    RetrieverOptions
};


