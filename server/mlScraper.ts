/**
 * ASX Price Monitor — ML Scraper v3 (PostgreSQL)
 * Estratégia: HTML scraping das lojas dos vendedores no ML
 *
 * Por que HTML scraping em vez da API REST?
 * A API pública do ML (api.mercadolibre.com) exige OAuth para buscas por
 * seller_id e retorna 403 sem token. O scraping via HTML da loja pública
 * (lista.mercadolivre.com.br/_Loja_{nickname}) não requer autenticação
 * e retorna todos os produtos com preços em tempo real.
 *
 * Sistema de Confiança (0-100):
 *   100 = Código ASX exato no título (ex: ASX1007)
 *    85 = Marca ASX + Linha (ULTRA LED/SUPER LED) + Tipo de bulbo (H7/H4...)
 *    70 = Marca ASX + Tipo de bulbo
 *    50 = Apenas marca ASX no título
 *   <50 = DESCARTADO
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { getDb } from "./db";
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

// -- Utilitários --
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

// -- Categorização de produtos --
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
  else if (upper.includes("LAMPADA") || upper.includes("LÂMPADA"))
    categoria = "LAMPADA";
  else if (upper.includes("PROJETOR")) categoria = "PROJETOR";
  else if (upper.includes("LED")) categoria = "LED";

  const custo = Number(precoCusto);
  const linha: "PREMIUM" | "PLUS" | "ECO" =
    custo >= 100 ? "PREMIUM" : custo >= 40 ? "PLUS" : "ECO";

  return { categoria, linha };
}

// -- Sistema de Confiança --
const CONNECTOR_PATTERNS = [
  "H1", "H3", "H4", "H7", "H8", "H9", "H11", "H13", "H15", "H16", "H27",
  "HB3", "HB4", "T10", "T5", "P21W", "T15", "W16W", "D1S", "D2S", "D3S",
  "D4S", "9005", "9006", "9012",
];
const PRODUCT_LINES = [
  "ULTRA LED", "SUPER LED", "WORKLIGHT", "XENON", "ECO PLUGIN",
];

export function matchProduct(
  mlTitle: string,
  catalog: CatalogItem[]
): MatchResult | null {
  const titleUpper = mlTitle.toUpperCase();

  for (const prod of catalog) {
    const precoMinimo = Number(prod.precoMinimo);

    // 1. Match por código ASX exato no título (confiança 100)
    if (titleUpper.includes(prod.codigo.toUpperCase())) {
      return {
        productId: prod.id,
        codigo: prod.codigo,
        descricao: prod.descricao,
        precoMinimo,
        confianca: 100,
        metodoMatch: "codigo",
      };
    }
  }

  // 2-4. Matching por keywords
  const hasASX = titleUpper.includes("ASX");
  if (!hasASX) return null;

  const foundLine = PRODUCT_LINES.find((l) => titleUpper.includes(l));
  const foundConnector = CONNECTOR_PATTERNS.find((c) =>
    new RegExp(`\\b${c}\\b`).test(titleUpper)
  );

  // Match por linha + conector (confiança 85)
  if (foundLine && foundConnector) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return (
        d.includes(foundLine) &&
        new RegExp(`\\b${foundConnector}\\b`).test(d)
      );
    });
    if (match) {
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 85,
        metodoMatch: "linha_bulbo",
      };
    }
  }

  // Match por ASX + conector (confiança 70)
  if (foundConnector) {
    const match = catalog.find((p) =>
      new RegExp(`\\b${foundConnector}\\b`).test(p.descricao.toUpperCase())
    );
    if (match) {
      return {
        productId: match.id,
        codigo: match.codigo,
        descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo),
        confianca: 70,
        metodoMatch: "marca_bulbo",
      };
    }
  }

  // Match apenas por ASX (confiança 50 — mínimo aceitável)
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

  const $ = cheerio.load(html);
  const scrapedProducts: ScrapedProduct[] = [];

  $("li.ui-search-layout__item").each((_, card) => {
    const $card = $(card);

    // Title
    const title =
      $card.find(".poly-component__title").text().trim() ||
      $card.find(".ui-search-item__title").text().trim();
    if (!title) return;

    // Price — grab the main price element
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
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const triggeredBy = options.triggeredBy ?? "scheduled";
  console.log(
    `[Scraper v3] Iniciando... triggeredBy=${triggeredBy}, clienteId=${options.clienteId ?? "todos"}`
  );

  // Criar registro de execução (PostgreSQL: usar .returning() para obter o ID)
  const [runResult] = await db.insert(monitoringRuns).values({
    status: "running",
    triggeredBy,
    clienteId: options.clienteId ?? null,
    plataforma: "mercadolivre",
  }).returning({ id: monitoringRuns.id });
  const runId = runResult.id;

  let totalFound = 0;
  let totalViolations = 0;
  const seenItemIds = new Set<string>();
  const dbErrors: string[] = [];

  try {
    // Carregar catálogo ativo
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

    // -- FASE 1: Busca cirúrgica por loja do cliente --
    for (const cliente of clientesList) {
      const searchKey = cliente.sellerId && /^\d+$/.test(cliente.sellerId)
        ? cliente.sellerId
        : cliente.lojaML;

      if (!searchKey) {
        console.warn(`[Scraper v3] Cliente ${cliente.nome} sem sellerId nem lojaML, pulando`);
        continue;
      }

      console.log(
        `[Scraper v3] Buscando anúncios de ${cliente.nome} (searchKey: ${searchKey})`
      );
      let clienteFound = 0;
      let clienteViolations = 0;

      // Paginar resultados da loja (48 por página)
      for (let offset = 0; offset < 300; offset += 48) {
        const items = await scrapeStorePage(searchKey, "ASX", offset);
        if (items.length === 0) break;

        for (const item of items) {
          if (seenItemIds.has(item.mlbId)) continue;
          if (item.mlbId) seenItemIds.add(item.mlbId);

          const matchResult = matchProduct(item.title, catalog);
          if (!matchResult || matchResult.confianca < 50) continue;

          clienteFound++;
          totalFound++;
          const isViolation = item.price < matchResult.precoMinimo;
          if (isViolation) {
            clienteViolations++;
            totalViolations++;
          }

          // Salvar snapshot e capturar o ID retornado
          let snapshotId = 0;
          try {
            const [snap] = await db
              .insert(priceSnapshots)
              .values({
                runId,
                productId: matchResult.productId,
                sellerName: cliente.nome,
                sellerId: cliente.sellerId ?? String(cliente.id),
                clienteId: cliente.id,
                mlItemId: item.mlbId,
                mlTitle: item.title,
                mlUrl: item.url,
                mlThumbnail: item.thumbnail,
                plataforma: "mercadolivre",
                precoAnunciado: String(item.price),
                precoMinimo: String(matchResult.precoMinimo),
                isViolation,
                validationReason: isViolation
                  ? `Preço R$${item.price.toFixed(2)} abaixo do mínimo R$${matchResult.precoMinimo.toFixed(2)}`
                  : "OK",
                confianca: matchResult.confianca,
                metodoMatch: matchResult.metodoMatch,
              })
              .returning({ id: priceSnapshots.id });
            snapshotId = snap.id;
          } catch (e: any) {
            dbErrors.push(`snapshot: ${e.message}`);
            console.error("[DB] Erro ao salvar snapshot:", e.message);
          }

          // Salvar violação (com snapshotId real)
          if (isViolation) {
            const diferenca = matchResult.precoMinimo - item.price;
            const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
            try {
              await db
                .insert(violations)
                .values({
                  snapshotId,
                  runId,
                  productId: matchResult.productId,
                  sellerName: cliente.nome,
                  sellerId: cliente.sellerId ?? String(cliente.id),
                  clienteId: cliente.id,
                  mlItemId: item.mlbId,
                  mlUrl: item.url,
                  mlThumbnail: item.thumbnail,
                  mlTitle: item.title,
                  plataforma: "mercadolivre",
                  precoAnunciado: String(item.price),
                  precoMinimo: String(matchResult.precoMinimo),
                  diferenca: String(diferenca.toFixed(2)),
                  percentAbaixo: String(percentAbaixo.toFixed(2)),
                  confianca: matchResult.confianca,
                  metodoMatch: matchResult.metodoMatch,
                  status: "open",
                });
            } catch (e: any) {
              dbErrors.push(`violation: ${e.message}`);
              console.error("[DB] Erro ao salvar violação:", e.message);
            }
          }

          // Histórico de preços (PostgreSQL: ON CONFLICT DO UPDATE)
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
            // Ignore duplicate key errors for historico (expected on same day)
            if (!e.message?.includes("duplicate") && !e.message?.includes("unique")) {
              dbErrors.push(`historico: ${e.message}`);
              console.error("[DB] Erro ao salvar histórico:", e.message);
            }
          }

          // Ranking de vendedores (PostgreSQL: ON CONFLICT DO UPDATE)
          try {
            await db.execute(
              sql`INSERT INTO vendedores (plataforma, vendedor_id, nome, cliente_id, total_violacoes, total_anuncios)
                  VALUES ('mercadolivre', ${cliente.sellerId ?? String(cliente.id)}, ${cliente.nome}, ${cliente.id}, ${isViolation ? 1 : 0}, 1)
                  ON CONFLICT (vendedor_id) DO UPDATE SET
                    total_anuncios = vendedores.total_anuncios + 1,
                    total_violacoes = vendedores.total_violacoes + ${isViolation ? 1 : 0},
                    ultima_vez = NOW()`
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
        `[Scraper v3] ${cliente.nome}: ${clienteFound} produtos, ${clienteViolations} violações`
      );
    }

    // -- FASE 2: Busca geral por código ASX (vendedores não cadastrados) --
    if (!options.clienteId) {
      console.log("[Scraper v3] Fase 2: busca geral por código ASX...");
      const topProducts = catalog.slice(0, 15);

      for (const prod of topProducts) {
        const query = prod.codigo;
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_NoIndex_True`;
        const html = await fetchHtml(url);
        if (!html) continue;

        const $ = cheerio.load(html);

        $('li.ui-search-layout__item').each((_: number, card: any) => {
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
          if (seenItemIds.has(mlbId)) return;
          if (mlbId) seenItemIds.add(mlbId);

          const sellerEl = $card.find(".poly-component__seller").text().trim();
          const thumbnail =
            $card.find("img").first().attr("src") ||
            $card.find("img").first().attr("data-src") ||
            "";

          const matchResult = matchProduct(title, catalog);
          if (!matchResult || matchResult.confianca < 70) return;

          totalFound++;
          const isViolation = price < matchResult.precoMinimo;
          if (isViolation) totalViolations++;

          db.insert(priceSnapshots)
            .values({
              runId,
              productId: matchResult.productId,
              sellerName: sellerEl || "Vendedor Desconhecido",
              sellerId: mlbId,
              clienteId: null,
              mlItemId: mlbId,
              mlTitle: title,
              mlUrl: href.split("#")[0],
              mlThumbnail: thumbnail,
              plataforma: "mercadolivre",
              precoAnunciado: String(price),
              precoMinimo: String(matchResult.precoMinimo),
              isViolation,
              validationReason: isViolation
                ? `Vendedor não cadastrado — Preço R$${price.toFixed(2)} abaixo do mínimo R$${matchResult.precoMinimo.toFixed(2)}`
                : "OK",
              confianca: matchResult.confianca,
              metodoMatch: matchResult.metodoMatch,
            })
            .catch((e: any) => {
              dbErrors.push(`fase2_snapshot: ${e.message}`);
              console.error("[DB] Fase 2 - Erro snapshot:", e.message);
            });

          if (isViolation) {
            const diferenca = matchResult.precoMinimo - price;
            const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
            db.insert(violations)
              .values({
                snapshotId: 0,
                runId,
                productId: matchResult.productId,
                sellerName: sellerEl || "Vendedor Desconhecido",
                sellerId: mlbId,
                clienteId: null,
                mlItemId: mlbId,
                mlUrl: href.split("#")[0],
                mlThumbnail: thumbnail,
                mlTitle: title,
                plataforma: "mercadolivre",
                precoAnunciado: String(price),
                precoMinimo: String(matchResult.precoMinimo),
                diferenca: String(diferenca.toFixed(2)),
                percentAbaixo: String(percentAbaixo.toFixed(2)),
                confianca: matchResult.confianca,
                metodoMatch: matchResult.metodoMatch,
                status: "open",
              })
              .catch((e: any) => {
                dbErrors.push(`fase2_violation: ${e.message}`);
                console.error("[DB] Fase 2 - Erro violação:", e.message);
              });
          }
        });
      }
    }

    // Finalizar execução
    const finalStatus = dbErrors.length > 0 ? "completed" : "completed";
    await db
      .update(monitoringRuns)
      .set({
        status: finalStatus,
        finishedAt: new Date(),
        totalFound: totalFound,
        totalViolations: totalViolations,
        errorMessage: dbErrors.length > 0
          ? `${dbErrors.length} erros de DB: ${dbErrors.slice(0, 5).join("; ")}`
          : null,
      })
      .where(eq(monitoringRuns.id, runId));

    console.log(
      `[Scraper v3] Concluído. Encontrados: ${totalFound}, Violações: ${totalViolations}, Erros DB: ${dbErrors.length}`
    );

    if (totalViolations > 0) {
      await notifyOwner({
        title: `⚠️ ASX Monitor: ${totalViolations} violação(ões) detectada(s)`,
        content: `Monitoramento concluído. ${totalFound} anúncios encontrados, ${totalViolations} violações de preço mínimo detectadas.`,
      }).catch(() => {});
    }

    return { runId, found: totalFound, violations: totalViolations };
  } catch (err: any) {
    console.error("[Scraper v3] Erro fatal:", err.message);
    await db
      .update(monitoringRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: err.message,
      })
      .where(eq(monitoringRuns.id, runId));
    throw err;
  }
}

// -- Compatibilidade com código legado --
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

// -- Agendador (cron diário às 14h) --
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

export function startScheduler() {
  scheduleNext();
  console.log("[Scheduler v3] Agendador iniciado — execução diária às 14:00");
}

function scheduleNext() {
  const now = new Date();
  const next = new Date();
  next.setHours(14, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - now.getTime();
  console.log(
    `[Scheduler v3] Próxima execução em ${Math.round(delay / 60000)} minutos (${next.toLocaleString("pt-BR")})`
  );

  schedulerTimer = setTimeout(async () => {
    try {
      await runScraper({ triggeredBy: "scheduled" });
    } catch (err: any) {
      console.error("[Scheduler v3] Erro na execução agendada:", err.message);
    } finally {
      scheduleNext();
    }
  }, delay);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler v3] Agendador parado");
  }
}
