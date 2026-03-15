import { WebCrawler } from "./src/crawlers/crawlee";

async function main() {
    const crawler = new WebCrawler();
    const doc = await crawler.scrapeUrl('https://medium.com/@katherine.a.cruz10/hello-world-4cdbdb4f7eaf');
    console.log(`Successfully scraped! Title: ${doc.metadata?.title}`);
}

main().catch(console.error);
