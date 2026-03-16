import { describe, it, expect, vi } from "vitest";
import { LLMRouter } from "../src/tree-store/routers/llm-router";
import { TreeNode, LLMRouterConfig } from "../src/tree-store/types";
import { TreeStoreError } from "../src/tree-store/errors";

function makeNodes(): TreeNode[] {
    return [
        {
            id: "pricing",
            label: "Pricing",
            content: "We offer free and pro plans.",
            description: "Information about pricing and plans",
            children: [
                {
                    id: "free",
                    label: "Free Plan",
                    content: "Free plan: 100 requests/month.",
                    description: "Details about the free tier",
                },
                {
                    id: "pro",
                    label: "Pro Plan",
                    content: "Pro plan: $29/month.",
                    description: "Details about the pro tier",
                },
            ],
        },
        {
            id: "auth",
            label: "Authentication",
            content: "OAuth and API keys supported.",
            description: "How to authenticate with the API",
        },
    ];
}

function mockLLM(response: string): LLMRouterConfig {
    return { complete: vi.fn(async () => response) };
}

describe("LLMRouter", () => {
    describe("buildPrompt", () => {
        it("should include all nodes with paths and descriptions", () => {
            const router = new LLMRouter(makeNodes(), mockLLM("[]"));
            const prompt = router.buildPrompt("How much does it cost?");

            expect(prompt).toContain('"pricing"');
            expect(prompt).toContain('"pricing.free"');
            expect(prompt).toContain('"pricing.pro"');
            expect(prompt).toContain('"auth"');
            expect(prompt).toContain("How much does it cost?");
            expect(prompt).toContain("Information about pricing and plans");
            expect(prompt).toContain("Details about the free tier");
        });

        it("should use label as fallback when no description", () => {
            const nodes: TreeNode[] = [
                { id: "test", label: "Test Node", content: "Content" },
            ];
            const router = new LLMRouter(nodes, mockLLM("[]"));
            const prompt = router.buildPrompt("query");

            expect(prompt).toContain("Test Node");
        });
    });

    describe("parseResponse", () => {
        it("should parse a clean JSON array", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const result = router.parseResponse('[{"id": "pricing", "confidence": 0.95}]');

            expect(result).toEqual([{ id: "pricing", confidence: 0.95 }]);
        });

        it("should handle markdown code fences", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const response = '```json\n[{"id": "auth", "confidence": 0.8}]\n```';
            const result = router.parseResponse(response);

            expect(result).toEqual([{ id: "auth", confidence: 0.8 }]);
        });

        it("should handle extra text around JSON", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const response = 'Here are the matches:\n[{"id": "pricing", "confidence": 0.9}]\nHope this helps!';
            const result = router.parseResponse(response);

            expect(result).toEqual([{ id: "pricing", confidence: 0.9 }]);
        });

        it("should return empty array for invalid JSON", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const result = router.parseResponse("I don't understand the query");

            expect(result).toEqual([]);
        });

        it("should return empty array for non-array JSON", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const result = router.parseResponse('{"id": "pricing"}');

            expect(result).toEqual([]);
        });

        it("should filter out malformed items", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const response = '[{"id": "good", "confidence": 0.9}, {"bad": true}, {"id": 123, "confidence": 0.5}]';
            const result = router.parseResponse(response);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("good");
        });

        it("should clamp confidence to 0-1 range", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const response = '[{"id": "a", "confidence": 1.5}, {"id": "b", "confidence": -0.3}]';
            const result = router.parseResponse(response);

            expect(result[0].confidence).toBe(1);
            expect(result[1].confidence).toBe(0);
        });

        it("should handle empty array response", () => {
            const router = new LLMRouter([], mockLLM("[]"));
            const result = router.parseResponse("[]");

            expect(result).toEqual([]);
        });
    });

    describe("route", () => {
        it("should call LLM and return matched nodes", async () => {
            const llm = mockLLM('[{"id": "pricing", "confidence": 0.95}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("How much does it cost?");

            expect(llm.complete).toHaveBeenCalledTimes(1);
            expect(result.nodes).toHaveLength(1);
            expect(result.nodes[0].id).toBe("pricing");
            expect(result.nodes[0].confidence).toBe(0.95);
            expect(result.nodes[0].path).toBe("pricing");
            expect(result.strategy).toBe("llm");
            expect(result.confidence).toBe(0.95);
        });

        it("should return nested node paths correctly", async () => {
            const llm = mockLLM('[{"id": "free", "confidence": 0.9}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("Tell me about the free plan");

            expect(result.nodes[0].path).toBe("pricing.free");
        });

        it("should skip unknown node ids from LLM response", async () => {
            const llm = mockLLM('[{"id": "nonexistent", "confidence": 0.9}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("Something");

            expect(result.nodes).toHaveLength(0);
        });

        it("should respect maxNodes option", async () => {
            const llm = mockLLM('[{"id": "pricing", "confidence": 0.9}, {"id": "auth", "confidence": 0.8}, {"id": "free", "confidence": 0.7}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("Tell me everything", { maxNodes: 2 });

            expect(result.nodes).toHaveLength(2);
        });

        it("should respect minConfidence option", async () => {
            const llm = mockLLM('[{"id": "pricing", "confidence": 0.9}, {"id": "auth", "confidence": 0.3}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("query", { minConfidence: 0.5 });

            expect(result.nodes).toHaveLength(1);
            expect(result.nodes[0].id).toBe("pricing");
        });

        it("should sort results by confidence descending", async () => {
            const llm = mockLLM('[{"id": "auth", "confidence": 0.7}, {"id": "pricing", "confidence": 0.95}]');
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("query");

            expect(result.nodes[0].id).toBe("pricing");
            expect(result.nodes[1].id).toBe("auth");
        });

        it("should throw TreeStoreError when LLM fails", async () => {
            const llm: LLMRouterConfig = {
                complete: vi.fn(async () => { throw new Error("API timeout"); }),
            };
            const router = new LLMRouter(makeNodes(), llm);

            await expect(router.route("query")).rejects.toThrow(TreeStoreError);
        });

        it("should return empty result for garbage LLM response", async () => {
            const llm = mockLLM("I have no idea what you're asking about.");
            const router = new LLMRouter(makeNodes(), llm);
            const result = await router.route("query");

            expect(result.nodes).toHaveLength(0);
            expect(result.confidence).toBe(0);
        });
    });
});
