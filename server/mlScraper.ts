/**
 * ASX Price Monitor — ML Scraper v4 (PostgreSQL)
 *
 * Correções vs v3:
 * - runId: usa .returning({ id }) em vez de .insertId (MySQL-only)
 * - update monitoringRuns: usa colunas corretas (totalFound, totalViolations)
 * - vendedores: INSERT ... ON CONFLICT DO UPDATE (PostgreSQL)
 * - historico_precos: ON CONFLICT DO UPDATE (PostgreSQL)
 * - matchProduct: melhorado para detectar por potência + lumens
 * - scraperInProgress: lock para evitar execuções concorrentes
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { getDb, getSetting, getMlCredentials, updateMlTokens } from "./db";
import { scrapeSellerStore } from "./puppeteerScraper";
import {
  products,
  monitoringRuns,
  priceSnapshots,
  violations,
  clientes,
  historicoPrecosTable,
  vendedores,
} from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

const REQUEST_DELAY_MS = 2000;
const MAX_RETRIES = 3;

// Lock global — evita execuções sobrepostas
let scraperInProgress = false;

// ─── API Oficial ML ───────────────────────────────────────────────────────────
let _mlTokenCache: { accessToken: string; expiresAt: Date } | null = null;

async function getMlAccessToken(): Promise<string | null> {
  if (_mlTokenCache && _mlTokenCache.expiresAt > new Date(Date.now() + 60_000)) {
    return _mlTokenCache.accessToken;
  }
  const cred = await getMlCredentials();
  if (!cred || cred.status !== "authorized" || !cred.accessToken) return null;
  if (cred.expiresAt && cred.expiresAt < new Date(Date.now() + 60_000)) {
    if (!cred.refreshToken) return null;
    try {
      const res = await axios.post(
        "https://api.mercadolibre.com/oauth/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: cred.appId,
          client_secret: cred.clientSecret,
          refresh_token: cred.refreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
      await updateMlTokens({ accessToken: res.data.access_token, refreshToken: res.data.refresh_token, expiresAt, status: "authorized", lastError: null });
      _mlTokenCache = { accessToken: res.data.access_token, expiresAt };
      return res.data.access_token;
    } catch (e: unknown) {
      await updateMlTokens({ status: "expired", lastError: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }
  _mlTokenCache = { accessToken: cred.accessToken, expiresAt: cred.expiresAt ?? new Date(Date.now() + 3600_000) };
  return cred.accessToken;
}

// ─── API Pública ML (sem autenticação) ──────────────────────────────────────
async function fetchSellerItemsPublicApi(sellerId: string, siteId = "MLB"): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];
  let offset = 0;
  const limit = 50;
  try {
    while (true) {
      const res = await axios.get(`https://api.mercadolibre.com/sites/${siteId}/search`, {
        params: { seller_id: sellerId, limit, offset },
        timeout: 15_000,
      });
      const items: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller: { nickname: string } }> = res.data.results ?? [];
      for (const item of items) {
        results.push({ mlbId: item.id, title: item.title, price: item.price, url: item.permalink, thumbnail: item.thumbnail, sellerNickname: item.seller?.nickname ?? sellerId });
      }
      if (items.length < limit) break;
      offset += limit;
      if (offset >= 1000) break;
      await sleep(300);
    }
    console.log(`[ML Public API] Seller ${sellerId}: ${results.length} anúncios.`);
    return results;
  } catch (e: unknown) {
    console.warn(`[ML Public API] Erro seller ${sellerId}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function searchItemsPublicApi(query: string, sellerId: string | null, siteId = "MLB", limit = 50): Promise<ScrapedProduct[]> {
  try {
    const params: Record<string, string | number> = { q: query, limit };
    if (sellerId) params.seller_id = sellerId;
    const res = await axios.get(`https://api.mercadolibre.com/sites/${siteId}/search`, {
      params,
      timeout: 15_000,
    });
    const items: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller: { nickname: string } }> = res.data.results ?? [];
    console.log(`[ML Public API] Query "${query}" seller=${sellerId ?? 'todos'}: ${items.length} resultados.`);
    return items.map(item => ({ mlbId: item.id, title: item.title, price: item.price, url: item.permalink, thumbnail: item.thumbnail, sellerNickname: item.seller?.nickname ?? "desconhecido" }));
  } catch (e: unknown) {
    console.warn(`[ML Public API] Erro query "${query}": ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function fetchSellerItemsViaApi(sellerId: string, siteId = "MLB"): Promise<ScrapedProduct[] | null> {
  const token = await getMlAccessToken();
  if (!token) return null;
  const results: ScrapedProduct[] = [];
  let offset = 0;
  const limit = 50;
  try {
    while (true) {
      const res = await axios.get(`https://api.mercadolibre.com/sites/${siteId}/search`, {
        params: { seller_id: sellerId, limit, offset },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
      });
      const items: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller: { nickname: string } }> = res.data.results ?? [];
      for (const item of items) {
        results.push({ mlbId: item.id, title: item.title, price: item.price, url: item.permalink, thumbnail: item.thumbnail, sellerNickname: item.seller?.nickname ?? sellerId });
      }
      if (items.length < limit) break;
      offset += limit;
      if (offset >= 1000) break;
      await sleep(500);
    }
    console.log(`[ML API] Seller ${sellerId}: ${results.length} anúncios via API oficial.`);
    return results;
  } catch (e: unknown) {
    console.warn(`[ML API] Fallback scraping para seller ${sellerId}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function searchItemsViaApi(query: string, siteId = "MLB", limit = 50): Promise<ScrapedProduct[] | null> {
  const token = await getMlAccessToken();
  if (!token) return null;
  try {
    const res = await axios.get(`https://api.mercadolibre.com/sites/${siteId}/search`, {
      params: { q: query, limit },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    const items: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller: { nickname: string } }> = res.data.results ?? [];
    return items.map(item => ({ mlbId: item.id, title: item.title, price: item.price, url: item.permalink, thumbnail: item.thumbnail, sellerNickname: item.seller?.nickname ?? "desconhecido" }));
  } catch (e: unknown) {
    console.warn(`[ML API] Fallback scraping para query "${query}": ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const SCRAPER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ScrapedProduct {
  mlbId: string;
  title: string;
  price: number;
  url: string;
  thumbnail: string;
  sellerNickname: string;
}

interface MatchResult {
  productId: number;
  codigo: string;
  descricao: string;
  precoMinimo: number;
  confianca: number;
  metodoMatch: string;
}

export interface ScrapeOptions {
  clienteId?: number;
  triggeredBy?: "scheduled" | "manual";
  slotHour?: number; // 10 = manhã, 16 = tarde, undefined = manual
}

type CatalogItem = {
  id: number;
  codigo: string;
  descricao: string;
  ean: string | null;
  precoMinimo: string;
};

// ─── Utilitários ──────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string, retries = 0): Promise<string | null> {
  try {
    await sleep(REQUEST_DELAY_MS);
    const res = await axios.get<string>(url, {
      headers: SCRAPER_HEADERS,
      timeout: 20000,
      responseType: "text",
    });
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429 && retries < MAX_RETRIES) {
      const backoff = [5000, 10000, 20000][retries] ?? 20000;
      console.warn(`[ML] Rate limit (429). Aguardando ${backoff / 1000}s...`);
      await sleep(backoff);
      return fetchHtml(url, retries + 1);
    }
    if (status === 503 && retries < MAX_RETRIES) {
      await sleep(5000);
      return fetchHtml(url, retries + 1);
    }
    console.error(`[ML] Erro ao buscar ${url}: ${status ?? err.message}`);
    return null;
  }
}

// ─── Categorização ────────────────────────────────────────────────────────────
export function categorizarProduto(
  descricao: string,
  precoCusto: number
): { categoria: string; linha: "PREMIUM" | "PLUS" | "ECO" } {
  const upper = descricao.toUpperCase();
  let categoria = "OUTROS";
  if (upper.includes("ULTRA LED")) categoria = "ULTRA LED";
  else if (upper.includes("SUPER LED")) categoria = "SUPER LED";
  else if (upper.includes("WORKLIGHT") || upper.includes("WORK LIGHT")) categoria = "WORKLIGHT";
  else if (upper.includes("CHICOTE")) categoria = "CHICOTE";
  else if (upper.includes("XENON")) categoria = "XENON";
  else if (upper.includes("LAMPADA") || upper.includes("LÂMPADA")) categoria = "LAMPADA";
  else if (upper.includes("LED")) categoria = "LED";
  const custo = Number(precoCusto);
  const linha: "PREMIUM" | "PLUS" | "ECO" =
    custo >= 100 ? "PREMIUM" : custo >= 40 ? "PLUS" : "ECO";
  return { categoria, linha };
}

// ─── Sistema de Match ─────────────────────────────────────────────────────────
// Ordenado do mais específico ao menos para evitar match prematuro (H1 antes de H11)
const CONNECTOR_PATTERNS = [
  "HIR2", "HB3", "HB4",
  "H27", "H16", "H15", "H13", "H11", "H9", "H8", "H7", "H4", "H3", "H1",
  "D1S", "D2S", "D3S", "D4S",
  "T15", "T10", "T5",
  "P21W", "W16W",
  "9012", "9006", "9005",
];

const PRODUCT_LINES = [
  "ULTRA LED CSP",
  "ULTRA LED PLUS",
  "ULTRA LED",
  "SUPER LED",
  "WORKLIGHT",
  "XENON",
  "ECO PLUGIN",
];

// Extrai potência: "70W", "70 W" → "70"
function extractWattage(title: string): string | null {
  const m = title.toUpperCase().match(/\b(\d{2,3})\s*W\b/);
  return m ? m[1] : null;
}

// Extrai lúmens: "10000 lúmens", "10.000 lumens" → "10000"
function extractLumens(title: string): string | null {
  const clean = title.toUpperCase().replace(/\./g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = clean.match(/\b(\d{4,6})\s*LUMENS?\b/i);
  return m ? m[1] : null;
}

export function matchProduct(
  mlTitle: string,
  catalog: CatalogItem[]
): MatchResult | null {
  // Normaliza: remove acentos, uppercase
  const titleUpper = mlTitle.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ── 1. Código ASX exato no título (ex: "ASX1007") → confiança 100 ──
  for (const prod of catalog) {
    if (titleUpper.includes(prod.codigo.toUpperCase())) {
      return {
        productId: prod.id,
        codigo: prod.codigo,
        descricao: prod.descricao,
        precoMinimo: Number(prod.precoMinimo),
        confianca: 100,
        metodoMatch: "codigo",
      };
    }
  }

  // Anúncios sem "ASX" não são da marca
  if (!titleUpper.includes("ASX")) return null;

  const foundLine      = PRODUCT_LINES.find((l) => titleUpper.includes(l));
  const foundConnector = CONNECTOR_PATTERNS.find((c) =>
    new RegExp(`\\b${c}\\b`).test(titleUpper)
  );
  const foundWattage   = extractWattage(titleUpper);
  const foundLumens    = extractLumens(titleUpper);

  function wattageMatches(descricao: string): boolean {
    if (!foundWattage) return true;
    return new RegExp(`\\b${foundWattage}\\s*W\\b`).test(descricao.toUpperCase());
  }

  // ── 2. Linha + Conector + Potência → confiança 95 ──
  if (foundLine && foundConnector) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d) && wattageMatches(d);
    });
    if (match) return { productId: match.id, codigo: match.codigo, descricao: match.descricao, precoMinimo: Number(match.precoMinimo), confianca: 95, metodoMatch: "linha_bulbo_watts" };

    // Sem potência
    const matchNoW = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d);
    });
    if (matchNoW) return { productId: matchNoW.id, codigo: matchNoW.codigo, descricao: matchNoW.descricao, precoMinimo: Number(matchNoW.precoMinimo), confianca: 85, metodoMatch: "linha_bulbo" };
  }

  // ── 3. Conector + Potência → confiança 80 ──
  if (foundConnector && foundWattage) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return new RegExp(`\\b${foundConnector}\\b`).test(d) && wattageMatches(d);
    });
    if (match) return { productId: match.id, codigo: match.codigo, descricao: match.descricao, precoMinimo: Number(match.precoMinimo), confianca: 80, metodoMatch: "bulbo_watts" };
  }

  // ── 4. Apenas conector → confiança 70 ──
  if (foundConnector) {
    const match = catalog.find((p) =>
      new RegExp(`\\b${foundConnector}\\b`).test(p.descricao.toUpperCase())
    );
    if (match) return { productId: match.id, codigo: match.codigo, descricao: match.descricao, precoMinimo: Number(match.precoMinimo), confianca: 70, metodoMatch: "bulbo" };
  }

  // ── 5. Linha + Potência (ex: "Ultra Led Asx 70w") → confiança 65 ──
  // Usa o produto de menor precoMinimo da família (mais conservador)
  if (foundLine && foundWattage) {
    const candidates = catalog.filter((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && wattageMatches(d);
    });
    if (candidates.length > 0) {
      const match = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return { productId: match.id, codigo: match.codigo, descricao: match.descricao, precoMinimo: Number(match.precoMinimo), confianca: 65, metodoMatch: "linha_watts" };
    }
  }

  // ── 6. Potência + Lumens (sem conector explícito) → confiança 60 ──
  if (foundWattage && foundLumens) {
    const candidates = catalog.filter((p) => wattageMatches(p.descricao));
    if (candidates.length > 0) {
      const match = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return { productId: match.id, codigo: match.codigo, descricao: match.descricao, precoMinimo: Number(match.precoMinimo), confianca: 60, metodoMatch: "watts_lumens" };
    }
  }

  // ── 7. Apenas ASX sem dados suficientes → sem match ──
  // Removido: retornar catalog[0] quando só "ASX" aparece no título
  // gerava falsos positivos massivos (qualquer anúncio ASX era pareado
  // com um produto aleatório, distorcendo a análise de preços).
  return null;
}

// ─── URL da loja ML ───────────────────────────────────────────────────────────
function buildStoreUrl(sellerIdOrNick: string, query: string, offset: number): string {
  const fromParam = offset > 0 ? `_Desde_${offset + 1}` : "";
  const isNumeric = /^\d+$/.test(sellerIdOrNick);
  if (isNumeric) {
    return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_CustId_${sellerIdOrNick}_NoIndex_True${fromParam}`;
  }
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_Loja_${sellerIdOrNick}_NoIndex_True${fromParam}`;
}

async function scrapeStorePage(
  sellerKey: string,
  query = "ASX",
  offset = 0
): Promise<ScrapedProduct[]> {
  const url = buildStoreUrl(sellerKey, query, offset);
  const html = await fetchHtml(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items: ScrapedProduct[] = [];

  $("li.ui-search-layout__item").each((_, card) => {
    const $card = $(card);
    const title =
      $card.find(".poly-component__title").text().trim() ||
      $card.find(".ui-search-item__title").text().trim();
    if (!title) return;

    // Extrair preço: fração (parte inteira) + centavos separadamente
    const fractionText = $card.find(".andes-money-amount__fraction").first().text().trim()
      || $card.find(".poly-price__current .andes-money-amount__fraction").first().text().trim();
    const centsText = $card.find(".andes-money-amount__cents").first().text().trim();

    let price = 0;
    if (fractionText) {
      const intPart = parseFloat(fractionText.replace(/\./g, "").replace(",", "."));
      const centsPart = centsText ? parseFloat(centsText) / 100 : 0;
      price = intPart + centsPart;
    } else {
      // Fallback: tentar extrair do texto completo do bloco de preço
      const priceText = $card.find(".poly-price__current").first().text().trim();
      const priceMatch = priceText.replace(/\./g, "").match(/(\d+),?(\d{0,2})/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1] + "." + (priceMatch[2] || "0"));
      }
    }
    if (!price || isNaN(price)) return;

    const href = $card.find("a[href]").first().attr("href") || "";
    const mlbMatch = href.match(/(MLB\d+)/);
    const mlbId = mlbMatch ? mlbMatch[1] : "";
    if (!mlbId) return;

    const thumbnail =
      $card.find("img").first().attr("src") ||
      $card.find("img").first().attr("data-src") ||
      "";

    items.push({ mlbId, title, price, url: href.split("#")[0], thumbnail, sellerNickname: sellerKey });
  });

  return items;
}

// ─── Scraper Principal ────────────────────────────────────────────────────────
export async function runScraper(
  options: ScrapeOptions = {}
): Promise<{ runId: number; found: number; violations: number }> {

  if (scraperInProgress) throw new Error("Monitoramento já em execução.");
  scraperInProgress = true;

  try {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const triggeredBy = options.triggeredBy ?? "scheduled";
    const slotHour = options.slotHour ?? null;
    console.log(`[Scraper v4] Iniciando... triggeredBy=${triggeredBy}, slotHour=${slotHour ?? "manual"}, clienteId=${options.clienteId ?? "todos"}`);
    // ── CRIAR REGISTRO DE EXECUÇÃO (PostgreSQL: .returning()) ──
    const runInsert = await db
      .insert(monitoringRuns)
      .values({
        status: "running",
        triggeredBy,
        slotHour,
        clienteId: options.clienteId ?? null,
        plataforma: "mercadolivre",
      })
      .returning({ id: monitoringRuns.id });

    const runId = Number(runInsert?.[0]?.id);
    if (!Number.isFinite(runId) || runId <= 0) throw new Error("Falha ao criar registro da execução");

    console.log(`[Scraper v4] runId=${runId}`);

    let totalFound = 0;
    let totalViolations = 0;
    const seenItemIds = new Set<string>();

    try {
      // ── Carregar catálogo ──
      const catalog = await db
        .select({
          id: products.id,
          codigo: products.codigo,
          descricao: products.descricao,
          ean: products.ean,
          precoMinimo: products.precoMinimo,
        })
        .from(products)
        .where(eq(products.ativo, true));

      if (catalog.length === 0) throw new Error("Catálogo vazio");
      console.log(`[Scraper v4] Catálogo: ${catalog.length} produtos ativos`);

      // ── Ler settings do banco ──
      const minKwRaw = await getSetting("ml_keywords_min_match");
      const minKw = Math.max(0, parseInt(minKwRaw ?? "0", 10) || 0);

      // ── Carregar clientes ──
      const clientesList = options.clienteId
        ? await db.select().from(clientes).where(and(eq(clientes.id, options.clienteId), eq(clientes.status, "ativo")))
        : await db.select().from(clientes).where(eq(clientes.status, "ativo"));

      // ═══════════════════════════════════════════════════════
      // FASE 1 — Busca cirúrgica por loja de cada cliente
      // ═══════════════════════════════════════════════════════
      for (const cliente of clientesList) {
        const searchKey =
          cliente.sellerId && /^\d+$/.test(cliente.sellerId)
            ? cliente.sellerId
            : cliente.lojaML;

        if (!searchKey) {
          console.warn(`[Scraper v4] Cliente ${cliente.nome} sem sellerId/lojaML, pulando`);
          continue;
        }

        console.log(`[Scraper v4] Fase1: ${cliente.nome} (key=${searchKey})`);
        let clienteFound = 0;
        let clienteViolations = 0;

        // Tentar API pública primeiro (se sellerId numérico) — sem autenticação necessária
        const isNumericSeller = /^\d+$/.test(searchKey);
        // API pública: usa sellerId numérico diretamente
        // Fallback: API oficial com token (se configurado)
        // Último recurso: scraping HTML
        let apiItems: ScrapedProduct[] | null = null;
        if (isNumericSeller) {
          // 1º: tenta API pública (sem token)
          const publicItems = await fetchSellerItemsPublicApi(searchKey);
          if (publicItems.length > 0) {
            apiItems = publicItems;
          } else {
            // 2º: tenta API oficial com token (se configurado)
            apiItems = await fetchSellerItemsViaApi(searchKey);
          }
        }
        if (apiItems !== null && apiItems.length > 0) {
          // ─── Via API ML (pública ou oficial) ────
          for (const item of apiItems) {
            if (!item.mlbId || seenItemIds.has(item.mlbId)) continue;
            seenItemIds.add(item.mlbId);
            const match = matchProduct(item.title, catalog);
            if (!match || match.confianca < 50) continue;
            clienteFound++; totalFound++;
            const isViolation = item.price < match.precoMinimo;
            if (isViolation) { clienteViolations++; totalViolations++; }
            await db.insert(priceSnapshots).values({ runId, productId: match.productId, sellerName: cliente.nome, sellerId: cliente.sellerId ?? String(cliente.id), clienteId: cliente.id, mlItemId: item.mlbId, mlTitle: item.title, mlUrl: item.url, mlThumbnail: item.thumbnail, plataforma: "mercadolivre", precoAnunciado: String(item.price), precoMinimo: String(match.precoMinimo), isViolation, validationReason: isViolation ? `Abaixo do mínimo (R$${match.precoMinimo})` : null, confianca: match.confianca, metodoMatch: match.metodoMatch });
            if (isViolation) {
              await db.insert(violations).values({ snapshotId: 0, runId, productId: match.productId, sellerName: cliente.nome, sellerId: cliente.sellerId ?? String(cliente.id), clienteId: cliente.id, mlItemId: item.mlbId, mlUrl: item.url, mlThumbnail: item.thumbnail, mlTitle: item.title, plataforma: "mercadolivre", precoAnunciado: String(item.price), precoMinimo: String(match.precoMinimo), diferenca: String(match.precoMinimo - item.price), percentAbaixo: String(((match.precoMinimo - item.price) / match.precoMinimo) * 100), confianca: match.confianca, metodoMatch: match.metodoMatch });
            }
          }
          await db.update(clientes).set({ totalProdutos: clienteFound, totalViolacoes: clienteViolations, ultimaVerificacao: new Date() }).where(eq(clientes.id, cliente.id));
          continue; // pular o loop de scraping abaixo
        }

        // ─── Fallback: Puppeteer Chromium (bypasses IP block) ───
        console.log(`[Scraper v4] Usando Puppeteer para ${cliente.nome}...`);
        let puppeteerItems: ScrapedProduct[] = [];
        try {
          const lojaML = cliente.lojaML || "";
          const scraped = await scrapeSellerStore(lojaML, cliente.sellerId ?? "", cliente.nome);
          puppeteerItems = scraped.map(i => ({
            mlbId: i.itemId || "",
            title: i.title,
            price: i.price,
            url: i.url,
            thumbnail: i.thumbnail || "",
            sellerNickname: lojaML,
          })).filter(i => i.price > 0);
          console.log(`[Scraper v4] Puppeteer: ${puppeteerItems.length} itens ASX para ${cliente.nome}`);
        } catch (puppErr) {
          console.error(`[Scraper v4] Puppeteer falhou para ${cliente.nome}:`, puppErr);
        }

        // Process puppeteer items
        for (const item of puppeteerItems) {
          if (seenItemIds.has(item.mlbId || item.url)) continue;
          seenItemIds.add(item.mlbId || item.url);

          const match = matchProduct(item.title, catalog);
          if (!match || match.confianca < 40) continue;

          clienteFound++; totalFound++;
          const isViolation = item.price < match.precoMinimo;
          if (isViolation) { clienteViolations++; totalViolations++; }

          await db.insert(priceSnapshots).values({
            runId, productId: match.productId,
            sellerName: cliente.nome, sellerId: cliente.sellerId ?? String(cliente.id),
            clienteId: cliente.id, mlItemId: item.mlbId || item.url.split('/').pop() || '',
            mlTitle: item.title, mlUrl: item.url, mlThumbnail: item.thumbnail,
            plataforma: "mercadolivre",
            precoAnunciado: String(item.price), precoMinimo: String(match.precoMinimo),
            isViolation,
            validationReason: isViolation ? `Preço R$${item.price.toFixed(2)} abaixo do mínimo R$${match.precoMinimo.toFixed(2)}` : "OK",
            confianca: match.confianca, metodoMatch: match.metodoMatch,
          }).catch((e: any) => console.error("[DB] snapshot:", e.message));

          if (isViolation) {
            const diferenca = match.precoMinimo - item.price;
            const percentAbaixo = (diferenca / match.precoMinimo) * 100;
            await db.insert(violations).values({
              snapshotId: 0, runId, productId: match.productId,
              sellerName: cliente.nome, sellerId: cliente.sellerId ?? String(cliente.id),
              clienteId: cliente.id, mlItemId: item.mlbId || '',
              mlUrl: item.url, mlThumbnail: item.thumbnail, mlTitle: item.title,
              plataforma: "mercadolivre",
              precoAnunciado: String(item.price), precoMinimo: String(match.precoMinimo),
              diferenca: String(diferenca.toFixed(2)),
              percentAbaixo: String(percentAbaixo.toFixed(2)),
              confianca: match.confianca, metodoMatch: match.metodoMatch, status: "open",
            }).catch((e: any) => console.error("[DB] violation:", e.message));
          }
        }

        // Legacy HTML scraping fallback (if puppeteer also fails)
        if (puppeteerItems.length === 0) {
        for (let offset = 0; offset < 300; offset += 48) {
          const pageItems = await scrapeStorePage(searchKey, "ASX", offset);
          if (pageItems.length === 0) break;

          for (const item of pageItems) {
            if (!item.mlbId || seenItemIds.has(item.mlbId)) continue;
            seenItemIds.add(item.mlbId);

            const match = matchProduct(item.title, catalog);
            if (!match || match.confianca < 50) continue;
            if (minKw > 0) {
              // conta sinais detectados
              const signals = [
                PRODUCT_LINES.some((l) => item.title.toUpperCase().includes(l)),
                CONNECTOR_PATTERNS.some((c) => new RegExp(`\\b${c}\\b`).test(item.title.toUpperCase())),
                !!extractWattage(item.title),
                !!extractLumens(item.title),
              ].filter(Boolean).length;
              if (signals < minKw) continue;
            }

            clienteFound++;
            totalFound++;
            const isViolation = item.price < match.precoMinimo;
            if (isViolation) { clienteViolations++; totalViolations++; }

            // Salvar snapshot
            await db.insert(priceSnapshots).values({
              runId,
              productId: match.productId,
              sellerName: cliente.nome,
              sellerId: cliente.sellerId ?? String(cliente.id),
              clienteId: cliente.id,
              mlItemId: item.mlbId,
              mlTitle: item.title,
              mlUrl: item.url,
              mlThumbnail: item.thumbnail,
              plataforma: "mercadolivre",
              precoAnunciado: String(item.price),
              precoMinimo: String(match.precoMinimo),
              isViolation,
              validationReason: isViolation
                ? `Preço R$${item.price.toFixed(2)} abaixo do mínimo R$${match.precoMinimo.toFixed(2)}`
                : "OK",
              confianca: match.confianca,
              metodoMatch: match.metodoMatch,
            }).catch((e: any) => console.error("[DB] snapshot:", e.message));

            // Salvar violação
            if (isViolation) {
              const diferenca = match.precoMinimo - item.price;
              const percentAbaixo = (diferenca / match.precoMinimo) * 100;
              await db.insert(violations).values({
                snapshotId: 0,
                runId,
                productId: match.productId,
                sellerName: cliente.nome,
                sellerId: cliente.sellerId ?? String(cliente.id),
                clienteId: cliente.id,
                mlItemId: item.mlbId,
                mlUrl: item.url,
                mlThumbnail: item.thumbnail,
                mlTitle: item.title,
                plataforma: "mercadolivre",
                precoAnunciado: String(item.price),
                precoMinimo: String(match.precoMinimo),
                diferenca: String(diferenca.toFixed(2)),
                percentAbaixo: String(percentAbaixo.toFixed(2)),
                confianca: match.confianca,
                metodoMatch: match.metodoMatch,
                status: "open",
              }).catch((e: any) => console.error("[DB] violation:", e.message));
            }

            // Histórico de preços — PostgreSQL ON CONFLICT
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            await db.insert(historicoPrecosTable).values({
              codigoAsx: match.codigo,
              plataforma: "mercadolivre",
              vendedor: cliente.nome,
              itemId: item.mlbId,
              preco: String(item.price),
              dataCaptura: today.toISOString().split("T")[0],
            }).catch((e: any) => {
              if (!e.message?.includes("duplicate") && !e.message?.includes("unique")) {
                console.error("[DB] historico:", e.message);
              }
            });

            // Ranking de vendedores — PostgreSQL ON CONFLICT
            await db.execute(
              sql`INSERT INTO vendedores (plataforma, vendedor_id, nome, cliente_id, total_violacoes, total_anuncios, ultima_vez)
                  VALUES ('mercadolivre', ${cliente.sellerId ?? String(cliente.id)}, ${cliente.nome}, ${cliente.id}, ${isViolation ? 1 : 0}, 1, NOW())
                  ON CONFLICT (vendedor_id) DO UPDATE SET
                    total_anuncios = vendedores.total_anuncios + 1,
                    total_violacoes = vendedores.total_violacoes + ${isViolation ? 1 : 0},
                    ultima_vez = NOW()`
            ).catch(() => {});
          }

          if (pageItems.length < 48) break;
        }
        } // end if(puppeteerItems.length === 0)

        // Atualizar totais do cliente
        await db.update(clientes).set({
          totalProdutos: clienteFound,
          totalViolacoes: clienteViolations,
          ultimaVerificacao: new Date(),
        }).where(eq(clientes.id, cliente.id));

        console.log(`[Scraper v4] ${cliente.nome}: ${clienteFound} produtos, ${clienteViolations} violações`);
      }

      // ═══════════════════════════════════════════════════════
      // FASE 2 — Busca geral por código ASX (vendedores não cadastrados)
      // ═══════════════════════════════════════════════════════
           if (!options.clienteId) {
        console.log("[Scraper v4] Fase2: busca geral por código ASX via API pública...");
        const topProducts = catalog.slice(0, 15);
        for (const prod of topProducts) {
          // Usa API pública do ML (sem autenticação) para busca geral
          const fase2ApiItems = await searchItemsPublicApi(`ASX ${prod.codigo}`, null);
          const fase2Items = fase2ApiItems.map(item => ({
            title: item.title,
            price: item.price,
            mlbId: item.mlbId,
            href: item.url,
            sellerEl: item.sellerNickname,
            thumbnail: item.thumbnail,
          })).filter(item => {
            if (!item.mlbId || seenItemIds.has(item.mlbId)) return false;
            seenItemIds.add(item.mlbId);
            return true;
          });
          for (const item of fase2Items) {
            const match = matchProduct(item.title, catalog);
            if (!match || match.confianca < 70) continue;

            totalFound++;
            const isViolation = item.price < match.precoMinimo;
            if (isViolation) totalViolations++;

            await db.insert(priceSnapshots).values({
              runId,
              productId: match.productId,
              sellerName: item.sellerEl || "Vendedor Desconhecido",
              sellerId: null,
              clienteId: null,
              mlItemId: item.mlbId,
              mlTitle: item.title,
              mlUrl: item.href.split("#")[0],
              mlThumbnail: item.thumbnail,
              plataforma: "mercadolivre",
              precoAnunciado: String(item.price),
              precoMinimo: String(match.precoMinimo),
              isViolation,
              validationReason: isViolation
                ? `Vendedor não cadastrado — R$${item.price.toFixed(2)} abaixo do mínimo R$${match.precoMinimo.toFixed(2)}`
                : "OK",
              confianca: match.confianca,
              metodoMatch: match.metodoMatch,
            }).catch(() => {});

            if (isViolation) {
              const diferenca = match.precoMinimo - item.price;
              const percentAbaixo = (diferenca / match.precoMinimo) * 100;
              await db.insert(violations).values({
                snapshotId: 0,
                runId,
                productId: match.productId,
                sellerName: item.sellerEl || "Vendedor Desconhecido",
                sellerId: null,
                clienteId: null,
                mlItemId: item.mlbId,
                mlUrl: item.href.split("#")[0],
                mlThumbnail: item.thumbnail,
                mlTitle: item.title,
                plataforma: "mercadolivre",
                precoAnunciado: String(item.price),
                precoMinimo: String(match.precoMinimo),
                diferenca: String(diferenca.toFixed(2)),
                percentAbaixo: String(percentAbaixo.toFixed(2)),
                confianca: match.confianca,
                metodoMatch: match.metodoMatch,
                status: "open",
              }).catch(() => {});
            }
          }
        }
      }

      // ── Finalizar execução — colunas corretas do Supabase ──
      await db.update(monitoringRuns).set({
        status: "completed",
        finishedAt: new Date(),
        totalFound,        // ← nome correto no Supabase
        totalViolations,   // ← nome correto no Supabase
      }).where(eq(monitoringRuns.id, runId));

      console.log(`[Scraper v4] Concluído. Encontrados: ${totalFound}, Violações: ${totalViolations}`);

      if (totalViolations > 0) {
        await notifyOwner({
          title: `⚠️ ASX Monitor: ${totalViolations} violação(ões) detectada(s)`,
          content: `Monitoramento concluído. ${totalFound} anúncios verificados, ${totalViolations} violações de preço mínimo.`,
        }).catch(() => {});
      }

      return { runId, found: totalFound, violations: totalViolations };

    } catch (err: any) {
      console.error("[Scraper v4] Erro fatal:", err.message);
      await db.update(monitoringRuns).set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: err.message,
      }).where(eq(monitoringRuns.id, runId)).catch(() => {});
      throw err;
    }

  } finally {
    scraperInProgress = false;
  }
}

// ─── Compatibilidade legado ───────────────────────────────────────────────────
export async function runMonitoring(triggeredBy: "scheduled" | "manual" = "scheduled") {
  const result = await runScraper({ triggeredBy });
  return { success: true, productsFound: result.found, violationsFound: result.violations, runId: result.runId };
}

// ─── Agendador Duplo (10h e 16h, America/Sao_Paulo) ─────────────────────────
const SLOT_HOURS = [10, 16]; // Turnos fixos: manhã e tarde
const schedulerTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

export function startScheduler() {
  stopScheduler();
  for (const slotHour of SLOT_HOURS) {
    void scheduleSlot(slotHour);
  }
}

async function scheduleSlot(slotHour: number) {
  const db = await getDb();
  if (!db) {
    console.warn(`[Scheduler v5] Banco indisponível, slot ${slotHour}h não agendado.`);
    return;
  }
  const ativoRaw = await getSetting("scraper_ativo");
  const ativo = (ativoRaw ?? "true").toLowerCase() === "true";
  if (!ativo) {
    console.log(`[Scheduler v5] Agendador desativado (scraper_ativo=false). Slot ${slotHour}h ignorado.`);
    return;
  }

  const now = new Date();
  // Calcular próxima execução no horário de Brasília (UTC-3)
  const next = new Date();
  next.setUTCHours(slotHour + 3, 0, 0, 0); // slotHour em BRT = slotHour+3 em UTC
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const delayMs = next.getTime() - now.getTime();
  const nextStr = next.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[Scheduler v5] Slot ${slotHour}h agendado: próxima execução em ${Math.round(delayMs / 60000)} min (${nextStr})`);

  const timer = setTimeout(async () => {
    schedulerTimers.delete(slotHour);
    try {
      console.log(`[Scheduler v5] Iniciando execução do slot ${slotHour}h...`);
      await runScraper({ triggeredBy: "scheduled", slotHour });
      console.log(`[Scheduler v5] Slot ${slotHour}h concluído.`);
    } catch (err: any) {
      console.error(`[Scheduler v5] Erro no slot ${slotHour}h:`, err.message);
    } finally {
      // Re-agendar para o próximo dia
      void scheduleSlot(slotHour);
    }
  }, delayMs);
  schedulerTimers.set(slotHour, timer);
}

export function stopScheduler() {
  schedulerTimers.forEach((timer, slotHour) => {
    clearTimeout(timer);
    console.log(`[Scheduler v5] Slot ${slotHour}h cancelado.`);
  });
  schedulerTimers.clear();
}
