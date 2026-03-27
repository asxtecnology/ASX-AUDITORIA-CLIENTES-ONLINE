/* ASX Collector - Content Script
   Runs automatically on Mercado Livre pages.
   Detects ASX products and notifies the popup. */

(function () {
  // Only run on listing/store pages
  const url = window.location.href;
  const isStorePage = url.includes("/loja/") || url.includes("_CustId_") || url.includes("seller_id");
  const isSearchPage = url.includes("lista.mercadolivre") || url.includes("/search");

  if (!isStorePage && !isSearchPage) return;

  // Wait for page to fully load
  setTimeout(() => {
    const cards = document.querySelectorAll(
      ".poly-card, .ui-search-result__wrapper, [data-testid='polycard'], .andes-card"
    );

    let asxCount = 0;
    cards.forEach((card) => {
      const title = card.querySelector(
        ".poly-component__title, .ui-search-item__title, h2, h3"
      )?.textContent?.trim() || "";
      if (title.toUpperCase().includes("ASX")) asxCount++;
    });

    if (asxCount > 0) {
      console.log(`[ASX Collector] Detectados ${asxCount} anuncios ASX nesta pagina.`);
      // Notify extension badge
      chrome.runtime.sendMessage({
        type: "ASX_DETECTED",
        count: asxCount,
        url: window.location.href,
      }).catch(() => {});
    }
  }, 3000);
})();
