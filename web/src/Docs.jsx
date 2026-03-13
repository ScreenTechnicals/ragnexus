import { useState } from "react";
import { Link } from "react-router-dom";

import CodeBlock from "./CodeBlock";

const DOCS_CONTENT = {
  "getting-started": {
    title: "Getting Started",
    content: (
      <>
        <p>
          RagNexus is a deterministic middleware layer designed to sit between
          your application and your Large Language Model (LLM). It provides a
          set of tools to ensure that your RAG workflows are safe, efficient,
          and easy to manage.
        </p>

        <h2>Why RagNexus?</h2>
        <p>
          Standard RAG implementations often suffer from{" "}
          <strong>"Context Poisoning"</strong> where untrusted data from
          documents confuses the LLM. RagNexus solves this by adding a
          structured security layer, isolating the context context
          deterministically.
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
            We believe that RAG shouldn't be a black box. Our engine focuses on{" "}
            <strong>predictability</strong> and <strong>safety</strong>.
          </p>
        </div>

        <h3>Installation</h3>
        <p>To get started, install the library directly from npm:</p>
        <CodeBlock code={`npm install ragnexus`} language="bash" />
      </>
    ),
  },
  installation: {
    title: "Detailed Installation",
    content: (
      <>
        <p>
          RagNexus requires Node.js 18+ and handles both CommonJS and ESM
          environments. It is completely edge-compatible and optimized for
          Vercel AI SDK.
        </p>

        <h2>Development Setup</h2>
        <p>
          If you're developing locally and want persistent storage out of the
          box, we recommend cloning our{" "}
          <a
            href="https://github.com/ScreenTechnicals/ragnexus/tree/main/docker"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--primary)", textDecoration: "none" }}
          >
            GitHub repository
          </a>{" "}
          and using the provided Docker stack:
        </p>
        <CodeBlock
          code={`git clone https://github.com/ScreenTechnicals/ragnexus.git\ncd ragnexus\n./docker.sh`}
          language="bash"
        />

        <p>This will start:</p>
        <ul>
          <li>
            <strong>Redis</strong> at <code>localhost:6379</code> (Persistent
            User Memory)
          </li>
          <li>
            <strong>Qdrant</strong> at <code>localhost:6333</code> (Vector
            Knowledge Base)
          </li>
        </ul>
      </>
    ),
  },
  "core-concepts": {
    title: "Core Concepts",
    content: (
      <>
        <p>
          RagNexus architecture is split into four primary domains working
          together to form the core pipeline:
        </p>
        <div
          className="feature-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "1.5rem",
            marginTop: "2rem",
          }}
        >
          <div className="feature-card" style={{ padding: "1.5rem" }}>
            <h4>Retriever</h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              Finds relevant documents from vector stores such as Qdrant or
              Pinecone.
            </p>
          </div>
          <div className="feature-card" style={{ padding: "1.5rem" }}>
            <h4>Memory</h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              Tracks user preferences and session history dynamically using
              Redis.
            </p>
          </div>
          <div className="feature-card" style={{ padding: "1.5rem" }}>
            <h4>Guardrails</h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              Sanitizes and sandboxes untrusted data, preventing injection
              attacks.
            </p>
          </div>
          <div className="feature-card" style={{ padding: "1.5rem" }}>
            <h4>Adapters</h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              Translates context into specific formats for OpenAI, Vercel, or
              Genkit.
            </p>
          </div>
        </div>
      </>
    ),
  },
  "setup-engine": {
    title: "Setting up the Engine",
    content: (
      <>
        <p>
          The <code>createRag</code> factory is the entry point for configuring
          your infrastructure. This is where you connect your databases and set
          the global parameters.
        </p>
        <CodeBlock
          code={`import { createRag, OpenAIEmbedder, InMemoryStore, InMemoryVectorStore } from "ragnexus";

const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });

const rag = createRag({
  storage: {
    vector: new InMemoryVectorStore(embedder), // Persists files/docs
    memory: new InMemoryStore(), // Persists user facts
  },
  embedder: embedder,
  guardrails: {
    minRelevanceScore: 0.75, // Filter noisy matches
    blockedPatterns: ["ignore prev"] // Anti-prompt injection
  }
});`}
          language="typescript"
        />
      </>
    ),
  },
  "memory-usage": {
    title: "Memory Management",
    content: (
      <>
        <p>
          Memory in RagNexus is distinct from Vector Retrieval. Memory stores{" "}
          <strong>Facts</strong> about a particular user (like their name or
          preferences), not documents.
        </p>

        <h2>Adding Memory</h2>
        <p>
          You can dynamically inject memories about the user during the
          application's lifecycle.
        </p>
        <CodeBlock
          code={`// userId: "user_123"
await rag.memoryManager.addMemory("user_123", {
  content: "User works as a Software Engineer",
  importance: 0.9, // Float 0.0 - 1.0 (Impacts context priority)
  metadata: { verified: true }
});`}
          language="typescript"
        />

        <h2>Automated Context Injection</h2>
        <p>
          When you call <code>buildContext</code>, RagNexus automatically finds
          the most "Important" memories based on the <code>importance</code>{" "}
          score and injects them into the LLM context header.
        </p>
      </>
    ),
  },
  "guardrails-deep-dive": {
    title: "Guardrails Deep Dive",
    content: (
      <>
        <p>
          RagNexus uses a structured "Sandbox" to prevent LLMs from executing
          instructions found within your data.
        </p>

        <h2>Pipeline Steps</h2>
        <ol>
          <li>
            <strong>Instruction Stripping</strong>: Redacts common prompt
            injection phrases from the content payload.
          </li>
          <li>
            <strong>Relevance Filtering</strong>: Discards documents with low
            similarity scores dynamically.
          </li>
          <li>
            <strong>Untrusted Tagging</strong>: Wraps data in secure markdown
            delimiters to isolate context.
          </li>
        </ol>

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
            Security Note
          </div>
          <p>
            We recommend combining our guardrails with standard
            application-level role validations for full security.
          </p>
        </div>
      </>
    ),
  },
  "building-context": {
    title: "Building Context",
    content: (
      <>
        <p>
          The <code>buildContext</code> method is the heart of the package. It
          combines your user's history, the latest question, and relevant
          documents into one secure payload.
        </p>
        <CodeBlock
          code={`const messages = [
  { role: "user", content: "What do I do for a living?" }
];

// Returns an enriched messages array ready for LLM consumption
const enrichedMessages = await rag.buildContext({
  messages,
  userId: "user_123",
  systemPrompt: "You are a helpful assistant."
});`}
          language="typescript"
        />
      </>
    ),
  },
  "openai-adapter": {
    title: "OpenAI Adapter",
    content: (
      <>
        <p>
          The <code>OpenAIAdapter</code> makes integration with the official
          OpenAI SDK completely seamless.
        </p>
        <CodeBlock
          code={`import { OpenAIAdapter } from "ragnexus";
import OpenAI from "openai";

const adapter = new OpenAIAdapter(rag);
const openai = new OpenAI();

const config = await adapter.getCompletionConfig({
  messages: [{ role: "user", content: "My question" }],
  model: "gpt-4o"
});

const res = await openai.chat.completions.create(config);`}
          language="typescript"
        />
      </>
    ),
  },
  "storage-providers": {
    title: "Storage Providers",
    content: (
      <>
        <p>
          RagNexus comes with several built-in providers. You can construct the
          engine exactly for your infrastructure.
        </p>

        <h2>Vector Stores</h2>
        <ul>
          <li>
            <strong>InMemoryVectorStore</strong>: Non-persistent, perfect for
            prototyping and CI pipelines.
          </li>
          <li>
            <strong>QdrantVectorStore</strong>: Production-grade vector DB
            integration. Works with Qdrant Cloud.
          </li>
        </ul>

        <h2>Memory Stores</h2>
        <ul>
          <li>
            <strong>InMemoryStore</strong>: Simple RAM-based user storage. Lost
            on restart.
          </li>
          <li>
            <strong>RedisMemoryStore</strong>: Durable, distributed user memory
            backed by Redis.
          </li>
        </ul>
      </>
    ),
  },
};

function Docs() {
  const [activeTab, setActiveTab] = useState("getting-started");

  const currentDoc = DOCS_CONTENT[activeTab] || DOCS_CONTENT["getting-started"];

  const NavItem = ({ id, label }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        window.scrollTo(0, 0);
      }}
      className={`docs-nav-link \${activeTab === id ? 'active' : ''}`}
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
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <div className="docs-nav-group">
            <h4 className="docs-nav-title">Introduction</h4>
            <NavItem id="getting-started" label="Getting Started" />
            <NavItem id="installation" label="Installation" />
            <NavItem id="core-concepts" label="Core Concepts" />
          </div>
          <div className="docs-nav-group">
            <h4 className="docs-nav-title">Setup Guide</h4>
            <NavItem id="setup-engine" label="Engine Config" />
            <NavItem id="storage-providers" label="Storage Providers" />
          </div>
          <div className="docs-nav-group">
            <h4 className="docs-nav-title">Features</h4>
            <NavItem id="memory-usage" label="Memory Management" />
            <NavItem id="guardrails-deep-dive" label="Guardrails Deep Dive" />
            <NavItem id="building-context" label="Building Context" />
          </div>
          <div className="docs-nav-group">
            <h4 className="docs-nav-title">Integrations</h4>
            <NavItem id="openai-adapter" label="OpenAI Adapter" />
          </div>
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
            <span className="version-badge">v1.0.0</span>
          </div>

          <div className="doc-section">{currentDoc.content}</div>

          <footer className="docs-footer" style={{ marginTop: "80px" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              © 2024 RagNexus Engine
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
