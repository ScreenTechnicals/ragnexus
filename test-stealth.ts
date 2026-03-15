import { PlaywrightCrawler } from "@crawlee/playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

async function main() {
    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 1,
        headless: true,
        launchContext: {
            launcher: chromium,
        },
        requestHandler: async ({ page, request, response }) => {
            await page.waitForLoadState('networkidle');
            const title = await page.title();
            console.log(`Success with stealth! Title: ${title}`);
        },
        failedRequestHandler: ({ request, error }) => {
            console.error(`Crawler failed to load: ${request.url}`);
            console.error(error);
        }
    });

    await crawler.run(['https://medium.com/@katherine.a.cruz10/hello-world-4cdbdb4f7eaf']);
}

main().catch(console.error);
