import { RAGDocument, RAGMessage } from "../types";
import { ContextBuilder } from "../core/context-builder";
import { Guardrails } from "../core/guardrails";
import { TreeStoreError } from "./errors";
import { KeywordRouter } from "./routers/keyword-router";
import { LLMRouter } from "./routers/llm-router";
import {
    ResolvedTreeNode,
    TreeNode,
    TreeQueryOptions,
    TreeRouteResult,
    TreeRouter,
    TreeStoreConfig,
} from "./types";

// ─── Internal utility ────────────────────────────────────────────────────────

/**
 * Extract a plain text string from a message content value.
 * Handles: plain string, Vercel/Genkit content-array, undefined.
 */
function extractText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
            .join(" ")
            .trim();
    }
    return String(content);
}

// ─── TreeStore ───────────────────────────────────────────────────────────────

export class TreeStore {
    private config: TreeStoreConfig;
    private keywordRouter: KeywordRouter;
    private llmRouter?: LLMRouter;
    private nodeMap: Map<string, { node: TreeNode; path: string }> = new Map();
    private contextBuilder: ContextBuilder;

    constructor(config: TreeStoreConfig) {
        this.config = config;

        if (!config.tree || !config.tree.nodes || config.tree.nodes.length === 0) {
            throw new TreeStoreError("TreeSpec must have at least one node.");
        }

        // Build node index
        this.buildNodeMap(config.tree.nodes, "");

        // Initialize routers
        this.keywordRouter = new KeywordRouter(config.tree.nodes);

        if (config.llm) {
            this.llmRouter = new LLMRouter(config.tree.nodes, config.llm);
        }

        // Reuse existing ContextBuilder with default guardrails
        this.contextBuilder = new ContextBuilder(new Guardrails());
    }

    // ─── Node index ──────────────────────────────────────────────────────────

    private buildNodeMap(nodes: TreeNode[], parentPath: string): void {
        for (const node of nodes) {
            const path = parentPath ? `${parentPath}.${node.id}` : node.id;
            this.nodeMap.set(node.id, { node, path });

            if (node.children) {
                this.buildNodeMap(node.children, path);
            }
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Route a query to matching tree nodes.
     */
    public async route(query: string, options?: TreeQueryOptions): Promise<TreeRouteResult> {
        const strategy = options?.strategy ?? this.config.tree.defaultStrategy ?? "keyword";

        if (strategy === "llm") {
            if (!this.llmRouter) {
                throw new TreeStoreError(
                    'LLM routing requested but no llm config provided. Pass { llm: { complete: fn } } to TreeStore.'
                );
            }
            return this.llmRouter.route(query, options);
        }

        return this.keywordRouter.route(query, options);
    }

    /**
     * Query the tree and return matched content as RAGDocument[].
     * This is the primary integration point with RAGEngine.
     */
    public async query(query: string, options?: TreeQueryOptions): Promise<RAGDocument[]> {
        const result = await this.route(query, options);

        return result.nodes
            .filter((n) => n.content.length > 0)
            .map((n) => ({
                id: `tree:${n.id}`,
                text: n.content,
                source: `tree-store:${n.path}`,
                score: n.confidence,
                metadata: n.metadata,
            }));
    }

    /**
     * Build LLM-ready messages by injecting tree-matched content.
     * Reuses the existing ContextBuilder for consistent formatting.
     */
    public async buildContext(options: {
        messages: RAGMessage[];
        systemPrompt?: string;
        queryOptions?: TreeQueryOptions;
    }): Promise<RAGMessage[]> {
        const { messages, systemPrompt, queryOptions } = options;

        // Extract the latest user message
        const userMessage = messages.filter((m) => m.role === "user").pop();
        const queryText = extractText(userMessage?.content);

        let docs: RAGDocument[] = [];
        if (queryText) {
            docs = await this.query(queryText, queryOptions);
        }

        return this.contextBuilder.injectIntoMessages(messages, systemPrompt, [], docs);
    }

    // ─── Utilities ───────────────────────────────────────────────────────────

    /**
     * Get a node by its id.
     */
    public getNode(id: string): TreeNode | undefined {
        return this.nodeMap.get(id)?.node;
    }

    /**
     * Get a node by dot-separated path (e.g. "auth.login").
     */
    public getNodeByPath(path: string): TreeNode | undefined {
        for (const entry of this.nodeMap.values()) {
            if (entry.path === path) return entry.node;
        }
        return undefined;
    }

    /**
     * List all node paths in the tree.
     */
    public listPaths(): string[] {
        return Array.from(this.nodeMap.values()).map((e) => e.path);
    }
}
