import { PlaywrightCrawler } from "@crawlee/playwright";
import { RAGDocument } from "../types";

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
     */
    public async scrapeBatch(urls: string[]): Promise<RAGDocument[]> {
        const results: RAGDocument[] = [];

        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
            headless: this.options.headless,
            requestHandler: async ({ page, request }) => {
                // Wait for network to be idle to ensure dynamic content loads
                await page.waitForLoadState('networkidle');

                // Extract title and main text content using Playwright native methods
                const title = await page.title();

                // Simple extraction: stripping scripts and styles, getting text
                const textContent = await page.evaluate(() => {
                    const elementsToRemove = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
                    elementsToRemove.forEach(el => el.remove());
                    return document.body.innerText || "";
                });

                results.push({
                    id: `crawlee-${crypto.randomUUID()}`,
                    text: textContent.trim(),
                    source: request.url,
                    metadata: {
                        title,
                        crawledAt: new Date().toISOString()
                    }
                });
            },
            failedRequestHandler: ({ request }) => {
                console.error(`Crawler failed to load: ${request.url}`);
            }
        });

        // Add requests and run
        await crawler.addRequests(urls);
        await crawler.run();

        return results;
    }
}
