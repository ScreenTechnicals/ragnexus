import { Link } from "react-router-dom";
import CodeBlock from "./CodeBlock";

function Home() {
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
          <nav>
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
          <div className="hero-tag">Now in v1.0.0 — Pure TypeScript</div>
          <h1>
            <span className="gradient-text">Safe RAG + Memory</span>
            <br />
            Built to Run Anywhere.
          </h1>
          <p className="hero-sub">
            A deterministically safe middleware for modern AI apps. Neutralize
            prompt injections, manage contextual memory, and secure your LLM
            workflows.
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
          <h3>Built-in Guardrails</h3>
          <p>
            3-layer protection including instruction stripping and content
            sandboxing to stop context poisoning.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>Contextual Memory</h3>
          <p>
            Priority-queued memory injection that scales. Supports Redis and
            In-Memory storage natively.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔌</div>
          <h3>Pluggable SDK</h3>
          <p>
            Works natively with Vercel AI SDK, OpenAI, and Google Genkit. Swap
            endpoints and vector stores easily.
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
          code={`import { createRag, OpenAIAdapter } from "ragnexus";

// 1. Initialize with guardrails
const rag = createRag({
  storage: { vector: myStore, memory: myMemory },
  guardrails: { minRelevanceScore: 0.7 }
});

// 2. Wrap your LLM calls securely
const adapter = new OpenAIAdapter(rag);
const payload = await adapter.getCompletionConfig({
  messages: [{ role: "user", content: "What fixes RAG?" }]
});`}
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
