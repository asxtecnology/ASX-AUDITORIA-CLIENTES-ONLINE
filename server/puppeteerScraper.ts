/**
 * puppeteerScraper.ts
 * Uses headless Chromium (puppeteer-core) to scrape Mercado Livre store pages.
 * This bypasses the ML API IP block that affects server-side API calls.
 */

import puppeteer, { Browser } from "puppeteer-core";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScrapedItem {
  title: string;
  price: number;
  url: string;
  thumbnail?: string;
  itemId?: string;
  sellerId?: string;
  sellerName?: string;
}

// ─── Browser singleton ────────────────────────────────────────────────────────
let _browser: Browser | null = null;
let _browserLaunchTime = 0;
const BROWSER_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function detectChromePath(): string {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) return envPath;

  if (process.platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    for (const p of paths) {
      try { require("fs").accessSync(p); return p; } catch { /* next */ }
    }
  } else if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  // Linux fallback — try multiple paths
  const linuxPaths = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  for (const p of linuxPaths) {
    try { require("fs").accessSync(p); return p; } catch { /* next */ }
  }
  return "/usr/bin/chromium";
}

async function getBrowser(): Promise<Browser> {
  const now = Date.now();
  if (_browser && now - _browserLaunchTime < BROWSER_MAX_AGE_MS) {
    try {
      await _browser.version();
      return _browser;
    } catch {
      _browser = null;
    }
  }

  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
  }

  _browser = await puppeteer.launch({
    executablePath: detectChromePath(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
      "--lang=pt-BR",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  _browserLaunchTime = now;
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
  }
}

// ─── Scrape a single store page ───────────────────────────────────────────────
async function scrapePage(url: string): Promise<ScrapedItem[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", {
        get: () => ["pt-BR", "pt", "en-US", "en"],
      });
      (window as any).chrome = { runtime: {} };
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000)); // Wait for JS to render

    const items = await page.evaluate(() => {
      const results: Array<{
        title: string;
        price: number;
        url: string;
        thumbnail: string;
        itemId: string;
      }> = [];

      // Try multiple card selectors
      const allCards = (
        Array.from(document.querySelectorAll(".poly-card"))
          .concat(Array.from(document.querySelectorAll(".ui-search-result__wrapper")))
          .concat(Array.from(document.querySelectorAll("[data-testid='polycard']")))
          .concat(Array.from(document.querySelectorAll(".andes-card")))
      );
      const seen = new Set<Element>();
      const cards = allCards.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });

      cards.forEach((card) => {
        const titleEl = card.querySelector(
          ".poly-component__title, .ui-search-item__title, h2, h3, [class*='title']"
        );
        const fractionEl = card.querySelector(
          ".andes-money-amount__fraction, [class*='price-fraction'], [class*='price__fraction']"
        );
        const centsEl = card.querySelector(
          ".andes-money-amount__cents, [class*='price-cents'], [class*='price__cents']"
        );
        const linkEl = card.querySelector("a[href*='mercadolivre']") as HTMLAnchorElement | null;
        const imgEl = card.querySelector("img") as HTMLImageElement | null;

        if (titleEl?.textContent?.trim()) {
          const href = linkEl?.href || "";
          const itemIdMatch = href.match(/MLB\d{7,12}/);

          let price = 0;
          if (fractionEl?.textContent) {
            const intPart = fractionEl.textContent.replace(/\./g, "").replace(",", ".").trim();
            const centsPart = centsEl?.textContent?.trim() || "0";
            price = parseFloat(intPart) + parseFloat(centsPart) / 100;
          }

          results.push({
            title: titleEl.textContent.trim(),
            price: isNaN(price) ? 0 : price,
            url: href,
            thumbnail: imgEl?.src || "",
            itemId: itemIdMatch ? itemIdMatch[0] : "",
          });
        }
      });

      return results;
    });

    return items;
  } finally {
    await page.close();
  }
}

// ─── Main export: scrape a seller's store for ASX products ───────────────────
export async function scrapeSellerStore(
  sellerNickname: string,
  sellerId: string,
  sellerName: string
): Promise<ScrapedItem[]> {
  const allItems: ScrapedItem[] = [];

  // Strategy 1: Scrape store page directly (no search query)
  try {
    const storeUrl = `https://www.mercadolivre.com.br/loja/${sellerNickname}`;
    const items = await scrapePage(storeUrl);
    const asxItems = items
      .filter((i) => i.title.toUpperCase().includes("ASX"))
      .map((i) => ({ ...i, sellerId, sellerName }));
    allItems.push(...asxItems);
  } catch (err) {
    console.error(`[puppeteerScraper] Strategy 1 failed for ${sellerName}:`, err);
  }

  // Strategy 2: Search for ASX products in the store
  if (allItems.length === 0) {
    try {
      const searchUrl = `https://www.mercadolivre.com.br/loja/${sellerNickname}/search?q=asx+led`;
      const items = await scrapePage(searchUrl);
      const asxItems = items
        .filter((i) => i.title.toUpperCase().includes("ASX"))
        .map((i) => ({ ...i, sellerId, sellerName }));
      allItems.push(...asxItems);
    } catch (err) {
      console.error(`[puppeteerScraper] Strategy 2 failed for ${sellerName}:`, err);
    }
  }

  // Strategy 3: Use CustId URL format
  if (allItems.length === 0 && sellerId) {
    try {
      const custUrl = `https://lista.mercadolivre.com.br/asx_CustId_${sellerId}`;
      const items = await scrapePage(custUrl);
      const asxItems = items
        .filter((i) => i.title.toUpperCase().includes("ASX"))
        .map((i) => ({ ...i, sellerId, sellerName }));
      allItems.push(...asxItems);
    } catch (err) {
      console.error(`[puppeteerScraper] Strategy 3 failed for ${sellerName}:`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allItems.filter((item) => {
    const key = item.url || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
