import 'dotenv/config'; // Load env vars from .env file
import OpenAI from "openai";
import * as readline from "readline";
import {
    createRag,
    InMemoryStore,
    InMemoryVectorStore,
    OpenAIAdapter,
    OpenAIEmbedder,
    WebCrawler
} from "../src";

async function runRepoScrape() {
    console.log("Setting up RagNexus powered by OpenAI...");

    // 1. Ensure OpenAI API Key is present
    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ ERROR: Missing OPENAI_API_KEY in environment variables.");
        console.error("Please create a .env file and add: OPENAI_API_KEY=your_key_here");
        process.exit(1);
    }

    // 2. Setup the official OpenAI Client
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    // 3. Setup the Crawler
    const crawler = new WebCrawler({
        headless: true, // Run without opening a browser window
        maxRequestsPerCrawl: 5 // Scrape at most 5 URLs from the repo for speed
    });

    // 4. Setup proper Embedder & Storage
    // The OpenAIEmbedder will use the OPENAI_API_KEY automatically
    const realEmbedder = new OpenAIEmbedder({
        model: "text-embedding-3-small"
    });

    // We'll use InMemory DBs to make it easy to run without Docker setup for this example
    const vectorStore = new InMemoryVectorStore(realEmbedder);
    const memoryStore = new InMemoryStore();

    // 5. Initialize Rag Engine & OpenAI Adapter
    const rag = createRag({
        storage: {
            vector: vectorStore,
            memory: memoryStore,
        },
        embedder: realEmbedder,
        guardrails: {
            minRelevanceScore: 0.1, // Set lower for broad embeddings comparison
        },
    });

    const openaiAdapter = new OpenAIAdapter(rag);

    // 6. Enter the target repository
    const RAG_TARGET_URL = process.env.TARGET_URL || "https://github.com/microsoft/TypeScript";

    console.log(`\n🕷️ Crawling repository: ${RAG_TARGET_URL}`);
    console.log("This may take 10-15 seconds to fetch and render the page...");

    // We scrape the main repository URL. With Crawlee this returns the rendered text.
    const scrapedDocs = await crawler.scrapeBatch([RAG_TARGET_URL]);

    if (scrapedDocs.length === 0 || !scrapedDocs[0].text) {
        console.error("❌ Failed to extract any text from the repository.");
        process.exit(1);
    }

    console.log(`✅ Scraped successfully! Extracted ${scrapedDocs[0].text.length} characters.`);

    // 7. Embed & Index the Repo text into Vector DB
    console.log("\n🧠 Creating embeddings & indexing site into Vector Database...");
    await rag.addDocuments(scrapedDocs);

    // 8. Interactive Chat Loop
    const messages: any[] = [
        { role: "system", content: "You are a helpful programming assistant summarizing a GitHub repository." }
    ];

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n=============================");
    console.log("💬 Chat session started! Ask anything about the repository. Type 'exit' to quit.");
    console.log("=============================\n");

    const askQuestion = () => {
        rl.question("\x1b[36mYou: \x1b[0m", async (userInput) => {
            if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
                rl.close();
                console.log("Goodbye!");
                return;
            }

            // Temporarily build messages for this turn
            const turnMessages = [...messages, { role: "user", content: userInput }];

            try {
                // 9. Use RagNexus Adapter to inject Context safely into the OpenAI request payload
                const queryPayload = await openaiAdapter.getCompletionConfig({
                    model: "gpt-4o-mini",
                    messages: turnMessages,
                }, {
                    memory: false,
                });

                // 10. Execute the OpenAI API Chat Completions natively
                const response = await openai.chat.completions.create(queryPayload);
                const assistantMessage = response.choices[0].message?.content || "";

                console.log("\n\x1b[35m🤖 Assistant:\x1b[0m\n" + assistantMessage + "\n");

                // Add the user input and the assistant's reply to the message history
                messages.push({ role: "user", content: userInput });
                messages.push({ role: "assistant", content: assistantMessage });
            } catch (error) {
                console.error("Error generating response:", error);
            }

            askQuestion();
        });
    };

    askQuestion();
}

runRepoScrape().catch(console.error);
