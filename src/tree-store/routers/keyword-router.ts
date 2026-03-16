import { TreeStoreError } from "../errors";
import {
    ResolvedTreeNode,
    RoutingStrategy,
    TreeNode,
    TreeQueryOptions,
    TreeRouteResult,
    TreeRouter,
} from "../types";

// ─── Internal index entry ────────────────────────────────────────────────────

interface IndexedNode {
    id: string;
    path: string;
    label: string;
    content: string;
    keywords: string[];
    metadata?: Record<string, any>;
}

// ─── Keyword Router ──────────────────────────────────────────────────────────

export class KeywordRouter implements TreeRouter {
    private index: IndexedNode[] = [];

    constructor(nodes: TreeNode[]) {
        this.buildIndex(nodes, "");
    }

    /**
     * Recursively flatten the tree into an index of nodes with their paths
     * and lowercased keywords.
     */
    private buildIndex(nodes: TreeNode[], parentPath: string): void {
        for (const node of nodes) {
            const path = parentPath ? `${parentPath}.${node.id}` : node.id;

            if (node.keywords && node.keywords.length > 0) {
                this.index.push({
                    id: node.id,
                    path,
                    label: node.label,
                    content: node.content ?? "",
                    keywords: node.keywords.map((k) => k.toLowerCase()),
                    metadata: node.metadata,
                });
            }

            if (node.children) {
                this.buildIndex(node.children, path);
            }
        }
    }

    /**
     * Route a query to the best-matching nodes via keyword overlap scoring.
     *
     * Score per node = matchedKeywords / totalKeywords
     * Supports multi-word keywords (e.g. "enterprise plan").
     */
    public async route(query: string, options?: TreeQueryOptions): Promise<TreeRouteResult> {
        const maxNodes = options?.maxNodes ?? 5;
        const minConfidence = options?.minConfidence ?? 0;
        const queryLower = query.toLowerCase();

        const scored: { node: IndexedNode; score: number }[] = [];

        for (const node of this.index) {
            let matched = 0;
            for (const keyword of node.keywords) {
                if (queryLower.includes(keyword)) {
                    matched++;
                }
            }

            if (matched === 0) continue;

            const score = matched / node.keywords.length;
            if (score >= minConfidence) {
                scored.push({ node, score });
            }
        }

        // Sort by score descending, then by path for deterministic ordering
        scored.sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path));

        const top = scored.slice(0, maxNodes);

        const nodes: ResolvedTreeNode[] = top.map(({ node, score }) => ({
            id: node.id,
            path: node.path,
            label: node.label,
            content: node.content,
            confidence: score,
            metadata: node.metadata,
        }));

        return {
            paths: nodes.map((n) => n.path),
            nodes,
            strategy: "keyword" as RoutingStrategy,
            confidence: nodes.length > 0 ? nodes[0].confidence : 0,
        };
    }
}
