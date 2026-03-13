import { createRag, InMemoryStore, QdrantVectorStore, WebCrawler } from "./src";

async function runPhase2() {
    console.log("Setting up ContextKit with Qdrant + Crawlee Playwright...");

    // 1. Setup Mock Embedder
    const mockEmbedder = {
        embed: async (text: string) => Array(1536).fill(Math.random()), // Dummy 1536d OpenAI vector
        embedBatch: async (texts: string[]) => texts.map((_) => Array(1536).fill(Math.random())),
    };

    // 2. Setup the internal Crawler
    const crawler = new WebCrawler({
        headless: true, // Run without opening a browser window
        maxRequestsPerCrawl: 2
    });

    // 3. Setup Qdrant
    // In production, instantiate `new QdrantClient({})` here
    const mockQdrantClient: any = {
        upsert: async (collection: string, payload: any) => {
            console.log(`[Qdrant] Upserted ${payload.points.length} points to ${collection}`);
            return true;
        },
        search: async (collection: string, payload: any) => {
            console.log(`[Qdrant] Searched ${collection} for vector size ${payload.vector.length}`);
            return [
                {
                    id: "crawlee-123",
                    score: 0.98,
                    payload: {
                        text: "ContextKit SDK connects Crawlee with Qdrant seamlessly.",
                        source: "https://example.com"
                    }
                }
            ];
        }
    };

    const vectorStore = new QdrantVectorStore(mockQdrantClient, mockEmbedder, "my_collection");
    const memoryStore = new InMemoryStore();

    // 4. Initialize Rag Engine
    const rag = createRag({
        storage: {
            vector: vectorStore,
            memory: memoryStore,
        },
        embedder: mockEmbedder,
        guardrails: {
            minRelevanceScore: 0.5,
        },
    });

    // 5. Simulate Crawling a Real Website
    console.log("\nCrawling target website...");

    // Actually executing Playwright crawler targeting a real, simple website
    // (example.com is standard for tests)
    const scrapedDocs = await crawler.scrapeBatch(["https://example.com"]);
    console.log(`Scraped ${scrapedDocs.length} document. First 50 chars: "${scrapedDocs[0]?.text.slice(0, 50)}..."`);

    // 6. Index site into Vector DB
    console.log("Indexing site into Qdrant...");
    await rag.addDocuments(scrapedDocs);

    // 7. Verify Retrieval Pipeline End-to-End
    const messages = [{ role: "user", content: "What is example.com?" }];

    console.log("\nGenerating safe context...");
    const enrichedContext = await rag.buildContext({
        messages,
        userId: "demo_user",
        memory: true, // Fetches from MemoryStore
    });

    console.log("\n--- Enriched Context Messages ---");
    console.log(JSON.stringify(enrichedContext, null, 2));
}

runPhase2().catch(console.error);
