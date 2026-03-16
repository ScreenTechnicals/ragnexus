import { useState } from "react";
import { Link } from "react-router-dom";
import CodeBlock from "./CodeBlock";

// ─── Scenario data ──────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "support-bot",
    icon: "💬",
    title: "Customer Support Bot",
    subtitle: "Crawl your docs site, answer only from your content",
    problem:
      "Your support bot hallucinates product features that don't exist, gives wrong pricing, and invents API endpoints — destroying user trust.",
    solution:
      "RagNexus crawls your documentation, chunks it, embeds it into a vector store, and the 4-layer guardrails ensure the bot ONLY answers from retrieved content. If it's not in the docs, it says so.",
    conversation: [
      { role: "user", text: "How do I reset my password?" },
      {
        role: "assistant",
        text: 'To reset your password, go to Settings > Security > Reset Password. You\'ll receive an email with a reset link valid for 24 hours. [Source: docs/security.md]',
      },
      { role: "user", text: "Can I reset it via the API?" },
      {
        role: "assistant",
        text: "Yes, send a POST request to /api/auth/password-reset with your email in the body. The endpoint returns 202 Accepted and triggers the reset email. [Source: api-reference/auth.md]",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore, WebCrawler, TextSplitter } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const rag = createRag({
  storage: { vector: new InMemoryVectorStore(embedder) },
  embedder,
  guardrails: { minRelevanceScore: 0.4, maxTokens: 4096 },
});

// Crawl and embed your docs site
const crawler = new WebCrawler({ maxRequestsPerCrawl: 50 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const result = await crawler.scrapeWithLinks(["https://docs.yourapp.com"]);
await rag.upsertDocuments(splitter.splitDocuments(result.docs));

// Answer from ONLY your docs — never hallucinate
const messages = await rag.buildContext({
  messages: [{ role: "user", content: "How do I reset my password?" }],
  systemPrompt: "You are a support agent. Answer ONLY from the retrieved docs.",
});`,
  },
  {
    id: "pricing-bot",
    icon: "💰",
    title: "SaaS Pricing Bot",
    subtitle: "TreeStore: deterministic pricing answers, zero drift",
    problem:
      'Standard RAG can "almost" answer pricing questions but sometimes invents discounts, wrong tier limits, or mixes up plan features — a costly mistake for a SaaS.',
    solution:
      "TreeStore lets you define your exact pricing as a structured tree. The keyword router deterministically matches the query to the right plan node. The AI can only see that node's content — it literally cannot invent a price.",
    conversation: [
      { role: "user", text: "How much is the Pro plan?" },
      {
        role: "assistant",
        text: "The Pro plan is $29/month and includes 100,000 API calls/month, unlimited projects, email support with 24h SLA, 10GB storage, custom domains, and advanced analytics. Annual billing saves 20%. [Source: tree-store:pricing.pro]",
      },
      { role: "user", text: "What about the free tier limits?" },
      {
        role: "assistant",
        text: "The Free plan includes 1,000 API calls/month, 1 project, community support, and 5MB storage. No credit card required. [Source: tree-store:pricing.free]",
      },
    ],
    code: `import { TreeStore } from "ragnexus/tree-store";

const store = new TreeStore({
  tree: {
    nodes: [
      {
        id: "pricing",
        label: "Pricing",
        content: "We offer Free, Pro ($29/mo), and Enterprise plans. Annual saves 20%.",
        keywords: ["pricing", "price", "cost", "plan", "how much"],
        children: [
          {
            id: "free",
            label: "Free Plan",
            content: "Free: 1,000 API calls/month, 1 project, community support, 5MB storage.",
            keywords: ["free", "free plan", "free tier", "starter"],
          },
          {
            id: "pro",
            label: "Pro Plan",
            content: "Pro ($29/mo): 100K API calls, unlimited projects, email support, 10GB.",
            keywords: ["pro", "pro plan", "$29", "professional"],
          },
          {
            id: "enterprise",
            label: "Enterprise",
            content: "Enterprise: custom pricing, unlimited calls, 99.99% SLA, SSO, dedicated AM.",
            keywords: ["enterprise", "custom", "dedicated", "sla"],
          },
        ],
      },
    ],
  },
});

// Deterministic routing — no LLM needed for matching
const result = await store.route("How much is the Pro plan?");
// → { nodes: [{ id: "pro", path: "pricing.pro", confidence: 0.66 }], strategy: "keyword" }

const messages = await store.buildContext({
  messages: [{ role: "user", content: "How much is the Pro plan?" }],
});`,
  },
  {
    id: "code-qa",
    icon: "🧑‍💻",
    title: "Code Repository Q&A",
    subtitle: "Embed a codebase, ask questions about it",
    problem:
      'Developers waste hours reading unfamiliar codebases. Searching for "where is auth handled?" across 500 files is painful.',
    solution:
      "Crawl a GitHub repo, chunk the files with smart text splitting, embed them, and ask natural language questions. Hybrid search handles both keyword queries (\"middleware\") and semantic queries (\"how does error handling work?\").",
    conversation: [
      { role: "user", text: "Where is the authentication middleware?" },
      {
        role: "assistant",
        text: "The authentication middleware is in src/middleware/auth.ts. It validates JWT tokens from the Authorization header, checks expiry, and attaches the decoded user to req.user. It's applied globally in src/app.ts via app.use(authMiddleware). [Source: src/middleware/auth.ts]",
      },
      { role: "user", text: "How does the rate limiter work?" },
      {
        role: "assistant",
        text: "The rate limiter in src/middleware/rate-limit.ts uses a sliding window algorithm with Redis. Each user gets 100 requests per minute (configurable per route). When exceeded, it returns 429 with a Retry-After header. [Source: src/middleware/rate-limit.ts]",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore, TextSplitter } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const vectorStore = new InMemoryVectorStore(embedder);
const rag = createRag({
  storage: { vector: vectorStore },
  embedder,
  guardrails: { minRelevanceScore: 0.3 },
});

// Chunk source files with code-aware splitting
const splitter = new TextSplitter({ chunkSize: 1200, chunkOverlap: 200 });
const codeFiles = [
  { id: "auth-middleware", text: "// src/middleware/auth.ts\\n...", source: "src/middleware/auth.ts" },
  { id: "rate-limiter", text: "// src/middleware/rate-limit.ts\\n...", source: "src/middleware/rate-limit.ts" },
  // ... embed all source files
];
await rag.upsertDocuments(splitter.splitDocuments(codeFiles));

// Hybrid search: keyword for exact terms, semantic for concepts
const messages = await rag.buildContext({
  messages: [{ role: "user", content: "Where is auth handled?" }],
  searchMode: "hybrid",  // BM25 + cosine blend
  alpha: 0.6,            // slightly favor semantic
});`,
  },
  {
    id: "legal-faq",
    icon: "⚖️",
    title: "Compliance & Legal FAQ",
    subtitle: "TreeStore: exact regulatory answers, never approximate",
    problem:
      "In regulated industries (finance, healthcare, legal), an AI that \"approximately\" answers compliance questions is a liability. Every answer must be traceable to an approved source.",
    solution:
      "Define your compliance policies as a TreeStore. Each node contains lawyer-reviewed content. The keyword router matches regulatory terms deterministically. Combined with the LLM router, natural language questions also route correctly.",
    conversation: [
      { role: "user", text: "What is our data retention policy?" },
      {
        role: "assistant",
        text: "Per our Data Retention Policy (DRP-2024-03): Customer data is retained for 3 years after account closure. Billing records are retained for 7 years per IRS requirements. Audit logs are retained indefinitely. Users can request data deletion via privacy@company.com within 30 days. [Source: tree-store:compliance.data-retention]",
      },
      { role: "user", text: "Are we GDPR compliant?" },
      {
        role: "assistant",
        text: "Yes. We are GDPR compliant as of January 2024. Key measures: data processing agreements with all sub-processors, EU data stored in eu-west-1, right to erasure honored within 72 hours, DPO contact: dpo@company.com. Full compliance report available at /compliance/gdpr. [Source: tree-store:compliance.gdpr]",
      },
    ],
    code: `import { TreeStore } from "ragnexus/tree-store";
import OpenAI from "openai";

const openai = new OpenAI();

const store = new TreeStore({
  tree: {
    nodes: [
      {
        id: "compliance",
        label: "Compliance",
        content: "Our compliance framework covers GDPR, SOC2, HIPAA, and data retention.",
        keywords: ["compliance", "regulation", "policy", "legal"],
        children: [
          {
            id: "gdpr",
            label: "GDPR",
            content: "GDPR compliant since Jan 2024. EU data in eu-west-1. Right to erasure within 72h. DPO: dpo@company.com.",
            keywords: ["gdpr", "data protection", "eu", "erasure", "dpo"],
            description: "GDPR compliance details and contacts",
          },
          {
            id: "data-retention",
            label: "Data Retention",
            content: "Customer data: 3 years post-closure. Billing: 7 years (IRS). Audit logs: indefinite. Deletion requests via privacy@company.com within 30 days.",
            keywords: ["retention", "data retention", "deletion", "how long"],
            description: "Data retention periods and deletion policy",
          },
          {
            id: "soc2",
            label: "SOC 2",
            content: "SOC 2 Type II certified. Annual audit by Deloitte. Report available under NDA.",
            keywords: ["soc2", "soc 2", "audit", "certification"],
            description: "SOC 2 certification and audit details",
          },
        ],
      },
    ],
  },
  // LLM router for natural language compliance questions
  llm: {
    complete: async (prompt) => {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      return res.choices[0].message.content ?? "";
    },
  },
});

// Natural language → LLM routes to the right compliance node
const result = await store.route("Are we allowed to delete user data?", { strategy: "llm" });`,
  },
  {
    id: "multi-tenant",
    icon: "🏢",
    title: "Multi-Tenant SaaS Knowledge Base",
    subtitle: "Per-tenant vector stores with memory isolation",
    problem:
      "In a multi-tenant SaaS, each customer has different documentation, different products, and different user preferences. Cross-tenant data leakage is a critical security issue.",
    solution:
      "RagNexus gives each tenant their own vector store and memory store. Guardrails prevent cross-contamination. Per-user memory tracks individual preferences within each tenant.",
    conversation: [
      { role: "user", text: "[Tenant: Acme Corp] What's our API rate limit?" },
      {
        role: "assistant",
        text: "Acme Corp's Enterprise plan includes 500 requests/second with burst up to 1,000. Your team requested this increase in ticket #4521 last month. [Source: acme-docs/api-limits.md]",
      },
      {
        role: "user",
        text: "[Tenant: StartupXYZ] What's our API rate limit?",
      },
      {
        role: "assistant",
        text: "StartupXYZ is on the Pro plan with 100 requests/second. To increase your limit, upgrade to Enterprise or contact sales@platform.com. [Source: startupxyz-docs/plans.md]",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore, RedisMemoryStore } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });

// Each tenant gets their own isolated RAG engine
function createTenantRag(tenantId: string) {
  return createRag({
    storage: {
      vector: new InMemoryVectorStore(embedder),       // tenant-isolated vectors
      memory: new RedisMemoryStore(redis, tenantId),   // tenant-scoped memory
    },
    embedder,
    guardrails: { minRelevanceScore: 0.4, maxTokens: 4096 },
  });
}

const tenants = new Map();
tenants.set("acme", createTenantRag("acme"));
tenants.set("startupxyz", createTenantRag("startupxyz"));

// Ingest tenant-specific docs
await tenants.get("acme").upsertDocuments(acmeDocs);
await tenants.get("startupxyz").upsertDocuments(startupDocs);

// Query is scoped to tenant — zero cross-contamination
const messages = await tenants.get("acme").buildContext({
  messages: [{ role: "user", content: "What's our API rate limit?" }],
  userId: "user_123",  // per-user memory within the tenant
  memory: true,
});`,
  },
  {
    id: "hybrid-kb",
    icon: "🌳",
    title: "Hybrid Knowledge Base",
    subtitle: "TreeStore + VectorStore working together",
    problem:
      "Some knowledge is structured (pricing, policies, feature specs) and must be exact. Other knowledge is unstructured (blog posts, changelogs, tutorials) and needs semantic search. Using only one approach leaves gaps.",
    solution:
      "Plug TreeStore into RAGEngine alongside a vector store. Structured questions route deterministically through the tree. Unstructured questions fall through to vector search. When both match, tree results take priority.",
    conversation: [
      { role: "user", text: "What's the rate limit on the free plan?" },
      {
        role: "assistant",
        text: "The Free plan has a rate limit of 10 requests/second. When exceeded, the API returns 429 Too Many Requests with a Retry-After header. [Source: tree-store:limits — deterministic match]",
      },
      { role: "user", text: "What was added in the latest release?" },
      {
        role: "assistant",
        text: "In v2.3.0 (March 2026): webhook support for real-time event notifications with new endpoints POST/GET/DELETE /webhooks. Supports retry with exponential backoff. Events include document.created, document.updated, document.deleted, and query.completed. [Source: vector-store:changelog — semantic match]",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore } from "ragnexus";
import { TreeStore } from "ragnexus/tree-store";

// Structured knowledge — deterministic, exact
const treeStore = new TreeStore({
  tree: {
    nodes: [
      {
        id: "limits",
        label: "Rate Limits",
        content: "Free: 10 req/sec. Pro: 100 req/sec. Enterprise: custom. 429 on exceed.",
        keywords: ["rate limit", "throttle", "429", "requests per second"],
      },
      {
        id: "pricing",
        label: "Pricing",
        content: "Free ($0), Pro ($29/mo), Enterprise (custom). Annual saves 20%.",
        keywords: ["pricing", "price", "cost", "plan"],
      },
    ],
  },
});

// Unstructured knowledge — semantic, flexible
const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const rag = createRag({
  storage: { vector: new InMemoryVectorStore(embedder) },
  embedder,
  treeStore,  // ← tree results are merged BEFORE vector results
});

// Embed changelogs, blog posts, tutorials
await rag.upsertDocuments([
  { id: "changelog-v2.3", text: "v2.3.0: Added webhook support...", source: "changelog" },
  { id: "blog-perf", text: "How we achieved 99.99% uptime...", source: "blog" },
]);

// buildContext() merges both: tree (high priority) + vector (fallback)
const messages = await rag.buildContext({
  messages: [{ role: "user", content: "What's the rate limit?" }],
});`,
  },
  {
    id: "research",
    icon: "🔬",
    title: "Research Paper Assistant",
    subtitle: "Hybrid search over academic content",
    problem:
      "Research queries are a mix of keyword-heavy jargon (\"BERT attention mechanism\") and natural language (\"how does the model handle long sequences?\"). Pure semantic search misses exact terms; pure keyword search misses intent.",
    solution:
      "RagNexus hybrid search blends BM25 keyword scoring with cosine semantic similarity. The alpha parameter lets you tune the balance. Add a cross-encoder reranker for maximum precision on academic content.",
    conversation: [
      { role: "user", text: "What is the BERT attention mechanism?" },
      {
        role: "assistant",
        text: "BERT uses multi-head self-attention where each token attends to every other token in the sequence. The attention weights are computed as softmax(QK^T/sqrt(d_k))V where Q, K, V are linear projections. BERT uses 12 attention heads in the base model and 16 in the large model. [Source: papers/bert-2019.pdf, Section 3.1]",
      },
      {
        role: "user",
        text: "How do transformer models handle long sequences?",
      },
      {
        role: "assistant",
        text: "Standard transformers have O(n^2) attention complexity. Longformer introduces sliding window attention + global tokens for O(n) complexity. BigBird combines random, window, and global attention. Flash Attention reduces memory via tiling. Most models truncate at 512-4096 tokens. [Source: papers/longformer-2020.pdf, papers/bigbird-2021.pdf]",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore, TextSplitter, CohereReranker } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const rag = createRag({
  storage: { vector: new InMemoryVectorStore(embedder) },
  embedder,
  reranker: new CohereReranker({ topN: 5 }),  // cross-encoder for academic precision
  guardrails: { minRelevanceScore: 0.3, maxTokens: 6000 },
});

// Chunk papers with larger overlap for academic context
const splitter = new TextSplitter({ chunkSize: 1500, chunkOverlap: 300 });
const papers = [
  { id: "bert", text: "BERT: Pre-training of Deep Bidirectional Transformers...", source: "papers/bert-2019.pdf" },
  { id: "longformer", text: "Longformer: The Long-Document Transformer...", source: "papers/longformer-2020.pdf" },
];
await rag.upsertDocuments(splitter.splitDocuments(papers));

// Hybrid search: BM25 catches "BERT attention", cosine catches semantic meaning
const messages = await rag.buildContext({
  messages: [{ role: "user", content: "What is the BERT attention mechanism?" }],
  searchMode: "hybrid",
  alpha: 0.5,  // equal blend of keyword + semantic
  topK: 10,    // more candidates for the reranker
});`,
  },
  {
    id: "memory",
    icon: "🧠",
    title: "Personalized Learning Assistant",
    subtitle: "Per-user memory for adaptive responses",
    problem:
      "Users repeat preferences every session: \"I'm a beginner\", \"I prefer Python\", \"explain simply\". Without memory, the AI treats every conversation as the first.",
    solution:
      "RagNexus memory stores per-user facts with importance scoring. Facts are automatically injected into context by priority. The deduplication engine prevents redundant memories.",
    conversation: [
      { role: "user", text: "I'm a beginner Python developer." },
      {
        role: "assistant",
        text: "Got it! I'll keep explanations beginner-friendly and use Python examples.",
      },
      { role: "user", text: "[Next session] How do I make an API call?" },
      {
        role: "assistant",
        text: "Since you're learning Python, here's the simplest way using the requests library:\n\nimport requests\nresponse = requests.get('https://api.example.com/data')\nprint(response.json())\n\nThis sends a GET request and prints the JSON response. Want me to explain each line?",
      },
    ],
    code: `import { createRag, OpenAIEmbedder, InMemoryVectorStore, InMemoryStore, MemoryManager } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const memoryStore = new InMemoryStore();
const rag = createRag({
  storage: {
    vector: new InMemoryVectorStore(embedder),
    memory: memoryStore,  // enable per-user memory
  },
  embedder,
});

// Store user preferences as facts
const memoryManager = new MemoryManager(memoryStore);
await memoryManager.addMemory("user_42", {
  type: "preference",
  content: "User is a beginner Python developer",
  importance: 0.9,   // high priority — always include in context
});
await memoryManager.addMemory("user_42", {
  type: "preference",
  content: "Prefers simple explanations with code examples",
  importance: 0.8,
});

// Memory is auto-injected, sorted by importance
const messages = await rag.buildContext({
  messages: [{ role: "user", content: "How do I make an API call?" }],
  userId: "user_42",
  memory: true,  // ← memory facts injected into context
});
// System message now includes:
// "Relevant memory about the user:
//  - User is a beginner Python developer
//  - Prefers simple explanations with code examples"`,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

function Examples() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === activeScenario) || SCENARIOS[0];

  return (
    <div className="docs-page">
      <header>
        <div
          className="container"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Link to="/" className="logo" style={{ textDecoration: "none" }}>
            RagNexus
          </Link>

          <button
            className="mobile-nav-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isMobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </>
              )}
            </svg>
          </button>

          <nav className={isMobileMenuOpen ? "nav-open" : ""}>
            <Link to="/">Home</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/examples" className="active">
              Examples
            </Link>
            <a
              href="https://github.com/ScreenTechnicals/ragnexus"
              className="github-btn"
            >
              <svg height="20" viewBox="0 0 16 16" width="20" fill="white">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div style={{ marginTop: "80px", padding: "3rem 0" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
              <span className="gradient-text">Real-World Examples</span>
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "1.15rem",
                maxWidth: "650px",
                margin: "0 auto",
              }}
            >
              See how RagNexus solves actual problems — from support bots to
              compliance FAQs. Each scenario shows the problem, the solution,
              a sample conversation, and the code to build it.
            </p>
          </div>

          {/* Scenario picker */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
              marginBottom: "3rem",
            }}
          >
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveScenario(s.id);
                  window.scrollTo({ top: 400, behavior: "smooth" });
                }}
                style={{
                  background:
                    activeScenario === s.id
                      ? "rgba(192, 132, 252, 0.15)"
                      : "var(--bg-card)",
                  border:
                    activeScenario === s.id
                      ? "1px solid var(--primary)"
                      : "1px solid var(--glass-border)",
                  color:
                    activeScenario === s.id
                      ? "var(--primary)"
                      : "var(--text-secondary)",
                  padding: "0.6rem 1.2rem",
                  borderRadius: "99px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {s.icon} {s.title}
              </button>
            ))}
          </div>

          {/* Active scenario detail */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--glass-border)",
              borderRadius: "20px",
              padding: "3rem",
              maxWidth: "900px",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "0.5rem",
              }}
            >
              <span style={{ fontSize: "2rem" }}>{scenario.icon}</span>
              <div>
                <h2
                  style={{
                    fontSize: "1.75rem",
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {scenario.title}
                </h2>
                <p
                  style={{
                    color: "var(--primary)",
                    margin: 0,
                    fontSize: "0.95rem",
                    fontWeight: 500,
                  }}
                >
                  {scenario.subtitle}
                </p>
              </div>
            </div>

            {/* Problem */}
            <div style={{ marginTop: "2rem" }}>
              <h3
                style={{
                  fontSize: "1.1rem",
                  color: "#f87171",
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "#f87171",
                    borderRadius: "50%",
                    display: "inline-block",
                  }}
                />
                The Problem
              </h3>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "1.05rem",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {scenario.problem}
              </p>
            </div>

            {/* Solution */}
            <div style={{ marginTop: "2rem" }}>
              <h3
                style={{
                  fontSize: "1.1rem",
                  color: "#4ade80",
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "#4ade80",
                    borderRadius: "50%",
                    display: "inline-block",
                  }}
                />
                How RagNexus Solves It
              </h3>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "1.05rem",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {scenario.solution}
              </p>
            </div>

            {/* Conversation */}
            <div style={{ marginTop: "2.5rem" }}>
              <h3
                style={{
                  fontSize: "1.1rem",
                  marginBottom: "1rem",
                  color: "var(--text-primary)",
                }}
              >
                Sample Conversation
              </h3>
              <div
                style={{
                  background: "#0a0a0a",
                  borderRadius: "12px",
                  border: "1px solid var(--glass-border)",
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {scenario.conversation.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        background:
                          msg.role === "user"
                            ? "rgba(96, 165, 250, 0.15)"
                            : "rgba(74, 222, 128, 0.15)",
                        color:
                          msg.role === "user" ? "#60a5fa" : "#4ade80",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        marginTop: "2px",
                      }}
                    >
                      {msg.role === "user" ? "User" : "AI"}
                    </span>
                    <p
                      style={{
                        color:
                          msg.role === "user"
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        margin: 0,
                        fontSize: "0.95rem",
                        lineHeight: 1.6,
                      }}
                    >
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Code */}
            <div style={{ marginTop: "2.5rem" }}>
              <h3
                style={{
                  fontSize: "1.1rem",
                  marginBottom: "1rem",
                  color: "var(--text-primary)",
                }}
              >
                Implementation
              </h3>
              <CodeBlock code={scenario.code} language="typescript" />
            </div>
          </div>

          {/* Bottom CTA */}
          <div
            style={{
              textAlign: "center",
              marginTop: "4rem",
              padding: "3rem 0",
            }}
          >
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "1.1rem",
                marginBottom: "1.5rem",
              }}
            >
              Ready to build? Pick a scenario above and start with the code.
            </p>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link to="/docs" className="btn btn-primary">
                Read the Docs
              </Link>
              <a
                href="https://github.com/ScreenTechnicals/ragnexus"
                className="btn btn-outline"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>

      <footer
        style={{
          padding: "40px 0",
          borderTop: "1px solid var(--glass-border)",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Released under MIT License. Part of the ScreenTechnicals project.
        </p>
      </footer>
    </div>
  );
}

export default Examples;
