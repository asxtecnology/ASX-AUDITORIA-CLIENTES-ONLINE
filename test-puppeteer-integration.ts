import { scrapeSellerStore, closeBrowser } from "./server/puppeteerScraper";

async function main() {
  console.log("Testing puppeteerScraper integration...");
  try {
    const items = await scrapeSellerStore("ls-distribuidora", "241146691", "LS Distribuidora");
    console.log("Items found:", items.length);
    items.slice(0, 5).forEach(i => console.log(" -", i.title?.substring(0, 60), "| R$", i.price));
    await closeBrowser();
    console.log("Test passed!");
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
