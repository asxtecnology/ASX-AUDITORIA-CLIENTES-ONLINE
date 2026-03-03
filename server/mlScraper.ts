/**
 * ASX Price Monitor — ML Scraper v2
 * Estratégia dual:
 *   1. Busca cirúrgica por seller_id (clientes cadastrados)
 *   2. Busca geral por código/EAN/keywords (vendedores não cadastrados)
 *
 * Sistema de Confiança (0-100):
 *   100 = EAN/GTIN corresponde ao catálogo
 *    95 = Código ASX exato no título (ex: ASX1007)
 *    85 = Marca ASX + Linha (ULTRA LED/SUPER LED) + Tipo de bulbo (H7/H4...)
 *    70 = Marca ASX + Tipo de bulbo
 *    50 = Apenas marca ASX no título
 *   <50 = DESCARTADO
 */

import axios from "axios";
import { getDb } from "./db";
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

const ML_API = "https://api.mercadolibre.com";
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 3;

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface MLSearchResult {
  id: string;
  title: string;
  price: number;
  seller: { id: number; nickname: string };
  permalink: string;
  thumbnail: string;
}

interface MLItemDetail {
  id: string;
  title: string;
  price: number;
  seller_id: number;
  permalink: string;
  thumbnail: string;
  attributes: Array<{ id: string; value_name: string | null }>;
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

// ─── Utilitários ─────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mlGet<T>(url: string, retries = 0): Promise<T | null> {
  try {
    await sleep(REQUEST_DELAY_MS);
    const res = await axios.get<T>(url, { timeout: 12000 });
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429 && retries < MAX_RETRIES) {
      const backoff = [5000, 10000, 20000][retries] ?? 20000;
      console.warn(`[ML] Rate limit (429). Aguardando ${backoff / 1000}s... (tentativa ${retries + 1})`);
      await sleep(backoff);
      return mlGet<T>(url, retries + 1);
    }
    console.error(`[ML] Erro ao buscar ${url}: ${status ?? err.message}`);
    return null;
  }
}

// ─── Categorização de produtos ────────────────────────────────────────────────
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
  else if (upper.includes("PROJETOR")) categoria = "PROJETOR";
  else if (upper.includes("LED")) categoria = "LED";

  const custo = Number(precoCusto);
  const linha: "PREMIUM" | "PLUS" | "ECO" =
    custo >= 100 ? "PREMIUM" : custo >= 40 ? "PLUS" : "ECO";

  return { categoria, linha };
}

// ─── Sistema de Confiança ─────────────────────────────────────────────────────
const CONNECTOR_PATTERNS = [
  "H1","H3","H4","H7","H8","H9","H11","H13","H15","H16","H27",
  "HB3","HB4","T10","T5","P21W","T15","W16W","D1S","D2S","D3S","D4S","9005","9006","9012",
];
const PRODUCT_LINES = ["ULTRA LED", "SUPER LED", "WORKLIGHT", "XENON", "ECO PLUGIN"];

type CatalogItem = {
  id: number;
  codigo: string;
  descricao: string;
  ean: string | null;
  precoMinimo: string;
};

export function matchProduct(
  mlTitle: string,
  mlAttributes: Array<{ id: string; value_name: string | null }>,
  catalog: CatalogItem[]
): MatchResult | null {
  const titleUpper = mlTitle.toUpperCase();

  // Extrair EAN/GTIN dos atributos do anúncio
  const mlEan = mlAttributes
    .find((a) => ["GTIN", "EAN", "CODIGO_DE_BARRAS"].includes(a.id))
    ?.value_name?.replace(/\D/g, "");

  for (const prod of catalog) {
    const precoMinimo = Number(prod.precoMinimo);

    // 1. Match por EAN (confiança 100)
    if (mlEan && prod.ean && mlEan === prod.ean.replace(/\D/g, "")) {
      return {
        productId: prod.id, codigo: prod.codigo, descricao: prod.descricao,
        precoMinimo, confianca: 100, metodoMatch: "ean",
      };
    }

    // 2. Match por código ASX exato no título (confiança 95)
    if (titleUpper.includes(prod.codigo.toUpperCase())) {
      return {
        productId: prod.id, codigo: prod.codigo, descricao: prod.descricao,
        precoMinimo, confianca: 95, metodoMatch: "codigo",
      };
    }
  }

  // 3-5. Matching por keywords
  const hasASX = titleUpper.includes("ASX");
  if (!hasASX) return null;

  const foundLine = PRODUCT_LINES.find((l) => titleUpper.includes(l));
  const foundConnector = CONNECTOR_PATTERNS.find((c) => new RegExp(`\\b${c}\\b`).test(titleUpper));

  // Match por linha + conector (confiança 85)
  if (foundLine && foundConnector) {
    const match = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d);
    });
    if (match) {
      return {
        productId: match.id, codigo: match.codigo, descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo), confianca: 85, metodoMatch: "linha_bulbo",
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
        productId: match.id, codigo: match.codigo, descricao: match.descricao,
        precoMinimo: Number(match.precoMinimo), confianca: 70, metodoMatch: "marca_bulbo",
      };
    }
  }

  // Match apenas por ASX (confiança 50 — mínimo aceitável)
  const firstProd = catalog[0];
  if (firstProd) {
    return {
      productId: firstProd.id, codigo: firstProd.codigo, descricao: firstProd.descricao,
      precoMinimo: Number(firstProd.precoMinimo), confianca: 50, metodoMatch: "marca",
    };
  }

  return null;
}

// ─── Scraper Principal ────────────────────────────────────────────────────────
export async function runScraper(
  options: ScrapeOptions = {}
): Promise<{ runId: number; found: number; violations: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const triggeredBy = options.triggeredBy ?? "scheduled";
  console.log(`[Scraper v2] Iniciando... triggeredBy=${triggeredBy}, clienteId=${options.clienteId ?? "todos"}`);

  // Criar registro de execução
  const [runResult] = await db.insert(monitoringRuns).values({
    status: "running",
    triggeredBy,
    clienteId: options.clienteId ?? null,
    plataforma: "mercadolivre",
  });
  const runId = (runResult as any).insertId as number;

  let totalFound = 0;
  let totalViolations = 0;
  const seenItemIds = new Set<string>();

  try {
    // Carregar catálogo ativo
    const catalog = await db
      .select({ id: products.id, codigo: products.codigo, descricao: products.descricao, ean: products.ean, precoMinimo: products.precoMinimo })
      .from(products)
      .where(eq(products.ativo, true));

    if (catalog.length === 0) throw new Error("Catálogo vazio");

    // Carregar clientes ativos
    const clientesList = options.clienteId
      ? await db.select().from(clientes).where(and(eq(clientes.id, options.clienteId), eq(clientes.status, "ativo")))
      : await db.select().from(clientes).where(eq(clientes.status, "ativo"));

    // ── FASE 1: Busca cirúrgica por seller_id ─────────────────────────────────
    for (const cliente of clientesList) {
      console.log(`[Scraper v2] Buscando anúncios de ${cliente.nome} (seller_id: ${cliente.sellerId})`);
      let clienteFound = 0;
      let clienteViolations = 0;

      for (let offset = 0; offset < 200; offset += 50) {
        const url = `${ML_API}/sites/MLB/search?seller_id=${cliente.sellerId}&q=ASX&limit=50&offset=${offset}`;
        const data = await mlGet<{ results: MLSearchResult[]; paging: { total: number } }>(url);
        if (!data || data.results.length === 0) break;

        for (const item of data.results) {
          if (seenItemIds.has(item.id)) continue;
          seenItemIds.add(item.id);

          const detail = await mlGet<MLItemDetail>(`${ML_API}/items/${item.id}`);
          const attrs = detail?.attributes ?? [];

          const matchResult = matchProduct(item.title, attrs, catalog);
          if (!matchResult || matchResult.confianca < 50) continue;

          clienteFound++;
          totalFound++;
          const isViolation = item.price < matchResult.precoMinimo;
          if (isViolation) { clienteViolations++; totalViolations++; }

          await db.insert(priceSnapshots).values({
            runId, productId: matchResult.productId,
            sellerName: item.seller.nickname, sellerId: String(item.seller.id),
            clienteId: cliente.id, mlItemId: item.id, mlTitle: item.title,
            mlUrl: item.permalink, mlThumbnail: item.thumbnail, plataforma: "mercadolivre",
            precoAnunciado: String(item.price), precoMinimo: String(matchResult.precoMinimo),
            isViolation,
            validationReason: isViolation ? `Preço R$${item.price} abaixo do mínimo R$${matchResult.precoMinimo}` : "OK",
            confianca: matchResult.confianca, metodoMatch: matchResult.metodoMatch,
          });

          if (isViolation) {
            const diferenca = matchResult.precoMinimo - item.price;
            const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
            await db.insert(violations).values({
              snapshotId: 0, runId, productId: matchResult.productId,
              sellerName: item.seller.nickname, sellerId: String(item.seller.id),
              clienteId: cliente.id, mlItemId: item.id, mlUrl: item.permalink,
              mlThumbnail: item.thumbnail, mlTitle: item.title, plataforma: "mercadolivre",
              precoAnunciado: String(item.price), precoMinimo: String(matchResult.precoMinimo),
              diferenca: String(diferenca.toFixed(2)), percentAbaixo: String(percentAbaixo.toFixed(2)),
              confianca: matchResult.confianca, metodoMatch: matchResult.metodoMatch, status: "open",
            });
          }

          // Histórico de preços
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await db.insert(historicoPrecosTable).values({
            codigoAsx: matchResult.codigo, plataforma: "mercadolivre",
            vendedor: item.seller.nickname, itemId: item.id,
            preco: String(item.price), dataCaptura: today,
          }).onDuplicateKeyUpdate({ set: { preco: String(item.price) } }).catch(() => {});

          // Ranking de vendedores
          await db.execute(
            sql`INSERT INTO vendedores (plataforma, vendedor_id, nome, cliente_id, total_violacoes, total_anuncios)
                VALUES ('mercadolivre', ${String(item.seller.id)}, ${item.seller.nickname}, ${cliente.id}, ${isViolation ? 1 : 0}, 1)
                ON DUPLICATE KEY UPDATE
                  total_anuncios = total_anuncios + 1,
                  total_violacoes = total_violacoes + ${isViolation ? 1 : 0},
                  ultima_vez = NOW()`
          );
        }

        if (data.results.length < 50) break;
      }

      await db.update(clientes)
        .set({ totalProdutos: clienteFound, totalViolacoes: clienteViolations, ultimaVerificacao: new Date() })
        .where(eq(clientes.id, cliente.id));
    }

    // ── FASE 2: Busca geral (vendedores não cadastrados) ──────────────────────
    if (!options.clienteId) {
      const topProducts = catalog.slice(0, 20);
      for (const prod of topProducts) {
        const queries = [prod.codigo];
        if (prod.ean) queries.push(prod.ean);

        for (const q of queries) {
          const url = `${ML_API}/sites/MLB/search?q=${encodeURIComponent(q)}&limit=10`;
          const data = await mlGet<{ results: MLSearchResult[] }>(url);
          if (!data) continue;

          for (const item of data.results) {
            if (seenItemIds.has(item.id)) continue;
            seenItemIds.add(item.id);

            const detail = await mlGet<MLItemDetail>(`${ML_API}/items/${item.id}`);
            const attrs = detail?.attributes ?? [];
            const matchResult = matchProduct(item.title, attrs, catalog);
            if (!matchResult || matchResult.confianca < 70) continue;

            totalFound++;
            const isViolation = item.price < matchResult.precoMinimo;
            if (isViolation) totalViolations++;

            await db.insert(priceSnapshots).values({
              runId, productId: matchResult.productId,
              sellerName: item.seller.nickname, sellerId: String(item.seller.id),
              clienteId: null, mlItemId: item.id, mlTitle: item.title,
              mlUrl: item.permalink, mlThumbnail: item.thumbnail, plataforma: "mercadolivre",
              precoAnunciado: String(item.price), precoMinimo: String(matchResult.precoMinimo),
              isViolation,
              validationReason: isViolation
                ? `Vendedor não cadastrado — Preço R$${item.price} abaixo do mínimo R$${matchResult.precoMinimo}`
                : "OK",
              confianca: matchResult.confianca, metodoMatch: matchResult.metodoMatch,
            });

            if (isViolation) {
              const diferenca = matchResult.precoMinimo - item.price;
              const percentAbaixo = (diferenca / matchResult.precoMinimo) * 100;
              await db.insert(violations).values({
                snapshotId: 0, runId, productId: matchResult.productId,
                sellerName: item.seller.nickname, sellerId: String(item.seller.id),
                clienteId: null, mlItemId: item.id, mlUrl: item.permalink,
                mlThumbnail: item.thumbnail, mlTitle: item.title, plataforma: "mercadolivre",
                precoAnunciado: String(item.price), precoMinimo: String(matchResult.precoMinimo),
                diferenca: String(diferenca.toFixed(2)), percentAbaixo: String(percentAbaixo.toFixed(2)),
                confianca: matchResult.confianca, metodoMatch: matchResult.metodoMatch, status: "open",
              });
            }
          }
        }
      }
    }

    // Finalizar execução
    await db.update(monitoringRuns).set({
      status: "completed", finishedAt: new Date(),
      totalProducts: catalog.length, productsFound: totalFound, violationsFound: totalViolations,
    }).where(eq(monitoringRuns.id, runId));

    console.log(`[Scraper v2] Concluído. Encontrados: ${totalFound}, Violações: ${totalViolations}`);

    if (totalViolations > 0) {
      await notifyOwner({
        title: `⚠️ ASX Monitor: ${totalViolations} violação(ões) detectada(s)`,
        content: `Monitoramento concluído. ${totalFound} anúncios encontrados, ${totalViolations} violações de preço mínimo detectadas.`,
      }).catch(() => {});
    }

    return { runId, found: totalFound, violations: totalViolations };
  } catch (err: any) {
    await db.update(monitoringRuns).set({
      status: "failed", finishedAt: new Date(), errorMessage: err.message,
    }).where(eq(monitoringRuns.id, runId));
    throw err;
  }
}

// ─── Compatibilidade com código legado ───────────────────────────────────────
export async function runMonitoring(triggeredBy: "scheduled" | "manual" = "scheduled") {
  const result = await runScraper({ triggeredBy });
  return { success: true, productsFound: result.found, violationsFound: result.violations, runId: result.runId };
}

// ─── Agendador (cron diário às 14h) ──────────────────────────────────────────
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

export function startScheduler() {
  scheduleNext();
  console.log("[Scheduler v2] Agendador iniciado — execução diária às 14:00");
}

function scheduleNext() {
  const now = new Date();
  const next = new Date();
  next.setHours(14, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next.getTime() - now.getTime();
  console.log(`[Scheduler v2] Próxima execução em ${Math.round(msUntil / 60000)} minutos`);
  schedulerTimer = setTimeout(async () => {
    try {
      await runScraper({ triggeredBy: "scheduled" });
    } catch (e) {
      console.error("[Scheduler v2] Erro na execução agendada:", e);
    }
    scheduleNext();
  }, msUntil);
}

export function stopScheduler() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
}
