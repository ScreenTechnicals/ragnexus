import { RAGDocument } from "../types";
import { sha256 } from "../utils/hash";

export interface FirecrawlOptions {
    apiKey?: string;
    apiUrl?: string; // Point to local docker if self-hosting
}

export class Firecrawler {
    private apiKey: string;
    private apiUrl: string;

    constructor(options: FirecrawlOptions = {}) {
        this.apiKey = options.apiKey || process.env.FIRECRAWL_API_KEY || "fc-local-dev";
        this.apiUrl = options.apiUrl || process.env.FIRECRAWL_API_URL || "http://localhost:3002"; // Default to docker if unprovided
    }

    /**
     * Crawls a single URL and extracts the markdown content.
     */
    public async scrapeUrl(url: string): Promise<RAGDocument> {
        const res = await fetch(`${this.apiUrl}/v1/scrape`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                url,
                formats: ["markdown"]
            })
        });

        if (!res.ok) {
            let errorText = await res.text().catch(() => "");
            throw new Error(`Firecrawl scrape failed: ${res.statusText} - ${errorText}`);
        }

        const data = await res.json();
        const markdown = data?.data?.markdown;
        const metadata = data?.data?.metadata;

        if (!markdown) {
            throw new Error("No markdown returned from Firecrawl");
        }

        return {
            id: sha256(url),
            text: markdown,
            source: url,
            metadata: metadata || {}
        };
    }

    /**
     * Crawls a list of URLs concurrently.
     */
    public async scrapeBatch(urls: string[]): Promise<RAGDocument[]> {
        // Firecrawl also supports batch endpoints, but for simplicity we rely on Promise.all
        // For production scale, you'd use their /v1/crawl endpoint and poll for the async job.
        return Promise.all(urls.map(url => this.scrapeUrl(url)));
    }
}
