import { TreeStoreError } from "../errors";
import {
    LLMRouterConfig,
    ResolvedTreeNode,
    RoutingStrategy,
    TreeNode,
    TreeQueryOptions,
    TreeRouteResult,
    TreeRouter,
} from "../types";

// ─── Internal types ──────────────────────────────────────────────────────────

interface FlatNode {
    id: string;
    path: string;
    label: string;
    content: string;
    description: string;
    metadata?: Record<string, any>;
}

interface LLMClassification {
    id: string;
    confidence: number;
}

// ─── LLM Router ──────────────────────────────────────────────────────────────

export class LLMRouter implements TreeRouter {
    private flatNodes: FlatNode[] = [];
    private config: LLMRouterConfig;

    constructor(nodes: TreeNode[], config: LLMRouterConfig) {
        this.config = config;
        this.buildFlatList(nodes, "");
    }

    private buildFlatList(nodes: TreeNode[], parentPath: string): void {
        for (const node of nodes) {
            const path = parentPath ? `${parentPath}.${node.id}` : node.id;

            this.flatNodes.push({
                id: node.id,
                path,
                label: node.label,
                content: node.content ?? "",
                description: node.description ?? node.label,
                metadata: node.metadata,
            });

            if (node.children) {
                this.buildFlatList(node.children, path);
            }
        }
    }

    /**
     * Build the classification prompt listing all nodes for the LLM.
     */
    public buildPrompt(query: string): string {
        const nodeList = this.flatNodes
            .map((n) => `- id: "${n.id}" | path: "${n.path}" | description: "${n.description}"`)
            .join("\n");

        return `You are a classification system. Given a user query and a list of knowledge tree nodes, return the most relevant node(s).

NODES:
${nodeList}

USER QUERY: "${query}"

Respond ONLY with a JSON array of objects, each with "id" (string) and "confidence" (number 0-1).
Example: [{"id": "login", "confidence": 0.95}]

Return an empty array [] if no nodes match.`;
    }

    /**
     * Parse the LLM response, handling markdown fences and extra text.
     */
    public parseResponse(response: string): LLMClassification[] {
        // Strip markdown code fences if present
        let cleaned = response.trim();
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
            cleaned = fenceMatch[1].trim();
        }

        // Try to find JSON array in the response
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
            return [];
        }

        try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (!Array.isArray(parsed)) return [];

            return parsed
                .filter(
                    (item: any) =>
                        typeof item === "object" &&
                        item !== null &&
                        typeof item.id === "string" &&
                        typeof item.confidence === "number"
                )
                .map((item: any) => ({
                    id: item.id,
                    confidence: Math.max(0, Math.min(1, item.confidence)),
                }));
        } catch {
            return [];
        }
    }

    public async route(query: string, options?: TreeQueryOptions): Promise<TreeRouteResult> {
        const maxNodes = options?.maxNodes ?? 5;
        const minConfidence = options?.minConfidence ?? 0;

        const prompt = this.buildPrompt(query);

        let response: string;
        try {
            response = await this.config.complete(prompt);
        } catch (err) {
            throw new TreeStoreError("LLM router: completion failed", { cause: err });
        }

        const classifications = this.parseResponse(response);

        // Build a lookup map for flat nodes by id
        const nodeMap = new Map(this.flatNodes.map((n) => [n.id, n]));

        const resolved: ResolvedTreeNode[] = [];
        for (const cls of classifications) {
            if (cls.confidence < minConfidence) continue;

            const flat = nodeMap.get(cls.id);
            if (!flat) continue;

            resolved.push({
                id: flat.id,
                path: flat.path,
                label: flat.label,
                content: flat.content,
                confidence: cls.confidence,
                metadata: flat.metadata,
            });
        }

        // Sort by confidence descending
        resolved.sort((a, b) => b.confidence - a.confidence);
        const top = resolved.slice(0, maxNodes);

        return {
            paths: top.map((n) => n.path),
            nodes: top,
            strategy: "llm" as RoutingStrategy,
            confidence: top.length > 0 ? top[0].confidence : 0,
        };
    }
}
