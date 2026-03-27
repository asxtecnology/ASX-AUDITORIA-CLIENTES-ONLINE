import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1280,800',
  ],
});

try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  console.log('Navigating to ML store...');
  await page.goto('https://www.mercadolivre.com.br/loja/ls-distribuidora/search?q=ultra+led+asx', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  
  console.log('Page loaded, extracting data...');
  
  // Extract product data from the page
  const products = await page.evaluate(() => {
    const items = [];
    
    // Try to find product cards
    const cards = document.querySelectorAll('[class*="poly-card"], [class*="ui-search-result"], .poly-component');
    console.log('Cards found:', cards.length);
    
    cards.forEach(card => {
      const titleEl = card.querySelector('[class*="poly-component__title"], [class*="ui-search-item__title"], h2, h3');
      const priceEl = card.querySelector('[class*="price__fraction"], [class*="poly-price"], [class*="ui-search-price__part"]');
      const linkEl = card.querySelector('a[href*="mercadolivre"]');
      
      if (titleEl && priceEl) {
        items.push({
          title: titleEl.textContent?.trim(),
          price: parseFloat(priceEl.textContent?.replace(/[^\d,]/g, '').replace(',', '.')) || 0,
          url: linkEl?.href || '',
        });
      }
    });
    
    return items;
  });
  
  console.log('Products found:', products.length);
  products.slice(0, 5).forEach(p => console.log(' -', p.title?.substring(0, 60), '| R$', p.price));
  
  // Also check page title and URL
  console.log('Page URL:', page.url());
  console.log('Page title:', await page.title());
  
} finally {
  await browser.close();
}
