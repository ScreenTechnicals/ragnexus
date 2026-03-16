import { describe, it, expect } from "vitest";
import { KeywordRouter } from "../src/tree-store/routers/keyword-router";
import { TreeNode } from "../src/tree-store/types";

function makeNodes(): TreeNode[] {
    return [
        {
            id: "pricing",
            label: "Pricing",
            content: "We offer free and pro plans.",
            keywords: ["pricing", "price", "cost", "plan"],
            children: [
                {
                    id: "free",
                    label: "Free Plan",
                    content: "The free plan includes 100 requests/month.",
                    keywords: ["free", "free plan"],
                },
                {
                    id: "pro",
                    label: "Pro Plan",
                    content: "The pro plan costs $29/month.",
                    keywords: ["pro", "pro plan", "enterprise plan", "paid"],
                },
            ],
        },
        {
            id: "auth",
            label: "Authentication",
            content: "We support OAuth and API keys.",
            keywords: ["auth", "authentication", "login", "oauth", "api key"],
            children: [
                {
                    id: "login",
                    label: "Login",
                    content: "Login via email/password or OAuth.",
                    keywords: ["login", "sign in", "email", "password"],
                },
            ],
        },
    ];
}

describe("KeywordRouter", () => {
    it("should match a single keyword", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("What is the pricing?");

        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.nodes[0].id).toBe("pricing");
        expect(result.strategy).toBe("keyword");
    });

    it("should return higher confidence for more keyword matches", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("How much does the pro plan cost?");

        // "pro" node has keywords: ["pro", "pro plan", "paid", "enterprise plan"]
        // "pricing" node has keywords: ["pricing", "price", "cost", "plan"]
        // Query contains "pro plan" and "cost" and "plan"
        expect(result.nodes.length).toBeGreaterThanOrEqual(2);
        // Both pro and pricing should match
        const ids = result.nodes.map((n) => n.id);
        expect(ids).toContain("pro");
        expect(ids).toContain("pricing");
    });

    it("should support multi-word keywords", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("Tell me about the enterprise plan");

        const ids = result.nodes.map((n) => n.id);
        expect(ids).toContain("pro");
    });

    it("should be case-insensitive", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("PRICING INFO");

        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.nodes[0].id).toBe("pricing");
    });

    it("should return empty result for unrelated query", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("weather forecast today");

        expect(result.nodes).toHaveLength(0);
        expect(result.paths).toHaveLength(0);
        expect(result.confidence).toBe(0);
    });

    it("should respect maxNodes option", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("login auth pricing", { maxNodes: 1 });

        expect(result.nodes).toHaveLength(1);
    });

    it("should respect minConfidence option", async () => {
        const router = new KeywordRouter(makeNodes());
        // "login" has 5 keywords; matching just "login" gives 1/5 = 0.2 confidence on auth node
        // but login child has 4 keywords, matching "login" gives 1/4 = 0.25
        const result = await router.route("login", { minConfidence: 0.5 });

        // Nodes with confidence < 0.5 should be excluded
        for (const node of result.nodes) {
            expect(node.confidence).toBeGreaterThanOrEqual(0.5);
        }
    });

    it("should build correct dot-separated paths for nested nodes", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("free plan");

        const freePlanNode = result.nodes.find((n) => n.id === "free");
        expect(freePlanNode).toBeDefined();
        expect(freePlanNode!.path).toBe("pricing.free");
    });

    it("should include node content in results", async () => {
        const router = new KeywordRouter(makeNodes());
        const result = await router.route("login sign in");

        const loginNode = result.nodes.find((n) => n.id === "login");
        expect(loginNode).toBeDefined();
        expect(loginNode!.content).toBe("Login via email/password or OAuth.");
    });

    it("should skip nodes without keywords", async () => {
        const nodes: TreeNode[] = [
            { id: "empty", label: "No Keywords", content: "Some content" },
            { id: "has", label: "Has Keywords", content: "Other content", keywords: ["test"] },
        ];
        const router = new KeywordRouter(nodes);
        const result = await router.route("test");

        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].id).toBe("has");
    });

    it("should include metadata in resolved nodes", async () => {
        const nodes: TreeNode[] = [
            {
                id: "meta",
                label: "With Meta",
                content: "Content",
                keywords: ["meta"],
                metadata: { priority: "high" },
            },
        ];
        const router = new KeywordRouter(nodes);
        const result = await router.route("meta");

        expect(result.nodes[0].metadata).toEqual({ priority: "high" });
    });
});
