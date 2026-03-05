/**
 * ASX Price Monitor — ML Scraper v3 (PostgreSQL / Supabase)
 * Estrategia: HTML scraping das lojas dos vendedores no ML
 *
 * Por que HTML scraping em vez da API REST?
 * A API publica do ML (api.mercadolibre.com) exige OAuth para buscas por
 * seller_id e retorna 403 sem token. O scraping via HTML da loja publica
 * (lista.mercadolivre.com.br/_CustId_{sellerId}) nao requer autenticacao
 * e retorna todos os produtos com precos em tempo real.
 *
 * Sistema de Confianca (0-100):
 *   100 = Codigo ASX exato no titulo (ex: ASX1007)
 *    85 = Marca ASX + Linha (ULTRA LED/SUPER LED) + Tipo de bulbo (H7/H4...)
 *    70 = Marca ASX + Tipo de bulbo
 *    50 = Apenas marca ASX no titulo
 *   <50 = DESCARTADO
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { getDb, getSetting } from "./db";
import {
  products,
  monitoringRuns,
  priceSnapshots,
  violations,
  clientes,
  historicoPrecosTable,
} from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

const REQUEST_DELAY_MS = 3500; // Delay aumentado para evitar rate-limit do ML
const MAX_RETRIES = 3;

// Evita execuções concorrentes do scraper (manual vs agendado, etc.)
let scraperInProgress = false;

const SCRAPER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

// -- Tipos --
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
}

type CatalogItem = {
  id: number;
  codigo: string;
  descricao: string;
  ean: string | null;
  precoMinimo: string;
};

// -- Utilitarios --
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

// -- Categorizacao de produtos --
export function categorizarProduto(
  descricao: string,
  precoCusto: number
): { categoria: string; linha: "PREMIUM" | "PLUS" | "ECO" } {
  const upper = descricao.toUpperCase();
  let categoria = "OUTROS";
  if (upper.includes("ULTRA LED")) categoria = "ULTRA LED";
  else if (upper.includes("SUPER LED")) categoria = "SUPER LED";
  else if (upper.includes("WORKLIGHT") || upper.includes("WORK LIGHT"))
    categoria = "WORKLIGHT";
  else if (upper.includes("CHICOTE")) categoria = "CHICOTE";
  else if (upper.includes("XENON")) categoria = "XENON";
  else if (upper.includes("LAMPADA") || upper.includes("LAMPADA"))
    categoria = "LAMPADA";
  else if (upper.includes("PROJETOR")) categoria = "PROJETOR";
  else if (upper.includes("LED")) categoria = "LED";

  const custo = Number(precoCusto);
  const linha: "PREMIUM" | "PLUS" | "ECO" =
    custo >= 100 ? "PREMIUM" : custo >= 40 ? "PLUS" : "ECO";

  return { categoria, linha };
}

// -- Sistema de Confianca --
const CONNECTOR_PATTERNS = [
  // Ordenados do mais específico para o menos, para evitar que "H1" match antes de "H11"
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

// Extrai potência do título: "70W", "70 W", "70w" → "70"
function extractWattage(title: string): string | null {
  const m = title.toUpperCase().match(/\b(\d{2,3})\s*W\b/);
  return m ? m[1] : null;
}

// Extrai lúmens do título: "10000 lúmens", "10.000 lumens" → "10000"
function extractLumens(title: string): string | null {
  const m = title.toUpperCase().replace(/\./g, "").match(/\b(\d{4,6})\s*L[UÚ]MENS?\b/i);
  return m ? m[1] : null;
}

export function matchProduct(
  mlTitle: string,
  catalog: CatalogItem[],
  options?: { minKeywordMatches?: number }
): MatchResult | null {
  const minKeywordMatches = Math.max(0, options?.minKeywordMatches ?? 0);
  const titleUpper = mlTitle.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ── 1. Código ASX exato no título (ex: "ASX1007") — confiança 100 ──
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

  // Anúncios sem "ASX" não são da marca — descartar
  const hasASX = titleUpper.includes("ASX");
  if (!hasASX) return null;

  // Extrair características do título
  const foundLine       = PRODUCT_LINES.find((l) => titleUpper.includes(l));
  const foundConnector  = CONNECTOR_PATTERNS.find((c) =>
    new RegExp(`\\b${c}\\b`).test(titleUpper)
  );
  const foundWattage    = extractWattage(titleUpper);
  const foundLumens     = extractLumens(titleUpper);

  // Setting: ml_keywords_min_match
  // Exige um mínimo de sinais no título (linha, conector, watts, lumens)
  // antes de aceitar qualquer match — reduz falsos positivos.
  const keywordCount = [
    foundLine,
    foundConnector,
    foundWattage,
    foundLumens,
  ].filter(Boolean).length;
  if (minKeywordMatches > 0 && keywordCount < minKeywordMatches) {
    return null;
  }

  // Helper: verifica se a descrição do produto bate com a potência do título
  function wattageMatches(descricao: string): boolean {
    if (!foundWattage) return true; // sem info de W, não filtra
    const dUpper = descricao.toUpperCase();
    return new RegExp(`\\b${foundWattage}\\s*W\\b`).test(dUpper);
  }

  // ── 2. Linha + Conector + Potência — confiança 95 ──
  if (foundLine && foundConnector) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return (
        d.includes(foundLine) &&
        new RegExp(`\\b${foundConnector}\\b`).test(d) &&
        wattageMatches(d)
      );
    });
    if (match) {
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 95,
        metodoMatch: "linha_bulbo_watts",
      };
    }
    // sem potência, linha + conector apenas
    const matchNoW = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d);
    });
    if (matchNoW) {
      return {
        productId: matchNoW.id,
        codigo: matchNoW.codigo,
        descricao: matchNoW.descricao,
        precoMinimo: Number(matchNoW.precoMinimo),
        confianca: 85,
        metodoMatch: "linha_bulbo",
      };
    }
  }

  // ── 3. Conector + Potência (sem linha no título) — confiança 80 ──
  if (foundConnector && foundWattage) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return (
        new RegExp(`\\b${foundConnector}\\b`).test(d) &&
        wattageMatches(d)
      );
    });
    if (match) {
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 80,
        metodoMatch: "bulbo_watts",
      };
    }
  }

  // ── 4. Apenas conector — confiança 70 ──
  // Usa o produto com MENOR preço mínimo para o conector (mais conservador)
  if (foundConnector) {
    const candidates = catalog.filter((p) =>
      new RegExp(`\\b${foundConnector}\\b`).test(p.descricao.toUpperCase())
    );
    if (candidates.length > 0) {
      const match = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 70,
        metodoMatch: "bulbo",
      };
    }
  }

  // ── 5. Linha + Potência (sem conector no título) — confiança 65 ──
  if (foundLine && foundWattage) {
    const candidates = catalog.filter((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && wattageMatches(d);
    });
    if (candidates.length > 0) {
      const match = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 65,
        metodoMatch: "linha_watts",
      };
    }
  }

  // ── 6. Potência + lumens sem conector — confiança 60 ──
  if (foundWattage && (foundLine || foundLumens)) {
    const candidates = catalog.filter((p) => wattageMatches(p.descricao));
    if (candidates.length > 0) {
      const match = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 60,
        metodoMatch: "watts_lumens",
      };
    }
  }

  // ── 7. Apenas ASX — confiança 50 (mínimo aceitável) ──
  const firstProd = catalog[0];
  if (firstProd) {
    return {
      productId: firstProd.id,
      codigo: firstProd.codigo,
      descricao: firstProd.descricao,
      precoMinimo: Number(firstProd.precoMinimo),
      confianca: 50,
      metodoMatch: "marca",
    };
  }

  return null;
}

// -- Scraper de Loja ML (HTML) --
function buildStoreUrl(sellerIdOrNick: string, query: string, offset: number): string {
  const fromParam = offset > 0 ? `_Desde_${offset + 1}` : "";
  const isNumeric = /^\d+$/.test(sellerIdOrNick);
  if (isNumeric) {
    return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_CustId_${sellerIdOrNick}_NoIndex_True${fromParam}`;
  }
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_Loja_${sellerIdOrNick}_NoIndex_True${fromParam}`;
}

async function scrapeStorePage(
  nickname: string,
  query: string = "ASX",
  offset: number = 0
): Promise<ScrapedProduct[]> {
  const url = buildStoreUrl(nickname, query, offset);

  const html = await fetchHtml(url);
  if (!html) return [];

  // Detectar bloqueio do ML (HTML sem cards de produto)
  if (!html.includes('ui-search-layout__item') && !html.includes('poly-component__title')) {
    console.warn(`[ML] Bloqueio detectado para ${nickname}. HTML sem resultados.`);
    return [];
  }

  const $ = cheerio.load(html);
  const scrapedProducts: ScrapedProduct[] = [];

  $("li.ui-search-layout__item").each((_, card) => {
    const $card = $(card);

    // Title
    const title =
      $card.find(".poly-component__title").text().trim() ||
      $card.find(".ui-search-item__title").text().trim();
    if (!title) return;

    // Price
    const priceEl = $card.find(".poly-price__current").first();
    const priceText = priceEl.text().trim();
    const priceMatch = priceText.replace(/\./g, "").match(/[\d,]+/);
    if (!priceMatch) return;
    const price = parseFloat(priceMatch[0].replace(",", "."));
    if (!price || isNaN(price)) return;

    // URL and MLB ID
    const href = $card.find("a[href]").first().attr("href") || "";
    const mlbMatch = href.match(/(MLB\d+)/);
    const mlbId = mlbMatch ? mlbMatch[1] : "";

    // Thumbnail
    const thumbnail =
      $card.find("img").first().attr("src") ||
      $card.find("img").first().attr("data-src") ||
      "";

    scrapedProducts.push({
      mlbId,
      title,
      price,
      url: href.split("#")[0],
      thumbnail,
      sellerNickname: nickname,
    });
  });

  return scrapedProducts;
}

// -- Scraper Principal --
export async function runScraper(
  options: ScrapeOptions = {}
): Promise<{ runId: number; found: number; violations: number }> {
  if (scraperInProgress) {
    throw new Error("Monitoramento já em execução.");
  }
  scraperInProgress = true;

  try {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados nao disponivel");

    const triggeredBy = options.triggeredBy ?? "scheduled";
    console.log(
      `[Scraper v3] Iniciando... triggeredBy=${triggeredBy}, clienteId=${options.clienteId ?? "todos"}`
    );

    // Criar registro de execucao
    const runInsert = await db
      .insert(monitoringRuns)
      .values({
        status: "running",
        triggeredBy: triggeredBy,
        clienteId: options.clienteId ?? null,
        plataforma: "mercadolivre",
      })
      .returning({ id: monitoringRuns.id });
    const runId = Number((runInsert as any)?.[0]?.id);
    if (!Number.isFinite(runId) || runId <= 0) {
      throw new Error("Falha ao criar registro da execução (monitoring_runs)");
    }

    let totalFound = 0;
    let totalViolations = 0;
    const seenItemIds = new Set<string>();
    const dbErrors: string[] = [];

    try {
    // Carregar catalogo ativo
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

    if (catalog.length === 0) throw new Error("Catalogo vazio");

    // Settings (via app_settings)
    const minKeywordMatchesSetting = Number.parseInt(
      (await getSetting("ml_keywords_min_match")) ?? "0",
      10
    );
    const minKeywordMatches = Number.isFinite(minKeywordMatchesSetting)
      ? Math.max(0, Math.min(10, minKeywordMatchesSetting))
      : 0;

    const mlSearchLimitSetting = Number.parseInt(
      (await getSetting("ml_search_limit")) ?? "50",
      10
    );
    const mlSearchLimit = Number.isFinite(mlSearchLimitSetting)
      ? Math.max(1, Math.min(500, mlSearchLimitSetting))
      : 50;

    console.log(
      `[Scraper v3] Settings: ml_keywords_min_match=${minKeywordMatches}, ml_search_limit=${mlSearchLimit}`
    );

    // Carregar clientes ativos
    const clientesList = options.clienteId
      ? await db
          .select()
          .from(clientes)
          .where(
            and(
              eq(clientes.id, options.clienteId),
              eq(clientes.status, "ativo")
            )
          )
      : await db.select().from(clientes).where(eq(clientes.status, "ativo"));

    // -- FASE 1: Busca cirurgica por loja do cliente --
    for (const cliente of clientesList) {
      const searchKey = cliente.sellerId && /^\d+$/.test(cliente.sellerId)
        ? cliente.sellerId
        : cliente.lojaML;

      if (!searchKey) {
        console.warn(`[Scraper v3] Cliente ${cliente.nome} sem seller_id nem loja_ml, pulando`);
        continue;
      }

      console.log(
        `[Scraper v3] Buscando anuncios de ${cliente.nome} (searchKey: ${searchKey})`
      );
      let clienteFound = 0;
      let clienteViolations = 0;

      // Paginar resultados da loja (48 por pagina)
      for (let offset = 0; offset < 300; offset += 48) {
        const items = await scrapeStorePage(searchKey, "ASX", offset);
        if (items.length === 0) break;

        for (const item of items) {
          if (!item.mlbId) continue;
          if (seenItemIds.has(item.mlbId)) continue;
          seenItemIds.add(item.mlbId);

          const matchResult = matchProduct(item.title, catalog, {
            minKeywordMatches,
          });
          if (!matchResult || matchResult.confianca < 50) continue;

          clienteFound++;
          totalFound++;
          const isViolation = item.price < matchResult.precoMinimo;
          if (isViolation) {
            clienteViolations++;
            totalViolations++;
          }

          // Salvar snapshot
          let snapshotId = 0;
          try {
            const snapInsert = await db
              .insert(priceSnapshots)
              .values({
                runId: runId,
                productId: matchResult.productId,
                sellerName: cliente.nome,
                sellerId: cliente.sellerId ?? String(cliente.id),
                clienteId: cliente.id,
                mlItemId: item.mlbId,
                mlTitle: item.title,
                mlUrl: item.url,
                mlThumbnail: item.thumbnail,
                precoAnunciado: String(item.price),
                precoMinimo: String(matchResult.precoMinimo),
                isViolation: isViolation,
                confianca: matchResult.confianca,
                metodoMatch: matchResult.metodoMatch,
                plataforma: "mercadolivre",
              }).returning({ id: priceSnapshots.id });
            snapshotId = snapInsert[0]?.id ?? 0;
          } catch (e: any) {
            dbErrors.push(`snapshot: ${e.message}`);
            console.error("[DB] Erro ao salvar snapshot:", e.message);
          }

          // Salvar violacao
          if (isViolation) {
            const diferenca = matchResult.precoMinimo - item.price;
            const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
            try {
              await db
                .insert(violations)
                .values({
                  snapshotId: snapshotId,
                  runId: runId,
                  productId: matchResult.productId,
                  clienteId: cliente.id,
                  sellerName: cliente.nome,
                  sellerId: cliente.sellerId ?? String(cliente.id),
                  mlItemId: item.mlbId,
                  mlUrl: item.url,
                  mlThumbnail: item.thumbnail,
                  mlTitle: item.title,
                  precoAnunciado: String(item.price),
                  precoMinimo: String(matchResult.precoMinimo),
                  diferenca: String(diferenca.toFixed(2)),
                  percentAbaixo: String(percentAbaixo.toFixed(2)),
                  confianca: matchResult.confianca,
                  metodoMatch: matchResult.metodoMatch,
                  plataforma: "mercadolivre",
                  status: "open",
                });
            } catch (e: any) {
              dbErrors.push(`violation: ${e.message}`);
              console.error("[DB] Erro ao salvar violacao:", e.message);
            }
          }

          // Historico de precos (snake_case columns)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          try {
            await db
              .insert(historicoPrecosTable)
              .values({
                codigoAsx: matchResult.codigo,
                plataforma: "mercadolivre",
                vendedor: cliente.nome,
                itemId: item.mlbId,
                preco: String(item.price),
                dataCaptura: today.toISOString().split("T")[0],
              });
          } catch (e: any) {
            if (!e.message?.includes("duplicate") && !e.message?.includes("unique")) {
              dbErrors.push(`historico: ${e.message}`);
              console.error("[DB] Erro ao salvar historico:", e.message);
            }
          }

          // Ranking de vendedores (raw SQL - snake_case columns)
          try {
            await db.execute(
              sql`INSERT INTO vendedores (plataforma, vendedorId, nome, clienteId, totalViolacoes, totalAnuncios)
                  VALUES ('mercadolivre', ${cliente.sellerId ?? String(cliente.id)}, ${cliente.nome}, ${cliente.id}, ${isViolation ? 1 : 0}, 1)
                  ON DUPLICATE KEY UPDATE
                    totalAnuncios = totalAnuncios + 1,
                    totalViolacoes = totalViolacoes + ${isViolation ? 1 : 0},
                    ultimaVez = NOW()`
            );
          } catch (e: any) {
            dbErrors.push(`vendedor: ${e.message}`);
            console.error("[DB] Erro ao salvar vendedor:", e.message);
          }
        }

        if (items.length < 48) break;
      }

      // Atualizar totais do cliente
      await db
        .update(clientes)
        .set({
          totalProdutos: clienteFound,
          totalViolacoes: clienteViolations,
          ultimaVerificacao: new Date(),
        })
        .where(eq(clientes.id, cliente.id));

      console.log(
        `[Scraper v3] ${cliente.nome}: ${clienteFound} produtos, ${clienteViolations} violacoes`
      );
    }

    // -- FASE 2: Busca geral por codigo ASX (vendedores nao cadastrados) --
    if (!options.clienteId) {
      console.log("[Scraper v3] Fase 2: busca geral por codigo ASX...");
      const topProducts = catalog.slice(0, 15);

      // Mapa de sellerId → nome do cliente para lookup reverso
      const sellerIdToNome = new Map<string, string>();
      for (const c of clientesList) {
        if (c.sellerId) sellerIdToNome.set(c.sellerId, c.nome);
        if (c.lojaML) sellerIdToNome.set(c.lojaML.toLowerCase(), c.nome);
      }

      for (const prod of topProducts) {
        const query = prod.codigo;
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_NoIndex_True`;
        const html = await fetchHtml(url);
        if (!html) continue;

        // Detectar bloqueio do ML
        if (!html.includes('ui-search-layout__item') && !html.includes('poly-component__title')) {
          console.warn(`[Scraper v3] Fase 2: ML bloqueou requisicao para "${query}". Aguardando 30s...`);
          await sleep(30000);
          continue;
        }

        const $ = cheerio.load(html);
        const fase2Items: Array<{title: string; price: number; mlbId: string; href: string; sellerEl: string; sellerLink: string; thumbnail: string}> = [];

        $('li.ui-search-layout__item').each((_: number, card: any) => {
          if (fase2Items.length >= mlSearchLimit) return false;
          const $card = $(card);
          const title =
            $card.find(".poly-component__title").text().trim() ||
            $card.find(".ui-search-item__title").text().trim();
          if (!title) return;

          const priceEl = $card.find(".poly-price__current").first();
          const priceText = priceEl.text().trim();
          const priceMatchResult = priceText.replace(/\./g, "").match(/[\d,]+/);
          if (!priceMatchResult) return;
          const price = parseFloat(priceMatchResult[0].replace(",", "."));
          if (!price || isNaN(price)) return;

          const href = $card.find("a[href]").first().attr("href") || "";
          const mlbMatch = href.match(/(MLB\d+)/);
          const mlbId = mlbMatch ? mlbMatch[1] : "";
          if (!mlbId) return;
          if (seenItemIds.has(mlbId)) return;
          seenItemIds.add(mlbId);

          // Extrair nome do vendedor de múltiplos seletores
          const sellerEl =
            $card.find(".poly-component__seller").text().trim() ||
            $card.find(".ui-search-official-store-label").text().trim() ||
            $card.find(".ui-search-item__store-label").text().trim() ||
            "";

          // Extrair link da loja para identificar o vendedor
          const sellerLink =
            $card.find("a[href*='_Loja_']").attr("href") ||
            $card.find("a[href*='loja/']").attr("href") ||
            "";

          const thumbnail =
            $card.find("img").first().attr("src") ||
            $card.find("img").first().attr("data-src") ||
            "";

          fase2Items.push({ title, price, mlbId, href, sellerEl, sellerLink, thumbnail });
        });

        for (const item of fase2Items) {
          const matchResult = matchProduct(item.title, catalog, {
            minKeywordMatches,
          });
          if (!matchResult || matchResult.confianca < 70) continue;

          totalFound++;
          const isViolation = item.price < matchResult.precoMinimo;
          if (isViolation) totalViolations++;

          // Resolver nome do vendedor: seletor HTML → link da loja → lookup reverso → fallback
          let resolvedSellerName = item.sellerEl;
          if (!resolvedSellerName && item.sellerLink) {
            const lojaMatch = item.sellerLink.match(/_Loja_([^_&?]+)/i) ||
                              item.sellerLink.match(/\/loja\/([^/?&]+)/i);
            if (lojaMatch) {
              const lojaKey = lojaMatch[1].toLowerCase();
              resolvedSellerName = sellerIdToNome.get(lojaKey) || lojaMatch[1];
            }
          }
          // Lookup reverso pelo MLB ID (se for cliente cadastrado)
          if (!resolvedSellerName) {
            resolvedSellerName = sellerIdToNome.get(item.mlbId) || "Vendedor Nao Cadastrado";
          }

          let snapshotId = 0;
          try {
            const snap2Insert = await db.insert(priceSnapshots)
              .values({
                runId: runId,
                productId: matchResult.productId,
                sellerName: resolvedSellerName,
                sellerId: item.mlbId,
                clienteId: null,
                mlItemId: item.mlbId,
                mlTitle: item.title,
                mlUrl: item.href.split("#")[0],
                mlThumbnail: item.thumbnail,
                precoAnunciado: String(item.price),
                precoMinimo: String(matchResult.precoMinimo),
                isViolation: isViolation,
                confianca: matchResult.confianca,
                metodoMatch: matchResult.metodoMatch,
                plataforma: "mercadolivre",
              }).returning({ id: priceSnapshots.id });
            snapshotId = snap2Insert[0]?.id ?? 0;
          } catch (e: any) {
            dbErrors.push(`fase2_snapshot: ${e.message}`);
            console.error("[DB] Fase 2 - Erro snapshot:", e.message);
          }

          if (isViolation) {
            const diferenca = matchResult.precoMinimo - item.price;
            const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
            try {
              await db.insert(violations)
                .values({
                  snapshotId: snapshotId,
                  runId: runId,
                  productId: matchResult.productId,
                  sellerName: resolvedSellerName,
                  sellerId: item.mlbId,
                  mlItemId: item.mlbId,
                  mlUrl: item.href.split("#")[0],
                  mlThumbnail: item.thumbnail,
                  mlTitle: item.title,
                  precoAnunciado: String(item.price),
                  precoMinimo: String(matchResult.precoMinimo),
                  diferenca: String(diferenca.toFixed(2)),
                  percentAbaixo: String(percentAbaixo.toFixed(2)),
                  confianca: matchResult.confianca,
                  metodoMatch: matchResult.metodoMatch,
                  plataforma: "mercadolivre",
                  status: "open",
                });
            } catch (e: any) {
              dbErrors.push(`fase2_violation: ${e.message}`);
              console.error("[DB] Fase 2 - Erro violacao:", e.message);
            }
          }
        }
      }
    }

    // Finalizar execucao
    await db
      .update(monitoringRuns)
      .set({
        status: "completed" as const,
        finishedAt: new Date(),
        productsFound: totalFound,
        totalViolations: totalViolations,
        errorMessage: dbErrors.length > 0
          ? `${dbErrors.length} erros de DB: ${dbErrors.slice(0, 5).join("; ")}`
          : null,
      })
      .where(eq(monitoringRuns.id, runId));

    console.log(
      `[Scraper v3] Concluido. Encontrados: ${totalFound}, Violacoes: ${totalViolations}, Erros DB: ${dbErrors.length}`
    );

    if (totalViolations > 0) {
      await notifyOwner({
        title: `ASX Monitor: ${totalViolations} violacao(oes) detectada(s)`,
        content: `Monitoramento concluido. ${totalFound} anuncios encontrados, ${totalViolations} violacoes de preco minimo detectadas.`,
      }).catch(() => {});
    }

      return { runId, found: totalFound, violations: totalViolations };
    } catch (err: any) {
      console.error("[Scraper v3] Erro fatal:", err.message);
      if (runId) {
        await db
          .update(monitoringRuns)
          .set({
            status: "failed" as const,
            finishedAt: new Date(),
            errorMessage: err.message,
          })
          .where(eq(monitoringRuns.id, runId));
      }
      throw err;
    }
  } finally {
    scraperInProgress = false;
  }
}

// -- Compatibilidade com codigo legado --
export async function runMonitoring(
  triggeredBy: "scheduled" | "manual" = "scheduled"
) {
  const result = await runScraper({ triggeredBy });
  return {
    success: true,
    productsFound: result.found,
    violationsFound: result.violations,
    runId: result.runId,
  };
}

// -- Agendador (cron diario as 14h) --
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

export function startScheduler() {
  // Evita timers duplicados quando startScheduler é chamado mais de uma vez
  stopScheduler();
  void scheduleNext();
}

async function loadSchedulerConfig(): Promise<{ active: boolean; hour: number }> {
  // Sem banco não tem como ler settings => não agenda.
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Scheduler v3] Banco de dados indisponível. Agendador não será iniciado."
    );
    return { active: false, hour: 14 };
  }

  const [ativoRaw, horaRaw] = await Promise.all([
    getSetting("scraper_ativo"),
    getSetting("scraper_hora"),
  ]);

  const active = (ativoRaw ?? "true").toLowerCase() === "true";
  const parsedHour = Number.parseInt(horaRaw ?? "14", 10);
  const hour = Number.isFinite(parsedHour)
    ? Math.min(23, Math.max(0, parsedHour))
    : 14;

  return { active, hour };
}

function getOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const tzName =
    dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ??
    "";
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number.parseInt(m[2], 10);
  const mm = m[3] ? Number.parseInt(m[3], 10) : 0;
  return sign * (hh * 60 + mm);
}

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(
    parts
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10),
    second: Number.parseInt(map.second, 10),
  };
}

function zonedDateTimeToUtcMs(opts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}) {
  const baseUtc = Date.UTC(
    opts.year,
    opts.month - 1,
    opts.day,
    opts.hour,
    opts.minute,
    opts.second,
    0
  );

  // Ajuste de offset (pode variar com DST). Fazemos algumas iterações para estabilizar.
  let utc = baseUtc;
  for (let i = 0; i < 3; i++) {
    const offsetMinutes = getOffsetMinutes(new Date(utc), opts.timeZone);
    const corrected = baseUtc - offsetMinutes * 60_000;
    if (corrected === utc) break;
    utc = corrected;
  }
  return utc;
}

function computeNextRun(hour: number, timeZone: string) {
  const now = new Date();
  const zonedNow = getZonedParts(now, timeZone);

  // Candidato: hoje (no timezone alvo), às HH:00
  let candidateUtcMs = zonedDateTimeToUtcMs({
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
    hour,
    minute: 0,
    second: 0,
    timeZone,
  });

  if (candidateUtcMs <= now.getTime()) {
    // Próximo dia (no calendário do timezone alvo)
    const nextDayUtc =
      Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day) + 86_400_000;
    const nextDay = new Date(nextDayUtc);
    candidateUtcMs = zonedDateTimeToUtcMs({
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour,
      minute: 0,
      second: 0,
      timeZone,
    });
  }

  return {
    next: new Date(candidateUtcMs),
    delayMs: candidateUtcMs - now.getTime(),
  };
}

async function scheduleNext() {
  const config = await loadSchedulerConfig();

  const timeZone =
    process.env.SCRAPER_TIMEZONE ||
    process.env.APP_TIMEZONE ||
    process.env.TZ ||
    "America/Bahia";

  if (!config.active) {
    console.log(
      "[Scheduler v3] Agendador desativado (scraper_ativo=false ou banco indisponível). Nenhuma execução será agendada."
    );
    schedulerTimer = null;
    return;
  }

  const { next, delayMs } = computeNextRun(config.hour, timeZone);
  const nextLocal = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(next);
  console.log(
    `[Scheduler v3] Agendador ativo (${timeZone}) - execução diária às ${String(config.hour).padStart(2, "0")}:00. Próxima em ${Math.round(delayMs / 60000)} minutos (${nextLocal})`
  );

  schedulerTimer = setTimeout(async () => {
    try {
      await runScraper({ triggeredBy: "scheduled" });
    } catch (err: any) {
      console.error("[Scheduler v3] Erro na execução agendada:", err?.message ?? err);
    } finally {
      void scheduleNext();
    }
  }, delayMs);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler v3] Agendador parado");
  }
}
