import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../src/utils/retry";

describe("withRetry", () => {
    it("should return result on first success", async () => {
        const fn = vi.fn(async () => "ok");
        const result = await withRetry(fn);
        expect(result).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors and succeed", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt++;
            if (attempt < 3) throw new Error("429 rate limit exceeded");
            return "success";
        });

        const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 1 });
        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after exhausting all retries", async () => {
        const fn = vi.fn(async () => {
            throw new Error("500 Internal Server Error");
        });

        await expect(
            withRetry(fn, { maxRetries: 2, initialDelayMs: 1 })
        ).rejects.toThrow("500 Internal Server Error");
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
        const fn = vi.fn(async () => {
            throw new Error("Invalid API key");
        });

        await expect(
            withRetry(fn, { maxRetries: 3, initialDelayMs: 1 })
        ).rejects.toThrow("Invalid API key");
        expect(fn).toHaveBeenCalledTimes(1); // no retries
    });

    it("should retry on network errors", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt++;
            if (attempt === 1) throw new Error("fetch failed");
            return "recovered";
        });

        const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 });
        expect(result).toBe("recovered");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should retry on ECONNRESET errors", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt++;
            if (attempt === 1) throw new Error("ECONNRESET");
            return "ok";
        });

        const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 });
        expect(result).toBe("ok");
    });

    it("should respect maxRetries option", async () => {
        const fn = vi.fn(async () => {
            throw new Error("503 Service Unavailable");
        });

        await expect(
            withRetry(fn, { maxRetries: 1, initialDelayMs: 1 })
        ).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it("should use custom isRetryable predicate", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt++;
            if (attempt === 1) throw new Error("custom retryable");
            return "done";
        });

        const result = await withRetry(fn, {
            maxRetries: 2,
            initialDelayMs: 1,
            isRetryable: (err) => err instanceof Error && err.message.includes("custom retryable"),
        });
        expect(result).toBe("done");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should handle errors with status property", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt++;
            if (attempt === 1) {
                const err = new Error("Too Many Requests");
                (err as any).status = 429;
                throw err;
            }
            return "ok";
        });

        const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 });
        expect(result).toBe("ok");
    });
});
