export interface RetryOptions {
    /** Maximum number of retry attempts. Default: 3. */
    maxRetries?: number;
    /** Initial delay in ms before the first retry. Default: 500. */
    initialDelayMs?: number;
    /** Maximum delay in ms (cap for exponential growth). Default: 10000. */
    maxDelayMs?: number;
    /** Multiplier applied to delay after each retry. Default: 2. */
    backoffMultiplier?: number;
    /**
     * Predicate to determine if an error is retryable.
     * Default: retries on rate-limit (429), server errors (5xx), and network errors.
     */
    isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    backoffMultiplier: 2,
    isRetryable: defaultIsRetryable,
};

/**
 * Execute an async function with automatic retry and exponential backoff.
 * Adds random jitter (0–25%) to each delay to avoid thundering herd.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let delay = opts.initialDelayMs;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isLast = attempt === opts.maxRetries;
            if (isLast || !opts.isRetryable(error)) {
                throw error;
            }

            // Add jitter: 0–25% of the current delay
            const jitter = delay * Math.random() * 0.25;
            await sleep(delay + jitter);

            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }

    // Unreachable, but satisfies TypeScript
    throw new Error("withRetry: unexpected exit");
}

/**
 * Default retryable check: rate limits (429), server errors (5xx), network errors.
 */
function defaultIsRetryable(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();

        // Network errors
        if (msg.includes("fetch failed") || msg.includes("econnreset") ||
            msg.includes("etimedout") || msg.includes("enotfound") ||
            msg.includes("network")) {
            return true;
        }

        // HTTP status codes embedded in error messages
        if (msg.includes("429") || msg.includes("rate limit")) return true;
        if (/\b5\d{2}\b/.test(msg)) return true;
    }

    // Objects with a status property (fetch Response errors, etc.)
    if (typeof error === "object" && error !== null && "status" in error) {
        const status = (error as any).status;
        if (status === 429 || (status >= 500 && status < 600)) return true;
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
