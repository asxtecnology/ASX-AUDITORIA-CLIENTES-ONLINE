import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function scrapeMLPage(url) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const result = await page.evaluate(() => {
      const items = [];
      // Try multiple selectors for product cards
      const selectors = [
        '.poly-card',
        '.ui-search-result',
        '[data-testid="polycard"]',
        '.andes-card',
      ];
      
      let cards = [];
      for (const sel of selectors) {
        cards = document.querySelectorAll(sel);
        if (cards.length > 0) break;
      }
      
      cards.forEach(card => {
        // Try multiple title selectors
        const titleEl = card.querySelector('.poly-component__title, .ui-search-item__title, [class*="title"]');
        // Try multiple price selectors
        const priceFraction = card.querySelector('.andes-money-amount__fraction, [class*="price__fraction"], [class*="price-fraction"]');
        const priceCents = card.querySelector('.andes-money-amount__cents, [class*="price__cents"]');
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');
        
        if (titleEl) {
          let price = 0;
          if (priceFraction) {
            const fraction = priceFraction.textContent?.replace(/\./g, '').replace(',', '.').trim() || '0';
            const cents = priceCents?.textContent?.trim() || '00';
            price = parseFloat(fraction + '.' + cents) || parseFloat(fraction) || 0;
          }
          
          items.push({
            title: titleEl.textContent?.trim() || '',
            price,
            url: linkEl?.href || '',
            thumbnail: imgEl?.src || '',
          });
        }
      });
      
      return { items, cardCount: cards.length, pageUrl: window.location.href };
    });
    
    return result;
  } finally {
    await page.close();
  }
}

try {
  // Test 1: Search for ASX products in LS Distribuidora store
  console.log('Test 1: LS Distribuidora - ASX search');
  const result1 = await scrapeMLPage('https://www.mercadolivre.com.br/loja/ls-distribuidora/search?q=asx+led');
  console.log('Cards found:', result1.cardCount, '| Items with title:', result1.items.length);
  console.log('Page URL:', result1.pageUrl);
  
  // Filter for ASX products
  const asxItems = result1.items.filter(i => i.title.toLowerCase().includes('asx'));
  console.log('ASX items:', asxItems.length);
  asxItems.slice(0, 5).forEach(p => console.log(' -', p.title?.substring(0, 70), '| R$', p.price));
  
  // Test 2: Use ML search with seller filter
  console.log('\nTest 2: ML search with seller filter');
  const result2 = await scrapeMLPage('https://www.mercadolivre.com.br/s#D=ultra+led+asx&seller_id=241146691');
  console.log('Cards found:', result2.cardCount, '| Items:', result2.items.length);
  result2.items.slice(0, 5).forEach(p => console.log(' -', p.title?.substring(0, 70), '| R$', p.price));
  
} finally {
  await browser.close();
}
