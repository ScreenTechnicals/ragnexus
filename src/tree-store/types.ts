import { RAGDocument } from "../types";

// ─── Tree Definition ─────────────────────────────────────────────────────────

export interface TreeNode {
    /** Unique identifier for this node. */
    id: string;
    /** Human-readable label (used in prompts and logs). */
    label: string;
    /** The actual content returned when this node is matched. */
    content?: string;
    /** Keywords for deterministic keyword routing. */
    keywords?: string[];
    /** Short description of this node (used by LLM router for classification). */
    description?: string;
    /** Child nodes — enables hierarchical trees. */
    children?: TreeNode[];
    /** Arbitrary metadata attached to matched documents. */
    metadata?: Record<string, any>;
}

export interface TreeSpec {
    /** Top-level nodes of the knowledge tree. */
    nodes: TreeNode[];
    /** Default routing strategy when none is specified per-query. */
    defaultStrategy?: RoutingStrategy;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export type RoutingStrategy = "keyword" | "llm";

export interface LLMRouterConfig {
    /**
     * LLM-agnostic completion function.
     * Developer provides their own — works with any model / SDK.
     */
    complete: (prompt: string) => Promise<string>;
}

export interface TreeStoreConfig {
    /** The knowledge tree specification. */
    tree: TreeSpec;
    /** Optional LLM router config — required only when using strategy: "llm". */
    llm?: LLMRouterConfig;
}

// ─── Query ───────────────────────────────────────────────────────────────────

export interface TreeQueryOptions {
    /** Routing strategy override (defaults to tree's defaultStrategy or "keyword"). */
    strategy?: RoutingStrategy;
    /** Maximum number of nodes to return. */
    maxNodes?: number;
    /** Minimum confidence threshold (0–1). Nodes below this are excluded. */
    minConfidence?: number;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface ResolvedTreeNode {
    /** Node id. */
    id: string;
    /** Dot-separated path from root (e.g. "auth.login"). */
    path: string;
    /** Node label. */
    label: string;
    /** Node content (empty string if node has no content). */
    content: string;
    /** Confidence score (0–1). */
    confidence: number;
    /** Attached metadata. */
    metadata?: Record<string, any>;
}

export interface TreeRouteResult {
    /** Dot-separated paths of matched nodes. */
    paths: string[];
    /** Fully resolved matched nodes. */
    nodes: ResolvedTreeNode[];
    /** Which strategy produced this result. */
    strategy: RoutingStrategy;
    /** Highest confidence among matched nodes. */
    confidence: number;
}

// ─── Router interface ────────────────────────────────────────────────────────

export interface TreeRouter {
    route(query: string, options?: TreeQueryOptions): Promise<TreeRouteResult>;
}

// ─── Duck-typed interface for RAGEngine integration ──────────────────────────

export interface TreeStoreQueryable {
    query(query: string, options?: TreeQueryOptions): Promise<RAGDocument[]>;
}
