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
  if (envPath) {
    try { require("fs").accessSync(envPath); return envPath; } catch { /* continue */ }
  }

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

  // Linux/Nix — search common paths + Nix store
  const linuxPaths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];

  // Search Nix store for chromium binary
  try {
    const fs = require("fs");
    const nixProfileBin = "/nix/var/nix/profiles/default/bin";
    if (fs.existsSync(nixProfileBin)) {
      const entries = fs.readdirSync(nixProfileBin);
      const chromium = entries.find((e: string) => e.includes("chromium"));
      if (chromium) linuxPaths.unshift(`${nixProfileBin}/${chromium}`);
    }
    // Also check /root/.nix-profile/bin
    const homeNix = `${process.env.HOME || "/root"}/.nix-profile/bin`;
    if (fs.existsSync(homeNix)) {
      const entries = fs.readdirSync(homeNix);
      const chromium = entries.find((e: string) => e.includes("chromium"));
      if (chromium) linuxPaths.unshift(`${homeNix}/${chromium}`);
    }
  } catch { /* ignore nix search errors */ }

  for (const p of linuxPaths) {
    try { require("fs").accessSync(p); console.log(`[Puppeteer] Found browser at: ${p}`); return p; } catch { /* next */ }
  }

  // Last resort: try `which chromium` via child_process
  try {
    const { execSync } = require("child_process");
    const result = execSync("which chromium || which chromium-browser || which google-chrome 2>/dev/null", { encoding: "utf-8" }).trim();
    if (result) { console.log(`[Puppeteer] Found browser via which: ${result}`); return result; }
  } catch { /* ignore */ }

  console.warn("[Puppeteer] No browser found! Set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH");
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
  const seenIds = new Set<string>();

  function addItems(items: ScrapedItem[]) {
    for (const item of items) {
      if (!item.title.toUpperCase().includes("ASX")) continue;
      const key = item.itemId || item.url || item.title;
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      allItems.push({ ...item, sellerId, sellerName });
    }
  }

  // Strategy 1: CustId search (most reliable — works even when store URL changes)
  if (sellerId) {
    const queries = ["asx", "ultra led asx", "led asx", "lampada asx"];
    for (const q of queries) {
      try {
        const custUrl = `https://lista.mercadolivre.com.br/${q.replace(/ /g, "-")}_CustId_${sellerId}_NoIndex_True`;
        console.log(`[puppeteerScraper] Strategy CustId: ${custUrl}`);
        const items = await scrapePage(custUrl);
        addItems(items);
        if (items.length > 0) {
          console.log(`[puppeteerScraper] CustId "${q}": ${items.length} items for ${sellerName}`);
        }
      } catch (err: any) {
        console.error(`[puppeteerScraper] CustId "${q}" failed for ${sellerName}:`, err.message);
      }
    }
  }

  // Strategy 2: Store page search (if CustId found few results)
  if (allItems.length < 10 && sellerNickname) {
    try {
      const searchUrl = `https://www.mercadolivre.com.br/loja/${sellerNickname}/search?q=asx`;
      console.log(`[puppeteerScraper] Strategy Store Search: ${searchUrl}`);
      const items = await scrapePage(searchUrl);
      addItems(items);
      console.log(`[puppeteerScraper] Store search: ${items.length} items for ${sellerName}`);
    } catch (err: any) {
      console.error(`[puppeteerScraper] Store search failed for ${sellerName}:`, err.message);
    }
  }

  // Strategy 3: Pagina do vendedor (new ML URL format)
  if (allItems.length < 10 && sellerNickname) {
    try {
      const pageUrl = `https://www.mercadolivre.com.br/pagina/${sellerNickname}`;
      console.log(`[puppeteerScraper] Strategy Pagina: ${pageUrl}`);
      const items = await scrapePage(pageUrl);
      addItems(items);
    } catch (err: any) {
      console.error(`[puppeteerScraper] Pagina failed for ${sellerName}:`, err.message);
    }
  }

  // Strategy 4: Global search with seller filter (catches listings not in store page)
  if (allItems.length < 5 && sellerId) {
    try {
      const globalUrl = `https://lista.mercadolivre.com.br/asx-ultra-led_CustId_${sellerId}`;
      console.log(`[puppeteerScraper] Strategy Global: ${globalUrl}`);
      const items = await scrapePage(globalUrl);
      addItems(items);
    } catch (err: any) {
      console.error(`[puppeteerScraper] Global search failed for ${sellerName}:`, err.message);
    }
  }

  console.log(`[puppeteerScraper] Total for ${sellerName}: ${allItems.length} unique ASX items`);
  return allItems;
}
