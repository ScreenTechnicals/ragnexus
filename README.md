# RagNexus

A lightweight, deterministic, and safe RAG (Retrieval-Augmented Generation) + Memory SDK for modern AI applications.

RagNexus serves as a powerful middleware layer between your LLM SDKs (like the Vercel AI SDK, OpenAI, or Genkit) and your vector databases. It safely controls the prompt context window by managing contextual memory and neutralizing prompt injection attacks within ingested documents.

![npm](https://img.shields.io/npm/v/ragnexus)
![license](https://img.shields.io/npm/l/ragnexus)

## Features

- 🛡️ **Built-in Guardrails**: 3-layer protection including instruction stripping, content sandboxing, and relevance threshold filtering to stop context poisoning.
- 🧠 **Memory Manager**: Built-in priority-queued memory injection (supports Redis and In-Memory stores).
- 🕸️ **Native Crawlers**: Built-in headless WebCrawler powered by Crawlee & Playwright to securely extract text from any public URL.
- 🔌 **Pluggable Architecture**: Works natively with Vercel AI SDK, OpenAI, and Google Genkit. Easily swap out embeddings (`OpenAIEmbedder`, etc.) and vector stores (`QdrantVectorStore`, `InMemoryVectorStore`).
- ⚡ **Streaming Ready**: Fully synchronous and optimized to work within React Server Components, Next.js, and streamable API routes.

## Installation

```bash
npm install ragnexus
```

## Quick Start (OpenAI)

```typescript
import {
  createRag,
  InMemoryStore,
  InMemoryVectorStore,
  OpenAIEmbedder,
  OpenAIAdapter,
} from "ragnexus";
import OpenAI from "openai";

// 1. Initialize Pluggable Stores & Embeddings
const embedder = new OpenAIEmbedder({ model: "text-embedding-3-small" });
const vectorStore = new InMemoryVectorStore(embedder);
const memoryStore = new InMemoryStore();

// 2. Initialize the Engine
const rag = createRag({
  storage: { vector: vectorStore, memory: memoryStore },
  embedder,
  guardrails: { minRelevanceScore: 0.1 },
});

// 3. Add Documents (Or use the built in Crawlers!)
await rag.addDocuments([{ id: "doc1", text: "RagNexus fixes RAG." }]);

// 4. Wrap with an Adapter
const openai = new OpenAI();
const adapter = new OpenAIAdapter(rag);

// 5. Intercept queries and securely inject context
const payload = await adapter.getCompletionConfig({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What fixes RAG?" }],
});

const response = await openai.chat.completions.create(payload);
console.log(response.choices[0].message.content);
```

## Contributing

RagNexus is designed to be extensible. If you want to build a new `VectorStore` adapter (e.g., Pinecone, Chroma) or an `Embedder` adapter, pull requests are heavily welcome!
