import { describe, it, expect, vi } from "vitest";
import { TreeStore } from "../src/tree-store/tree-store";
import { TreeStoreError } from "../src/tree-store/errors";
import { TreeNode, TreeSpec } from "../src/tree-store/types";

function makeTree(): TreeSpec {
    return {
        nodes: [
            {
                id: "pricing",
                label: "Pricing",
                content: "We offer free and pro plans.",
                keywords: ["pricing", "price", "cost", "plan"],
                description: "Pricing information",
                children: [
                    {
                        id: "free",
                        label: "Free Plan",
                        content: "Free plan: 100 requests/month.",
                        keywords: ["free", "free plan"],
                        description: "Free tier details",
                    },
                    {
                        id: "pro",
                        label: "Pro Plan",
                        content: "Pro plan: $29/month.",
                        keywords: ["pro", "pro plan", "paid"],
                        description: "Pro tier details",
                    },
                ],
            },
            {
                id: "auth",
                label: "Authentication",
                content: "We support OAuth and API keys.",
                keywords: ["auth", "authentication", "login", "oauth"],
                description: "Authentication methods",
            },
            {
                id: "empty",
                label: "No Content Node",
                keywords: ["empty"],
                description: "A node with no content",
            },
        ],
    };
}

describe("TreeStore", () => {
    describe("constructor", () => {
        it("should create a TreeStore from a valid spec", () => {
            const store = new TreeStore({ tree: makeTree() });
            expect(store).toBeDefined();
        });

        it("should throw on empty nodes", () => {
            expect(() => new TreeStore({ tree: { nodes: [] } })).toThrow(TreeStoreError);
        });
    });

    describe("getNode", () => {
        it("should return a node by id", () => {
            const store = new TreeStore({ tree: makeTree() });
            const node = store.getNode("pricing");

            expect(node).toBeDefined();
            expect(node!.label).toBe("Pricing");
        });

        it("should return a nested node by id", () => {
            const store = new TreeStore({ tree: makeTree() });
            const node = store.getNode("free");

            expect(node).toBeDefined();
            expect(node!.label).toBe("Free Plan");
        });

        it("should return undefined for unknown id", () => {
            const store = new TreeStore({ tree: makeTree() });
            expect(store.getNode("nonexistent")).toBeUndefined();
        });
    });

    describe("getNodeByPath", () => {
        it("should return a node by dot-separated path", () => {
            const store = new TreeStore({ tree: makeTree() });
            const node = store.getNodeByPath("pricing.pro");

            expect(node).toBeDefined();
            expect(node!.id).toBe("pro");
        });

        it("should return top-level node by path", () => {
            const store = new TreeStore({ tree: makeTree() });
            const node = store.getNodeByPath("auth");

            expect(node).toBeDefined();
            expect(node!.id).toBe("auth");
        });

        it("should return undefined for unknown path", () => {
            const store = new TreeStore({ tree: makeTree() });
            expect(store.getNodeByPath("foo.bar")).toBeUndefined();
        });
    });

    describe("listPaths", () => {
        it("should list all node paths", () => {
            const store = new TreeStore({ tree: makeTree() });
            const paths = store.listPaths();

            expect(paths).toContain("pricing");
            expect(paths).toContain("pricing.free");
            expect(paths).toContain("pricing.pro");
            expect(paths).toContain("auth");
            expect(paths).toContain("empty");
        });
    });

    describe("route (keyword)", () => {
        it("should route using keyword strategy by default", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const result = await store.route("What is the pricing?");

            expect(result.strategy).toBe("keyword");
            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.nodes[0].id).toBe("pricing");
        });

        it("should respect tree defaultStrategy", async () => {
            const tree = makeTree();
            tree.defaultStrategy = "keyword";
            const store = new TreeStore({ tree });
            const result = await store.route("pricing");

            expect(result.strategy).toBe("keyword");
        });

        it("should allow per-query strategy override", async () => {
            const store = new TreeStore({
                tree: makeTree(),
                llm: { complete: vi.fn(async () => '[{"id": "auth", "confidence": 0.9}]') },
            });
            const result = await store.route("login", { strategy: "llm" });

            expect(result.strategy).toBe("llm");
        });
    });

    describe("route (llm)", () => {
        it("should throw when LLM strategy requested without config", async () => {
            const store = new TreeStore({ tree: makeTree() });

            await expect(store.route("query", { strategy: "llm" })).rejects.toThrow(
                "LLM routing requested but no llm config provided"
            );
        });

        it("should route via LLM when configured", async () => {
            const complete = vi.fn(async () => '[{"id": "auth", "confidence": 0.85}]');
            const store = new TreeStore({ tree: makeTree(), llm: { complete } });
            const result = await store.route("How do I authenticate?", { strategy: "llm" });

            expect(result.strategy).toBe("llm");
            expect(result.nodes[0].id).toBe("auth");
            expect(complete).toHaveBeenCalled();
        });
    });

    describe("query", () => {
        it("should return RAGDocument[] for matched nodes", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const docs = await store.query("pricing cost");

            expect(docs.length).toBeGreaterThan(0);
            expect(docs[0].id).toMatch(/^tree:/);
            expect(docs[0].source).toMatch(/^tree-store:/);
            expect(docs[0].text).toBeTruthy();
            expect(docs[0].score).toBeGreaterThan(0);
        });

        it("should exclude nodes with no content", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const docs = await store.query("empty");

            // "empty" node has no content, should be filtered out
            const emptyDocs = docs.filter((d) => d.id === "tree:empty");
            expect(emptyDocs).toHaveLength(0);
        });

        it("should return empty array for no matches", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const docs = await store.query("weather forecast");

            expect(docs).toHaveLength(0);
        });
    });

    describe("buildContext", () => {
        it("should inject tree content into messages", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const messages = await store.buildContext({
                messages: [{ role: "user", content: "What is the pricing?" }],
            });

            // Should have a system message injected with context
            const system = messages.find((m) => m.role === "system");
            expect(system).toBeDefined();
            expect(system!.content).toContain("We offer free and pro plans.");
        });

        it("should include systemPrompt when provided", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const messages = await store.buildContext({
                messages: [{ role: "user", content: "pricing" }],
                systemPrompt: "You are a helpful assistant.",
            });

            const system = messages.find((m) => m.role === "system");
            expect(system!.content).toContain("You are a helpful assistant.");
        });

        it("should return messages unchanged when no query matches", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const original = [{ role: "user" as const, content: "weather today" }];
            const messages = await store.buildContext({ messages: original });

            expect(messages).toEqual(original);
        });

        it("should handle content-array message format", async () => {
            const store = new TreeStore({ tree: makeTree() });
            const messages = await store.buildContext({
                messages: [
                    { role: "user", content: [{ type: "text", text: "pricing info" }] },
                ],
            });

            const system = messages.find((m) => m.role === "system");
            expect(system).toBeDefined();
        });
    });
});
