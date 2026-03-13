import { useState } from "react";
import { Link } from "react-router-dom";
import CodeBlock from "./CodeBlock";

const DOCS_CONTENT = {
  "getting-started": {
    title: "Getting Started",
    content: (
      <>
        <p>
          RagNexus is a deterministic RAG middleware layer that sits between
          your application and your LLM. It provides retrieval, memory,
          guardrails, text chunking, reranking, and hybrid search — all in one
          composable SDK.
        </p>

        <h2>Why RagNexus?</h2>
        <p>
          Standard RAG implementations suffer from{" "}
          <strong>context poisoning</strong>, hallucination, and poor retrieval
          precision. RagNexus fixes this with a structured, multi-layer safety
          pipeline and deterministic context assembly.
        </p>

        <div className="callout">
          <div className="callout-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Philosophy
          </div>
          <p>
            RAG shouldn't be a black box. RagNexus focuses on{" "}
            <strong>predictability</strong>,<strong> safety</strong>, and{" "}
            <strong>accuracy</strong> — the model only answers from retrieved
            context, never from training data gaps.
          </p>
        </div>

        <h3>Installation</h3>
        <CodeBlock code={`npm install ragnexus`} language="bash" />
      </>
    ),
  },

  installation: {
    title: "Detailed Installation",
    content: (
      <>
        <p>
          RagNexus requires Node.js 18+ and supports both CommonJS and ESM
          environments.
        </p>

        <h2>Development Setup</h2>
        <p>
          For local development with persistent storage, clone the repo and use
          the provided Docker stack:
        </p>
        <CodeBlock
          code={`git clone https://github.com/ScreenTechnicals/ragnexus.git\ncd ragnexus\n./docker.sh`}
          language="bash"
        />
        <p>This starts:</p>
        <ul>
          <li>
            <strong>Redis</strong> at <code>localhost:6379</code> — Persistent
            User Memory
          </li>
          <li>
            <strong>Qdrant</strong> at <code>localhost:6333</code> — Vector
            Knowledge Base
          </li>
        </ul>

        <h2>Optional Peer Dependencies</h2>
        <p>Install only what you need for your chosen providers:</p>
        <CodeBlock
          code={`# Reranking (cross-encoder precision boost)
npm install cohere-ai

# Genkit integration
npm install genkit @genkit-ai/googleai

# Vercel AI SDK
npm install ai @ai-sdk/openai`}
          language="bash"
        />
      </>
    ),
  },

  "core-concepts": {
    title: "Core Concepts",
    content: (
      <>
        <p>RagNexus is built around six composable domains:</p>
        <div
          className="feature-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "1.5rem",
            marginTop: "2rem",
          }}
        >
          {[
            {
              title: "Retriever",
              desc: "Finds relevant documents via semantic, keyword, or hybrid BM25+cosine search.",
            },
            {
              title: "TextSplitter",
              desc: "Chunks large documents into overlapping segments with deterministic IDs before embedding.",
            },
            {
              title: "Reranker",
              desc: "Cross-encoder reranking (e.g. Cohere) applied after retrieval for high-precision ordering.",
            },
            {
              title: "Memory",
              desc: "Tracks per-user facts and preferences, injected by importance score.",
            },
            {
              title: "Guardrails",
              desc: "4-layer safety pipeline: relevance filter, density rejection, instruction stripping, token budget.",
            },
            {
              title: "Adapters",
              desc: "Translates context into provider-specific formats: OpenAI, Vercel AI, Anthropic, Gemini, Genkit.",
            },
          ].map(({ title, desc }) => (
            <div
              key={title}
              className="feature-card"
              style={{ padding: "1.5rem" }}
            >
              <h4>{title}</h4>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </>
    ),
  },

  "setup-engine": {
    title: "Setting up the Engine",
    content: (
      <>
        <p>
          <code>createRag</code> is the entry point. Connect your stores and
          configure guardrails, an optional reranker, and an observability hook
          — all in one config object.
        </p>
        <CodeBlock
          code={`import {
  createRag, OpenAIEmbedder,
  InMemoryVectorStore, InMemoryStore,
  CohereReranker
} from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });

const rag = createRag({
  storage: {
    vector: new InMemoryVectorStore(embedder),
    memory: new InMemoryStore(),
  },
  embedder,
  // Optional: cross-encoder reranker for higher precision
  reranker: new CohereReranker({ topN: 3 }),
  guardrails: {
    minRelevanceScore: 0.5,   // Only include relevant docs
    maxTokens: 3000,           // Hard token budget for context
    includeSourceAttribution: true, // Cite sources per document
  },
  // Observability: inspect what was retrieved
  onRetrieve: (docs) => console.log("Retrieved:", docs.map(d => d.source)),
});`}
          language="typescript"
        />
      </>
    ),
  },

  "text-splitting": {
    title: "Text Splitting",
    content: (
      <>
        <p>
          Large scraped pages stored as single documents produce low-quality
          embeddings.
          <code>TextSplitter</code> chunks them into smaller overlapping
          segments before ingestion, dramatically improving retrieval precision.
        </p>

        <h2>Basic Usage</h2>
        <CodeBlock
          code={`import { TextSplitter, WebCrawler } from "ragnexus";

const crawler = new WebCrawler({ headless: true });
const splitter = new TextSplitter({
  chunkSize: 800,     // Target characters per chunk
  chunkOverlap: 100,  // Overlap between chunks for context continuity
});

const docs = await crawler.scrapeBatch(["https://example.com"]);
const chunks = splitter.splitDocuments(docs);
// Each chunk has a deterministic id: sha256(parentId + "::" + chunkIndex)
await rag.addDocuments(chunks);`}
          language="typescript"
        />

        <h2>Custom Separators</h2>
        <CodeBlock
          code={`const splitter = new TextSplitter({
  chunkSize: 1500,
  chunkOverlap: 200,
  // Tried in order — falls back to next if chunk still too large
  separators: ["\\n\\n", "\\n", ". ", " ", ""],
});`}
          language="typescript"
        />

        <div className="callout">
          <div className="callout-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
              <line x1="12" y1="12" x2="12" y2="16" />
            </svg>
            Tip
          </div>
          <p>
            Chunk IDs are deterministic —{" "}
            <code>sha256(parentId + "::" + index)</code> — which means calling{" "}
            <code>upsertDocuments()</code> after a re-crawl will only re-embed
            chunks whose content actually changed.
          </p>
        </div>
      </>
    ),
  },

  "upsert-change-detection": {
    title: "Upsert & Change Detection",
    content: (
      <>
        <p>
          Re-crawling the same URLs without deduplication re-embeds identical
          content and bloats your vector store. RagNexus solves this with
          content-hash-based upsert.
        </p>

        <h2>How it works</h2>
        <ul>
          <li>
            <strong>Skip</strong> — document exists and <code>contentHash</code>{" "}
            matches → no work done
          </li>
          <li>
            <strong>Update</strong> — document exists but content changed →
            delete old embedding, re-embed
          </li>
          <li>
            <strong>Add</strong> — new document → embed and insert
          </li>
        </ul>

        <CodeBlock
          code={`const docs = await crawler.scrapeBatch(urls);
const chunks = splitter.splitDocuments(docs);

// Instead of addDocuments(), use upsertDocuments()
const result = await rag.upsertDocuments(chunks);
console.log(result);
// { added: 12, updated: 2, skipped: 38 }

// Remove stale documents by ID
await rag.removeDocuments(["doc-id-to-remove"]);`}
          language="typescript"
        />

        <div className="callout">
          <div className="callout-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
              <line x1="12" y1="12" x2="12" y2="16" />
            </svg>
            Deterministic IDs
          </div>
          <p>
            The <code>WebCrawler</code> generates doc IDs as{" "}
            <code>sha256(url)</code> — the same URL always produces the same ID.
            This is what makes upsert possible across re-crawls. HTTP{" "}
            <code>ETag</code> and <code>Last-Modified</code> headers are also
            captured in
            <code> metadata</code> when available.
          </p>
        </div>
      </>
    ),
  },

  "hybrid-search": {
    title: "Hybrid Search",
    content: (
      <>
        <p>
          Pure cosine similarity misses keyword-heavy queries. RagNexus supports
          three search modes in
          <code> InMemoryVectorStore</code>:
        </p>
        <ul>
          <li>
            <code>semantic</code> — pure cosine similarity on embeddings{" "}
            <em>(default)</em>
          </li>
          <li>
            <code>keyword</code> — BM25 term-frequency scoring, no embedding
            needed
          </li>
          <li>
            <code>hybrid</code> — normalised BM25 + cosine blended by{" "}
            <code>alpha</code>
          </li>
        </ul>

        <CodeBlock
          code={`// Use searchByText() for keyword / hybrid modes
const results = await vectorStore.searchByText(
  "TypeScript decorator pattern",
  5,         // topK
  "hybrid",  // 'semantic' | 'keyword' | 'hybrid'
  0.5        // alpha: 0 = pure keyword, 1 = pure semantic
);`}
          language="typescript"
        />

        <p>
          BM25 scoring is computed lazily on the first keyword/hybrid search and
          invalidated automatically whenever documents are added, updated, or
          deleted.
        </p>
      </>
    ),
  },

  reranker: {
    title: "Reranking",
    content: (
      <>
        <p>
          Vector search uses a <em>bi-encoder</em> — it compares query and
          document embeddings independently, which is fast but imprecise. A{" "}
          <em>cross-encoder</em> reranker scores the (query, doc) pair jointly,
          which is much more accurate.
        </p>
        <p>
          RagNexus slots a reranker between retrieval and context injection.
          When active, it fetches <strong>3× more candidates</strong> from the
          vector store, reranks them, then trims to <code>topK</code>.
        </p>

        <h2>CohereReranker</h2>
        <CodeBlock
          code={`import { CohereReranker, createRag } from "ragnexus";

const rag = createRag({
  // ...
  reranker: new CohereReranker({
    model: "rerank-v3.5", // default
    topN: 3,              // return top 3 after reranking
    // apiKey: "...",     // or set COHERE_API_KEY env var
  }),
});`}
          language="typescript"
        />

        <h2>Custom Reranker</h2>
        <p>
          Implement the <code>Reranker</code> interface to plug in Jina, Voyage,
          or any other model:
        </p>
        <CodeBlock
          code={`import { Reranker, RAGDocument } from "ragnexus";

class MyReranker implements Reranker {
  async rerank(query: string, docs: RAGDocument[]): Promise<RAGDocument[]> {
    // Score and sort docs, return in descending relevance order
    return docs.sort((a, b) => myScore(query, b) - myScore(query, a));
  }
}`}
          language="typescript"
        />
      </>
    ),
  },

  "guardrails-deep-dive": {
    title: "Guardrails Deep Dive",
    content: (
      <>
        <p>
          RagNexus applies a 4-layer guardrail pipeline to every retrieved
          document before it touches the context window.
        </p>

        <h2>Pipeline Layers</h2>
        <ol>
          <li>
            <strong>Relevance Filtering (Layer 3)</strong> — Discards documents
            below
            <code> minRelevanceScore</code>. Default: <code>0.5</code>.
          </li>
          <li>
            <strong>Density Rejection (Layer 4)</strong> — Rejects the{" "}
            <em>entire document</em> if blocked-pattern matches exceed{" "}
            <code>maxPatternDensity</code> (default: 5% of words). Catches
            unicode tricks that evade simple substring redaction.
          </li>
          <li>
            <strong>Instruction Stripping (Layer 1)</strong> — Replaces
            remaining blocked phrases with <code>[REDACTED]</code> inline.
          </li>
          <li>
            <strong>Token Budget (Layer 2)</strong> — Documents are included
            most-relevant-first until <code>maxTokens</code> is reached.
            Low-value docs are dropped, not truncated mid-sentence.
          </li>
        </ol>

        <h2>Configuration</h2>
        <CodeBlock
          code={`const rag = createRag({
  guardrails: {
    minRelevanceScore: 0.5,          // 0–1, higher = stricter
    maxTokens: 3000,                  // Context budget (~4 chars/token)
    maxPatternDensity: 0.05,          // Reject doc if >5% words match patterns
    includeSourceAttribution: true,   // Show source URL + score per doc
    blockedPatterns: [                // Extend or replace defaults
      "ignore previous instructions",
      "you are now in developer mode",
    ],
  },
});`}
          language="typescript"
        />

        <h2>Anti-Hallucination Grounding</h2>
        <p>
          The context builder automatically injects grounding rules into every
          system message:
        </p>
        <ul>
          <li>
            Answer <em>only</em> from retrieved documents
          </li>
          <li>
            Decline with "I don't have enough information" when context is
            insufficient
          </li>
          <li>No speculation or gap-filling from training data</li>
          <li>Cite document numbers for every fact</li>
        </ul>
        <p>
          When retrieval returns zero usable documents, a{" "}
          <code>[SYSTEM NOTICE]</code> is injected to force a graceful decline
          instead of a hallucinated answer.
        </p>

        <div className="callout">
          <div className="callout-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
              <line x1="12" y1="12" x2="12" y2="16" />
            </svg>
            Security Note
          </div>
          <p>
            Combine RagNexus guardrails with application-level RBAC for full
            defence-in-depth.
          </p>
        </div>
      </>
    ),
  },

  "memory-usage": {
    title: "Memory Management",
    content: (
      <>
        <p>
          Memory stores <strong>facts</strong> about a specific user — their
          name, preferences, context — not documents. Facts are sorted by{" "}
          <code>importance</code> and injected before the retrieved knowledge
          block.
        </p>

        <h2>Adding Memory</h2>
        <CodeBlock
          code={`await rag.memoryManager.addMemory("user_123", {
  content: "User works as a Software Engineer",
  importance: 0.9,  // 0.0 – 1.0, highest injected first
  metadata: { verified: true }
});`}
          language="typescript"
        />

        <h2>Automated Injection</h2>
        <p>
          Pass <code>userId</code> and <code>memory: true</code> to{" "}
          <code>buildContext()</code> and the engine automatically retrieves and
          injects the user's top memories.
        </p>
        <CodeBlock
          code={`const enriched = await rag.buildContext({
  messages,
  userId: "user_123",
  memory: true,
  topK: 5,
  systemPrompt: "You are a helpful assistant."
});`}
          language="typescript"
        />
      </>
    ),
  },

  "building-context": {
    title: "Building Context",
    content: (
      <>
        <p>
          <code>buildContext()</code> is the heart of RagNexus. It retrieves
          documents, loads memory, applies guardrails, assembles the system
          message, and returns a provider-ready messages array.
        </p>
        <CodeBlock
          code={`const enrichedMessages = await rag.buildContext({
  messages: [{ role: "user", content: "What is TypeScript?" }],
  userId: "user_123",   // optional
  memory: true,         // inject user memory
  topK: 5,              // max docs to retrieve (default: 5)
  systemPrompt: "You are a TypeScript expert.",
});

// enrichedMessages is ready to pass directly to any LLM provider`}
          language="typescript"
        />

        <h2>Observability</h2>
        <p>
          Use the <code>onRetrieve</code> config hook to inspect retrieved docs
          in real-time:
        </p>
        <CodeBlock
          code={`const rag = createRag({
  // ...
  onRetrieve: (docs) => {
    console.log(\`Retrieved \${docs.length} docs:\`);
    docs.forEach(d => console.log(\` - [\${(d.score * 100).toFixed(0)}%] \${d.source}\`));
  },
});`}
          language="typescript"
        />
      </>
    ),
  },

  "storage-providers": {
    title: "Storage Providers",
    content: (
      <>
        <h2>Vector Stores</h2>
        <ul>
          <li>
            <strong>InMemoryVectorStore</strong> — Non-persistent, O(1) id
            index, batch embeddings, upsert with content-hash change detection,
            BM25 hybrid search, TTL-aware.
          </li>
          <li>
            <strong>QdrantVectorStore</strong> — Production-grade. Native upsert
            with hash pre-check to avoid unnecessary re-embeddings. Pass your{" "}
            <code>QdrantClient</code> instance.
          </li>
        </ul>

        <h2>Memory Stores</h2>
        <ul>
          <li>
            <strong>InMemoryStore</strong> — RAM-based, lost on restart. Good
            for prototyping.
          </li>
          <li>
            <strong>RedisMemoryStore</strong> — Durable, sorted by importance
            score using Redis sorted sets. Pass your <code>ioredis</code>{" "}
            client.
          </li>
        </ul>

        <h2>VectorStore Interface</h2>
        <CodeBlock
          code={`interface VectorStore {
  add(docs: RAGDocument[]): Promise<void>;
  upsert(docs: RAGDocument[]): Promise<UpsertResult>; // change-detection
  delete(ids: string[]): Promise<void>;
  search(vector: number[], topK?: number): Promise<RAGDocument[]>;
}`}
          language="typescript"
        />
      </>
    ),
  },

  adapters: {
    title: "Provider Adapters",
    content: (
      <>
        <p>
          Adapters translate the enriched messages into the exact format each
          provider SDK expects. All adapters accept a <code>RAGEngine</code>{" "}
          instance.
        </p>

        <h2>OpenAI</h2>
        <CodeBlock
          code={`import { OpenAIAdapter } from "ragnexus";
import OpenAI from "openai";

const adapter = new OpenAIAdapter(rag);
const config = await adapter.getCompletionConfig({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "My question" }],
  stream: true,
}, { memory: false });

const stream = await openai.chat.completions.create(config);`}
          language="typescript"
        />

        <h2>Anthropic</h2>
        <CodeBlock
          code={`import { AnthropicAdapter } from "ragnexus";

const adapter = new AnthropicAdapter(rag);
const config = await adapter.getCompletionConfig(
  { messages },
  { memory: false }
);
// config.messages contains enriched context
// config system message is extracted automatically`}
          language="typescript"
        />

        <h2>Gemini (@google/genai)</h2>
        <CodeBlock
          code={`import { GeminiAdapter } from "ragnexus";

const adapter = new GeminiAdapter(rag);
const { contents, systemInstruction } = await adapter.getCompletionConfig(
  messages, { memory: false }
);

const stream = await geminiClient.models.generateContentStream({
  model: "gemini-2.0-flash",
  contents,
  config: { systemInstruction },
});`}
          language="typescript"
        />

        <h2>Google Genkit</h2>
        <CodeBlock
          code={`import { GenkitAdapter } from "ragnexus";
import { gemini } from "@genkit-ai/googleai";

const adapter = new GenkitAdapter(rag);
const genkitConfig = await adapter.getGenerateOptions(
  { model: gemini("gemini-2.0-flash"), messages },
  { memory: false }
);
const { stream } = await ai.generateStream(genkitConfig);`}
          language="typescript"
        />

        <h2>Vercel AI SDK</h2>
        <CodeBlock
          code={`import { VercelAIAdapter } from "ragnexus";
import { streamText } from "ai";

const adapter = new VercelAIAdapter(rag);
const result = await adapter.streamTextWithContext(
  streamText,
  { model: openaiProvider("gpt-4o-mini"), messages },
  { memory: false }
);`}
          language="typescript"
        />
      </>
    ),
  },

  embeddings: {
    title: "Embedders",
    content: (
      <>
        <p>
          All embedders implement the <code>Embedder</code> interface and
          support both single embed and batch embedding for efficient bulk
          ingestion.
        </p>
        <CodeBlock
          code={`interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}`}
          language="typescript"
        />

        <h2>Available Embedders</h2>
        <ul>
          <li>
            <code>OpenAIEmbedder</code> — <code>text-embedding-3-small</code> /{" "}
            <code>text-embedding-3-large</code>
          </li>
          <li>
            <code>GeminiEmbedder</code> — <code>text-embedding-004</code>
          </li>
          <li>
            <code>CohereEmbedder</code> — <code>embed-english-v3.0</code> /{" "}
            <code>embed-multilingual-v3.0</code>
          </li>
          <li>
            <code>OllamaEmbedder</code> — any locally running model (e.g.{" "}
            <code>nomic-embed-text</code>)
          </li>
        </ul>

        <CodeBlock
          code={`import { GeminiEmbedder } from "ragnexus";

const embedder = new GeminiEmbedder({
  model: "text-embedding-004",
  // apiKey: process.env.GEMINI_API_KEY
});`}
          language="typescript"
        />
      </>
    ),
  },
};

const NAV = [
  {
    group: "Introduction",
    items: [
      { id: "getting-started", label: "Getting Started" },
      { id: "installation", label: "Installation" },
      { id: "core-concepts", label: "Core Concepts" },
    ],
  },
  {
    group: "Setup",
    items: [
      { id: "setup-engine", label: "Engine Config" },
      { id: "storage-providers", label: "Storage Providers" },
      { id: "embeddings", label: "Embedders" },
    ],
  },
  {
    group: "Features",
    items: [
      { id: "text-splitting", label: "Text Splitting" },
      { id: "upsert-change-detection", label: "Upsert & Change Detection" },
      { id: "hybrid-search", label: "Hybrid Search" },
      { id: "reranker", label: "Reranking" },
      { id: "memory-usage", label: "Memory Management" },
      { id: "guardrails-deep-dive", label: "Guardrails Deep Dive" },
      { id: "building-context", label: "Building Context" },
    ],
  },
  {
    group: "Integrations",
    items: [{ id: "adapters", label: "Provider Adapters" }],
  },
];

function Docs() {
  const [activeTab, setActiveTab] = useState("getting-started");
  const currentDoc = DOCS_CONTENT[activeTab] || DOCS_CONTENT["getting-started"];

  const NavItem = ({ id, label }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        window.scrollTo(0, 0);
      }}
      className={`docs-nav-link ${activeTab === id ? "active" : ""}`}
    >
      {label}
    </button>
  );

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
          <nav>
            <Link to="/">Home</Link>
            <Link to="/docs" className="active">
              Docs
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

      <div className="docs-layout">
        <aside className="docs-sidebar">
          {NAV.map(({ group, items }) => (
            <div key={group} className="docs-nav-group">
              <h4 className="docs-nav-title">{group}</h4>
              {items.map(({ id, label }) => (
                <NavItem key={id} id={id} label={label} />
              ))}
            </div>
          ))}
        </aside>

        <main className="docs-content">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h1 style={{ margin: 0 }}>{currentDoc.title}</h1>
            <span className="version-badge">v1.1.0</span>
          </div>

          <div className="doc-section">{currentDoc.content}</div>

          <footer className="docs-footer" style={{ marginTop: "80px" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              © 2026 RagNexus Engine
            </span>
            <div style={{ display: "flex", gap: "1rem" }}>
              <a
                href="https://github.com/ScreenTechnicals/ragnexus/issues"
                style={{ color: "var(--primary)", textDecoration: "none" }}
              >
                Bug Report
              </a>
              <Link
                to="/"
                style={{
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                }}
              >
                Back to Home
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default Docs;
