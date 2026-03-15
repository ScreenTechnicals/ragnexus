import { PlaywrightCrawler } from "@crawlee/playwright";

async function main() {
    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 1,
        headless: true,
        requestHandler: async ({ page, request, response }) => {
            await page.waitForLoadState('networkidle');
            const title = await page.title();
            console.log(`Success! Title: ${title}`);
        },
        failedRequestHandler: ({ request, error }) => {
            console.error(`Crawler failed to load: ${request.url}`);
        }
    });
    await crawler.run(['https://medium.com/@katherine.a.cruz10/hello-world-4cdbdb4f7eaf']);
}

main().catch(console.error);
