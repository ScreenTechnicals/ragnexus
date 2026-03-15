import { PlaywrightCrawler } from "@crawlee/playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { CrawlError } from "../errors";
import { RAGDocument } from "../types";
import { sha256 } from "../utils/hash";

chromium.use(stealth());

export interface CrawleeOptions {
    maxRequestsPerCrawl?: number;
    headless?: boolean;
    /**
     * When true, the crawler will discover and follow links on each page.
     * Combined with `urlFilter` to control which links are followed.
     * Default: false (only scrapes the URLs you explicitly provide).
     */
    followLinks?: boolean;
    /**
     * Filter function to decide which discovered links to follow.
     * Only called when `followLinks` is true.
     * Receives the absolute URL of each discovered link.
     * Default: same-origin filter (only follows links on the same hostname).
     */
    urlFilter?: (url: string) => boolean;
}

/** Result of scrapeWithLinks — includes both page content and discovered links. */
export interface CrawlWithLinksResult {
    docs: RAGDocument[];
    links: string[];
}

export class WebCrawler {
    private options: Required<Omit<CrawleeOptions, 'urlFilter'>> & Pick<CrawleeOptions, 'urlFilter'>;

    constructor(options: CrawleeOptions = {}) {
        this.options = {
            maxRequestsPerCrawl: options.maxRequestsPerCrawl || 10,
            headless: options.headless !== undefined ? options.headless : true,
            followLinks: options.followLinks ?? false,
            urlFilter: options.urlFilter,
        };
    }

    /**
     * Crawls a single URL and extracts the text content.
     */
    public async scrapeUrl(url: string): Promise<RAGDocument> {
        return (await this.scrapeBatch([url]))[0];
    }

    /**
     * Crawl URLs and return both page content AND all discovered links.
     * Useful for on-demand crawling: scrape the seed page first, then
     * let the LLM decide which links to crawl deeper into.
     */
    public async scrapeWithLinks(urls: string[]): Promise<CrawlWithLinksResult> {
        const results: RAGDocument[] = [];
        const discoveredLinks = new Set<string>();
        const seedOrigins = new Set(urls.map(u => {
            try { return new URL(u).origin; } catch { return ""; }
        }));

        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
            headless: this.options.headless,
            launchContext: {
                launcher: chromium,
            },
            requestHandler: async ({ page, request, response }) => {
                await page.waitForLoadState('networkidle');

                const title = await page.title();

                // Extract all links from the page
                const pageLinks = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('a[href]'))
                        .map(a => (a as HTMLAnchorElement).href)
                        .filter(href => href.startsWith('http'));
                });

                // Collect same-origin links
                for (const link of pageLinks) {
                    try {
                        if (seedOrigins.has(new URL(link).origin)) {
                            discoveredLinks.add(link);
                        }
                    } catch { /* skip invalid URLs */ }
                }

                const textContent = await page.evaluate(() => {
                    const elementsToRemove = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
                    elementsToRemove.forEach(el => el.remove());
                    return document.body.innerText || "";
                });

                if (textContent.trim().length > 0) {
                    const headers = response?.headers() ?? {};
                    const etag = headers['etag'];
                    const lastModified = headers['last-modified'];

                    results.push({
                        id: sha256(request.url),
                        text: textContent.trim(),
                        source: request.url,
                        metadata: {
                            title,
                            crawledAt: new Date().toISOString(),
                            ...(etag && { etag }),
                            ...(lastModified && { lastModified }),
                        }
                    });
                }
            },
            failedRequestHandler: ({ request }) => {
                console.error(`Crawler failed to load: ${request.url}`);
            }
        });

        await crawler.addRequests(urls);
        await crawler.run();

        // Remove seed URLs from discovered links
        for (const url of urls) discoveredLinks.delete(url);

        return {
            docs: results,
            links: Array.from(discoveredLinks),
        };
    }

    /**
     * Crawls a list of URLs and extracts text content.
     *
     * When `followLinks` is enabled, the crawler discovers links on each page
     * and enqueues them for crawling (up to `maxRequestsPerCrawl` total pages).
     * Use `urlFilter` to restrict which links are followed.
     *
     * Document IDs are deterministic — derived from SHA-256(url) — so re-crawling
     * the same URL always produces the same id. This enables upsert() to detect
     * whether the page content has actually changed since the last crawl.
     */
    public async scrapeBatch(urls: string[]): Promise<RAGDocument[]> {
        const results: RAGDocument[] = [];
        const seedOrigins = new Set(urls.map(u => {
            try { return new URL(u).origin; } catch { return ""; }
        }));

        const urlFilter = this.options.urlFilter ?? ((url: string) => {
            try { return seedOrigins.has(new URL(url).origin); } catch { return false; }
        });

        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
            headless: this.options.headless,
            launchContext: {
                launcher: chromium,
            },
            requestHandler: async ({ page, request, response, enqueueLinks }) => {
                await page.waitForLoadState('networkidle');

                const title = await page.title();

                const textContent = await page.evaluate(() => {
                    const elementsToRemove = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
                    elementsToRemove.forEach(el => el.remove());
                    return document.body.innerText || "";
                });

                if (textContent.trim().length > 0) {
                    const headers = response?.headers() ?? {};
                    const etag = headers['etag'];
                    const lastModified = headers['last-modified'];

                    results.push({
                        id: sha256(request.url),
                        text: textContent.trim(),
                        source: request.url,
                        metadata: {
                            title,
                            crawledAt: new Date().toISOString(),
                            ...(etag && { etag }),
                            ...(lastModified && { lastModified }),
                        }
                    });
                }

                if (this.options.followLinks) {
                    await enqueueLinks({
                        transformRequestFunction: (req) => {
                            if (urlFilter(req.url)) return req;
                            return false;
                        },
                    });
                }
            },
            failedRequestHandler: ({ request }) => {
                console.error(`Crawler failed to load: ${request.url}`);
            }
        });

        await crawler.addRequests(urls);
        await crawler.run();

        if (!results.length) {
            throw new CrawlError("No text extracted from the provided URL(s).", {
                url: urls.join(", "),
            });
        }

        return results;
    }
}
