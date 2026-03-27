import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--lang=pt-BR',
    '--accept-lang=pt-BR',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
});

async function scrapeMLPage(url) {
  const page = await browser.newPage();
  
  // Anti-detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
    window.chrome = { runtime: {} };
  });
  
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  });
  
  try {
    console.log('Navigating to:', url.substring(0, 80));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait a bit for JS to render
    await new Promise(r => setTimeout(r, 3000));
    
    const pageUrl = page.url();
    const title = await page.title();
    console.log('Final URL:', pageUrl.substring(0, 80));
    console.log('Page title:', title);
    
    const html = await page.content();
    console.log('HTML length:', html.length);
    
    // Extract using evaluate
    const result = await page.evaluate(() => {
      const items = [];
      
      // Try all possible card selectors
      const allCards = [
        ...document.querySelectorAll('.poly-card'),
        ...document.querySelectorAll('.ui-search-result__wrapper'),
        ...document.querySelectorAll('[data-testid="polycard"]'),
        ...document.querySelectorAll('.andes-card'),
      ];
      
      // Deduplicate
      const cards = [...new Set(allCards)];
      
      cards.forEach(card => {
        const titleEl = card.querySelector('.poly-component__title, .ui-search-item__title, h2, h3, [class*="title"]');
        const priceEl = card.querySelector('.andes-money-amount__fraction, [class*="price-fraction"], [class*="price__fraction"]');
        const linkEl = card.querySelector('a[href*="mercadolivre"]');
        
        if (titleEl && titleEl.textContent?.trim()) {
          items.push({
            title: titleEl.textContent.trim(),
            price: priceEl ? parseFloat(priceEl.textContent.replace(/\./g, '').replace(',', '.')) || 0 : 0,
            url: linkEl?.href || '',
          });
        }
      });
      
      return { items, cardCount: cards.length };
    });
    
    return { ...result, pageUrl, title };
  } finally {
    await page.close();
  }
}

try {
  // Test: LS Distribuidora store page (no search query - just get all items)
  const result = await scrapeMLPage('https://www.mercadolivre.com.br/loja/ls-distribuidora');
  console.log('\nCards:', result.cardCount, '| Items:', result.items.length);
  
  // Filter for ASX products
  const asxItems = result.items.filter(i => i.title.toUpperCase().includes('ASX'));
  console.log('ASX items:', asxItems.length);
  asxItems.slice(0, 10).forEach(p => console.log(' -', p.title?.substring(0, 70), '| R$', p.price));
  
  if (result.items.length === 0) {
    console.log('\nFirst 10 items (any):');
    result.items.slice(0, 10).forEach(p => console.log(' -', p.title?.substring(0, 70), '| R$', p.price));
  }
  
} finally {
  await browser.close();
}
