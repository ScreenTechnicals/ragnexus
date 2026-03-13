# RagNexus

A lightweight, deterministic, and safe RAG (Retrieval-Augmented Generation) + Memory SDK for modern AI applications.

RagNexus serves as a powerful middleware layer between your LLM SDKs (like OpenAI or Vercel AI SDK) and your vector databases. It safely controls the prompt context window by managing contextual memory and neutralizing prompt injection attacks within ingested documents.

![npm](https://img.shields.io/npm/v/ragnexus)
![license](https://img.shields.io/npm/l/ragnexus)

## 🚀 Features

- 🛡️ **Built-in Guardrails**: 3-layer protection including instruction stripping, content sandboxing, and relevance threshold filtering.
- 🧠 **Memory Manager**: Built-in priority-queued memory injection (supports Redis and In-Memory stores).
- 🕸️ **Native Crawlers**: Built-in headless WebCrawler powered by Crawlee & Playwright to securely extract text from any public URL.
- 🔌 **Pluggable Architecture**: Works natively with Vercel AI SDK, OpenAI, and Google Genkit. Swap out embeddings and vector stores easily.
- ⚡ **Production Ready**: Optimized for React Server Components, Next.js, and streaming API routes.

## 📦 Installation

```bash
npm install ragnexus
```

## 🚥 Quick Start (In-Memory)

Perfect for prototyping or small-scale applications where persistence isn't required.

```typescript
import {
  createRag,
  InMemoryStore,
  InMemoryVectorStore,
  OpenAIEmbedder,
  OpenAIAdapter,
} from "ragnexus";
import OpenAI from "openai";

const embedder = new OpenAIEmbedder();
const rag = createRag({
  storage: {
    vector: new InMemoryVectorStore(embedder),
    memory: new InMemoryStore(),
  },
  embedder,
});

// Add knowledge
await rag.addDocuments([{ id: "1", text: "RagNexus makes RAG safe." }]);

// Securely inject context into OpenAI
const adapter = new OpenAIAdapter(rag);
const config = await adapter.getCompletionConfig({
  model: "gpt-4o",
  messages: [{ role: "user", content: "How does RagNexus help?" }],
});

const openai = new OpenAI();
const response = await openai.chat.completions.create(config);
```

## 💾 Infrastructure & Persistence

RagNexus is infrastructure-agnostic. You can use local Docker containers or connect to managed cloud services (Redis Cloud, Qdrant Cloud, Upstash, etc.) by passing your choice of client.

### 1. Redis (Persistent Memory)

Supports any Redis client (like `ioredis`) for storing user-specific context.

```typescript
import Redis from "ioredis";
import { RedisMemoryStore } from "ragnexus";

// Connect to Local Docker or Cloud (Upstash/Redis Cloud)
const redisClient = new Redis(process.env.REDIS_URL);
const memoryStore = new RedisMemoryStore(redisClient);
```

### 2. Qdrant (Persistent Knowledge)

Use the official Qdrant client to connect to your cluster.

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "ragnexus";

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});
const vectorStore = new QdrantVectorStore(qdrantClient, embedder);
```

### 3. Local Development with Docker

To make development easier, we provide a pre-configured Docker stack for Redis and Qdrant in the main repository.

```bash
# Start local infrastructure (from the root of the RagNexus repo)
./docker.sh
```

- **Redis**: `localhost:6379`
- **Qdrant**: `localhost:6333`

> [!NOTE]
> If you are installing via npm, you can find these configuration files in the [GitHub Repository](https://github.com/ScreenTechnicals/ragnexus/tree/main/docker).

---

## 🛠️ Contributing

RagNexus is designed to be extensible. If you want to build a new `VectorStore` adapter (e.g., Pinecone, Chroma) or an `Embedder` adapter, pull requests are welcome!

## 📄 License

MIT © RagNexus Team
