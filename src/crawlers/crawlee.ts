import { PlaywrightCrawler } from "@crawlee/playwright";
import { RAGDocument } from "../types";
import { sha256 } from "../utils/hash";

export interface CrawleeOptions {
    maxRequestsPerCrawl?: number;
    headless?: boolean;
}

export class WebCrawler {
    private options: CrawleeOptions;

    constructor(options: CrawleeOptions = {}) {
        this.options = {
            maxRequestsPerCrawl: options.maxRequestsPerCrawl || 10,
            headless: options.headless !== undefined ? options.headless : true,
        };
    }

    /**
     * Crawls a single URL and extracts the text content.
     */
    public async scrapeUrl(url: string): Promise<RAGDocument> {
        return (await this.scrapeBatch([url]))[0];
    }

    /**
     * Crawls a list of URLs concurrently and extracts text content.
     *
     * Document IDs are deterministic — derived from SHA-256(url) — so re-crawling
     * the same URL always produces the same id. This enables upsert() to detect
     * whether the page content has actually changed since the last crawl.
     *
     * HTTP cache headers (ETag, Last-Modified) are captured in metadata when
     * the server provides them, so callers can implement conditional fetching.
     */
    public async scrapeBatch(urls: string[]): Promise<RAGDocument[]> {
        const results: RAGDocument[] = [];

        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
            headless: this.options.headless,
            requestHandler: async ({ page, request, response }) => {
                // Wait for network to be idle to ensure dynamic content loads
                await page.waitForLoadState('networkidle');

                const title = await page.title();

                const textContent = await page.evaluate(() => {
                    const elementsToRemove = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
                    elementsToRemove.forEach(el => el.remove());
                    return document.body.innerText || "";
                });

                // Capture HTTP cache-validation headers when available
                const headers = response?.headers() ?? {};
                const etag = headers['etag'];
                const lastModified = headers['last-modified'];

                results.push({
                    // Deterministic ID: same URL always → same ID
                    id: sha256(request.url),
                    text: textContent.trim(),
                    source: request.url,
                    metadata: {
                        title,
                        crawledAt: new Date().toISOString(),
                        // Only include headers if the server sent them
                        ...(etag && { etag }),
                        ...(lastModified && { lastModified }),
                    }
                });
            },
            failedRequestHandler: ({ request }) => {
                console.error(`Crawler failed to load: ${request.url}`);
            }
        });

        await crawler.addRequests(urls);
        await crawler.run();

        return results;
    }
}
