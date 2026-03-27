/* ASX Collector - Popup Script */

const $ = (sel) => document.querySelector(sel);
let collectedItems = [];

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const config = await getConfig();
  if (config.serverUrl) $("#serverUrl").value = config.serverUrl;
  if (config.apiKey) $("#apiKey").value = config.apiKey;

  if (config.serverUrl && config.apiKey) {
    updateStatus("ok", "Configurado - pronto para coletar");
    $("#collectBtn").disabled = false;
  }

  // Load cached items
  const cached = await getCachedItems();
  if (cached.length > 0) {
    collectedItems = cached;
    $("#collected").textContent = cached.length;
    $("#sendBtn").disabled = false;
  }

  // Buttons
  $("#collectBtn").addEventListener("click", collectFromPage);
  $("#sendBtn").addEventListener("click", sendToServer);
  $("#saveConfig").addEventListener("click", saveConfig);
});

// ─── Config ──────────────────────────────────────────────────────────────────
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverUrl", "apiKey"], (data) => {
      resolve({ serverUrl: data.serverUrl || "", apiKey: data.apiKey || "" });
    });
  });
}

async function saveConfig() {
  const serverUrl = $("#serverUrl").value.trim().replace(/\/$/, "");
  const apiKey = $("#apiKey").value.trim();

  if (!serverUrl || !apiKey) {
    updateStatus("error", "Preencha URL e API Key");
    return;
  }

  chrome.storage.local.set({ serverUrl, apiKey }, () => {
    updateStatus("ok", "Configuracao salva!");
    $("#collectBtn").disabled = false;
    addLog("Configuracao salva: " + serverUrl, "success");
  });
}

// ─── Collect ─────────────────────────────────────────────────────────────────
async function collectFromPage() {
  $("#collectBtn").disabled = true;
  $("#collectBtn").textContent = "Coletando...";
  updateStatus("idle", "Coletando anuncios...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Nenhuma aba ativa");

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeCurrentPage,
    });

    const items = results?.[0]?.result || [];
    if (items.length === 0) {
      updateStatus("error", "Nenhum anuncio ASX encontrado nesta pagina");
      addLog("Nenhum anuncio encontrado", "error");
    } else {
      // Merge with existing, dedup by mlItemId
      const existing = new Set(collectedItems.map((i) => i.mlItemId));
      const newItems = items.filter((i) => !existing.has(i.mlItemId));
      collectedItems.push(...newItems);

      await chrome.storage.local.set({ cachedItems: collectedItems });
      $("#collected").textContent = collectedItems.length;
      $("#sendBtn").disabled = false;

      updateStatus("ok", `${newItems.length} novos anuncios coletados (${collectedItems.length} total)`);
      addLog(`Coletados ${newItems.length} anuncios de ${tab.url}`, "success");
    }
  } catch (err) {
    updateStatus("error", "Erro: " + err.message);
    addLog("Erro ao coletar: " + err.message, "error");
  } finally {
    $("#collectBtn").disabled = false;
    $("#collectBtn").textContent = "Coletar Anuncios desta Pagina";
  }
}

// ─── Scrape (runs in page context) ──────────────────────────────────────────
function scrapeCurrentPage() {
  const items = [];
  const cards = document.querySelectorAll(
    ".poly-card, .ui-search-result__wrapper, [data-testid='polycard'], .andes-card"
  );

  cards.forEach((card) => {
    const titleEl = card.querySelector(
      ".poly-component__title, .ui-search-item__title, h2, h3, [class*='title']"
    );
    const title = titleEl?.textContent?.trim() || "";
    if (!title || !title.toUpperCase().includes("ASX")) return;

    // Price: fraction + cents
    const fractionEl = card.querySelector(".andes-money-amount__fraction");
    const centsEl = card.querySelector(".andes-money-amount__cents");
    let price = 0;
    if (fractionEl?.textContent) {
      const intPart = parseFloat(fractionEl.textContent.replace(/\./g, "").replace(",", ".").trim());
      const centsPart = centsEl?.textContent?.trim() ? parseFloat(centsEl.textContent.trim()) / 100 : 0;
      price = intPart + centsPart;
    }
    if (!price || isNaN(price)) return;

    const linkEl = card.querySelector("a[href*='mercadolivre'], a[href*='mercadolibre']");
    const href = linkEl?.href || "";
    const itemIdMatch = href.match(/MLB\d{7,12}/);
    const mlItemId = itemIdMatch ? itemIdMatch[0] : "";
    if (!mlItemId) return;

    const imgEl = card.querySelector("img");
    const thumbnail = imgEl?.src || "";

    items.push({
      mlItemId,
      mlTitle: title,
      mlUrl: href.split("#")[0].split("?")[0],
      mlThumbnail: thumbnail,
      price,
      currency: "BRL",
    });
  });

  return items;
}

// ─── Send ────────────────────────────────────────────────────────────────────
async function sendToServer() {
  if (collectedItems.length === 0) {
    updateStatus("error", "Nenhum anuncio para enviar");
    return;
  }

  $("#sendBtn").disabled = true;
  $("#sendBtn").textContent = "Enviando...";
  updateStatus("idle", "Enviando " + collectedItems.length + " anuncios...");

  try {
    const config = await getConfig();
    if (!config.serverUrl || !config.apiKey) throw new Error("Configure URL e API Key primeiro");

    const payload = {
      source: "browser_extension",
      sourceVersion: "1.0.0",
      apiKey: config.apiKey,
      listings: collectedItems,
    };

    const res = await fetch(config.serverUrl + "/api/ingest/ml-listings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const result = await res.json();
    const msg = `Enviados! ${result.processed || 0} processados, ${result.violations || 0} violacoes`;
    updateStatus("ok", msg);
    addLog(msg, "success");

    $("#sent").textContent = parseInt($("#sent").textContent) + collectedItems.length;

    // Clear cache
    collectedItems = [];
    await chrome.storage.local.remove("cachedItems");
    $("#collected").textContent = "0";
  } catch (err) {
    updateStatus("error", "Erro ao enviar: " + err.message);
    addLog("Erro: " + err.message, "error");
  } finally {
    $("#sendBtn").disabled = collectedItems.length === 0;
    $("#sendBtn").textContent = "Enviar ao Servidor";
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────
async function getCachedItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["cachedItems"], (data) => {
      resolve(data.cachedItems || []);
    });
  });
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────
function updateStatus(type, text) {
  const el = $("#status");
  el.className = "status " + type;
  el.textContent = text;
}

function addLog(text, type = "") {
  const log = $("#log");
  const time = new Date().toLocaleTimeString("pt-BR");
  const entry = document.createElement("div");
  entry.className = "entry " + type;
  entry.textContent = `[${time}] ${text}`;
  log.prepend(entry);
  // Keep max 50 entries
  while (log.children.length > 50) log.removeChild(log.lastChild);
}
