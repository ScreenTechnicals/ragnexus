/**
 * RagNexus TreeStore + VectorStore Demo
 * ──────────────────────────────────────
 *
 * This example shows how TreeStore (structured knowledge) and VectorStore
 * (unstructured content) work together to build an AI assistant that:
 *
 *   1. Answers pricing/auth/feature questions from a DETERMINISTIC knowledge
 *      tree — the AI literally cannot hallucinate because it only sees the
 *      developer's exact node content.
 *
 *   2. Answers free-form questions from crawled/embedded docs in the vector
 *      store — classic RAG for blog posts, changelogs, docs, etc.
 *
 *   3. When both match, the tree results are PREPENDED (higher priority) so
 *      the structured facts always win over fuzzy vector matches.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx vite-node examples/tree-store-demo.ts
 */

import "dotenv/config";
import OpenAI from "openai";
import {
    createRag,
    InMemoryVectorStore,
    OpenAIEmbedder,
} from "../src";
import { TreeStore } from "../src/tree-store";
import type { TreeSpec } from "../src/tree-store";

// ─── 1. Define the knowledge tree ───────────────────────────────────────────
//
// This is your single source of truth. The AI can ONLY surface content that
// exists in these nodes. No hallucination, no drift, no "I think the price
// might be..." — it's deterministic.

const knowledgeTree: TreeSpec = {
    nodes: [
        {
            id: "pricing",
            label: "Pricing",
            content: "We offer three plans: Free, Pro ($29/mo), and Enterprise (custom). All plans include core API access. Annual billing saves 20%.",
            keywords: ["pricing", "price", "cost", "plan", "billing", "subscription", "how much"],
            description: "Pricing plans and billing information",
            children: [
                {
                    id: "free",
                    label: "Free Plan",
                    content: "The Free plan includes: 1,000 API calls/month, 1 project, community support, and 5MB storage. No credit card required.",
                    keywords: ["free", "free plan", "free tier", "starter"],
                    description: "Free tier details and limits",
                },
                {
                    id: "pro",
                    label: "Pro Plan",
                    content: "The Pro plan ($29/month) includes: 100,000 API calls/month, unlimited projects, email support (24h SLA), 10GB storage, custom domains, and advanced analytics.",
                    keywords: ["pro", "pro plan", "professional", "twenty nine", "$29"],
                    description: "Pro tier details, pricing, and features",
                },
                {
                    id: "enterprise",
                    label: "Enterprise Plan",
                    content: "Enterprise pricing is custom. Includes: unlimited API calls, dedicated infrastructure, 99.99% SLA, SSO/SAML, audit logs, priority support (1h SLA), and a dedicated account manager. Contact sales@example.com.",
                    keywords: ["enterprise", "enterprise plan", "custom pricing", "dedicated", "sla"],
                    description: "Enterprise tier with custom pricing and SLA",
                },
            ],
        },
        {
            id: "auth",
            label: "Authentication",
            content: "We support three authentication methods: API keys, OAuth 2.0, and JWT tokens. All API requests must include authentication.",
            keywords: ["auth", "authentication", "login", "api key", "oauth", "jwt", "token", "sign in"],
            description: "Authentication methods and setup",
            children: [
                {
                    id: "api-keys",
                    label: "API Keys",
                    content: "Generate API keys from the Dashboard > Settings > API Keys. Keys are prefixed with 'rnx_'. Store them securely — they grant full account access. You can create up to 10 keys and revoke any key instantly.",
                    keywords: ["api key", "api keys", "key", "rnx_", "generate key", "dashboard"],
                    description: "How to create and manage API keys",
                },
                {
                    id: "oauth",
                    label: "OAuth 2.0",
                    content: "OAuth 2.0 flow: 1) Register your app at Dashboard > OAuth Apps, 2) Redirect users to /oauth/authorize, 3) Exchange the code at /oauth/token, 4) Use the access_token in the Authorization header. Tokens expire after 1 hour; use the refresh_token to renew.",
                    keywords: ["oauth", "oauth2", "authorization", "redirect", "access token", "refresh token"],
                    description: "OAuth 2.0 authorization flow",
                },
            ],
        },
        {
            id: "limits",
            label: "Rate Limits",
            content: "Rate limits depend on your plan: Free = 10 req/sec, Pro = 100 req/sec, Enterprise = custom. When you exceed the limit, the API returns 429 Too Many Requests with a Retry-After header. Implement exponential backoff for best results.",
            keywords: ["rate limit", "throttle", "429", "too many requests", "req/sec", "requests per second"],
            description: "API rate limiting and throttling",
        },
        {
            id: "sdks",
            label: "SDKs & Libraries",
            content: "Official SDKs: JavaScript/TypeScript (npm install ragnexus), Python (pip install ragnexus), Go (go get github.com/ragnexus/go-sdk). Community SDKs available for Ruby, PHP, and Rust. All SDKs support streaming responses.",
            keywords: ["sdk", "library", "npm", "pip", "install", "javascript", "python", "go", "typescript"],
            description: "Official and community SDK installation",
        },
    ],
    defaultStrategy: "keyword",
};

// ─── 2. Set up RagNexus engine + TreeStore ──────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const vectorStore = new InMemoryVectorStore(embedder);

// Create the tree store
const treeStore = new TreeStore({ tree: knowledgeTree });

// Create the RAG engine with BOTH vector store and tree store
const rag = createRag({
    storage: { vector: vectorStore },
    embedder,
    guardrails: { minRelevanceScore: 0.3, maxTokens: 4096 },
    treeStore, // ← structured knowledge plugged in
});

// ─── 3. Seed the vector store with some unstructured content ────────────────
//
// In production you'd crawl docs / embed markdown files. Here we add a few
// sample docs that the tree does NOT cover — this shows the hybrid power.

async function seedVectorStore() {
    await rag.upsertDocuments([
        {
            id: "changelog-v2",
            text: "Changelog v2.3.0 (March 2026): Added webhook support for real-time event notifications. New endpoints: POST /webhooks, GET /webhooks, DELETE /webhooks/:id. Webhooks support retry with exponential backoff. Events: document.created, document.updated, document.deleted, query.completed.",
            source: "changelog",
        },
        {
            id: "blog-performance",
            text: "Blog: How We Achieved 99.99% Uptime — Our infrastructure runs on multi-region Kubernetes clusters with automatic failover. We use read replicas for vector search, write-ahead logging for durability, and circuit breakers to isolate failures. Average query latency is 45ms at p95.",
            source: "blog",
        },
        {
            id: "tutorial-quickstart",
            text: "Quick Start Tutorial: 1) Install: npm install ragnexus, 2) Create an embedder: new OpenAIEmbedder(), 3) Create a store: new InMemoryVectorStore(embedder), 4) Add documents: await rag.upsertDocuments(docs), 5) Query: const context = await rag.buildContext({ messages }). That's it — 5 lines to production RAG.",
            source: "tutorial",
        },
    ]);
}

// ─── 4. Demo queries ────────────────────────────────────────────────────────

const DEMO_QUERIES = [
    // Tree-only queries (keyword matches → deterministic answers)
    "How much does the Pro plan cost?",
    "How do I create an API key?",
    "What are the rate limits?",

    // Vector-only queries (no tree keywords match → falls through to RAG)
    "Tell me about the webhook support in v2.3.0",
    "How does your infrastructure achieve high uptime?",

    // Hybrid query (tree matches "SDK" node + vector matches quickstart tutorial)
    "How do I install the JavaScript SDK and get started?",
];

async function runDemo() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  RagNexus TreeStore + VectorStore Demo");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Show the knowledge tree structure
    console.log("Knowledge Tree Paths:");
    for (const path of treeStore.listPaths()) {
        const node = treeStore.getNodeByPath(path);
        const depth = path.split(".").length - 1;
        const indent = "  ".repeat(depth);
        console.log(`  ${indent}${path} → "${node?.label}"`);
    }
    console.log();

    // Seed vector store
    console.log("Seeding vector store with 3 unstructured docs (changelog, blog, tutorial)...\n");
    await seedVectorStore();

    // Run each demo query
    for (const query of DEMO_QUERIES) {
        console.log("───────────────────────────────────────────────────────────────");
        console.log(`  Q: ${query}`);
        console.log("───────────────────────────────────────────────────────────────");

        // Show which tree nodes matched (for educational purposes)
        const treeResult = await treeStore.route(query);
        if (treeResult.nodes.length > 0) {
            console.log(
                `  Tree: ${treeResult.nodes.map((n) => `${n.path} (${(n.confidence * 100).toFixed(0)}%)`).join(", ")}`
            );
        } else {
            console.log("  Tree: no match → falling through to vector search");
        }

        // Build context with both tree + vector results merged
        const messages = await rag.buildContext({
            messages: [
                { role: "system", content: "You are a helpful product support assistant. Answer concisely in 2-3 sentences." },
                { role: "user", content: query },
            ],
        });

        // Call OpenAI with the enriched context
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages as any,
            temperature: 0,
            max_tokens: 200,
        });

        const answer = response.choices[0]?.message?.content ?? "(no response)";
        console.log(`\n  A: ${answer}\n`);
    }

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Demo complete!");
    console.log("");
    console.log("  Key takeaway: Tree queries are DETERMINISTIC — the AI can only");
    console.log("  answer from your exact node content. No hallucination possible.");
    console.log("  Vector queries handle everything else (blogs, changelogs, etc).");
    console.log("═══════════════════════════════════════════════════════════════");
}

runDemo().catch(console.error);
