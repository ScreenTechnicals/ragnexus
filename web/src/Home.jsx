import { useState } from "react";
import { Link } from "react-router-dom";
import CodeBlock from "./CodeBlock";

function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  return (
    <div className="Home">
      <div className="bg-blur"></div>

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
            <a href="#features">Features</a>
            <Link to="/docs">Docs</Link>
            <a
              href="https://github.com/ScreenTechnicals/ragnexus"
              className="github-btn"
            >
              <svg height="20" viewBox="0 0 16 16" width="20" fill="white">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <div className="hero-tag">Now in v1.1.0 — Pure TypeScript</div>
          <h1>
            <span className="gradient-text">Accurate RAG + Memory</span>
            <br />
            Built to Run Anywhere.
          </h1>
          <p className="hero-sub">
            Production-grade RAG middleware with text chunking, hybrid search,
            cross-encoder reranking, 4-layer guardrails, and adapters for every
            major LLM provider.
          </p>
          <div className="cta-group">
            <Link to="/docs" className="btn btn-primary">
              Get Started
            </Link>
            <a href="#features" className="btn btn-outline">
              Why RagNexus?
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="container features">
        <div className="feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>4-Layer Guardrails</h3>
          <p>
            Relevance filtering, density rejection, instruction stripping, and
            token budget enforcement — zero hallucination by design.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <h3>Hybrid Search + Reranking</h3>
          <p>
            BM25 keyword + cosine semantic blending, plus cross-encoder
            reranking (Cohere) for maximum retrieval precision.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Upsert & Change Detection</h3>
          <p>
            Content-hash deduplication — skip unchanged docs, re-embed only what
            changed, keep your vector store lean.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">✂️</div>
          <h3>Text Splitting</h3>
          <p>
            Recursive text splitter with configurable chunk size, overlap, and
            deterministic per-chunk IDs for precise embedding.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>Contextual Memory</h3>
          <p>
            Priority-queued per-user memory injected by importance score.
            Supports Redis and in-memory storage.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔌</div>
          <h3>5 Provider Adapters</h3>
          <p>
            OpenAI, Anthropic, Gemini, Genkit, and Vercel AI SDK — all with
            streaming and typed message formats.
          </p>
        </div>
      </section>

      <section className="container code-section">
        <CodeBlock
          language="typescript"
          header={
            <div className="code-header">
              <div className="dot red"></div>
              <div className="dot yellow"></div>
              <div className="dot green"></div>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#666",
                  marginLeft: "10px",
                }}
              >
                example.ts
              </span>
            </div>
          }
          code={`import { createRag, OpenAIEmbedder, InMemoryVectorStore, TextSplitter, CohereReranker } from "ragnexus";

// 1. Initialize with all the bells and whistles
const rag = createRag({
  storage: { vector: new InMemoryVectorStore(embedder), memory: myMemory },
  embedder: new OpenAIEmbedder({ model: "text-embedding-3-small" }),
  reranker: new CohereReranker({ topN: 3 }),
  guardrails: { minRelevanceScore: 0.5, maxTokens: 3000 },
  onRetrieve: (docs) => console.log("Retrieved:", docs.length),
});

// 2. Chunk + upsert with change detection
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const docs = await crawler.scrapeBatch(["https://example.com"]);
const result = await rag.upsertDocuments(splitter.splitDocuments(docs));
console.log(result); // { added: 12, updated: 2, skipped: 38 }`}
        />
      </section>

      <footer
        style={{
          padding: "40px 0",
          borderTop: "1px solid var(--glass-border)",
          marginTop: "60px",
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

export default Home;
