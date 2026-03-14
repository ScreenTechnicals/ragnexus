/**
 * Base error class for all RagNexus errors.
 * Carries an optional `cause` for error chaining.
 */
export class RagNexusError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "RagNexusError";
    }
}

/** Thrown by vector store operations (add, upsert, delete, search). */
export class VectorStoreError extends RagNexusError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "VectorStoreError";
    }
}

/** Thrown by embedding API calls. */
export class EmbeddingError extends RagNexusError {
    public readonly statusCode?: number;

    constructor(message: string, options?: { cause?: unknown; statusCode?: number }) {
        super(message, options);
        this.name = "EmbeddingError";
        this.statusCode = options?.statusCode;
    }
}

/** Thrown by web crawler operations. */
export class CrawlError extends RagNexusError {
    public readonly url?: string;

    constructor(message: string, options?: { cause?: unknown; url?: string }) {
        super(message, options);
        this.name = "CrawlError";
        this.url = options?.url;
    }
}

/** Thrown by guardrail processing. */
export class GuardrailError extends RagNexusError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "GuardrailError";
    }
}

/** Thrown by memory store operations. */
export class MemoryStoreError extends RagNexusError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "MemoryStoreError";
    }
}

/** Thrown by reranker API calls. */
export class RerankerError extends RagNexusError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "RerankerError";
    }
}
