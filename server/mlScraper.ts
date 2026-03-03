import axios from "axios";
import {
  getActiveProducts,
  getAllSettings,
  createMonitoringRun,
  updateMonitoringRun,
  insertPriceSnapshot,
  insertViolation,
  getAlertConfigs,
} from "./db";
import { notifyOwner } from "./_core/notification";

interface MLSearchResult {
  id: string;
  title: string;
  price: number;
  permalink: string;
  thumbnail: string;
  seller: { id: number; nickname: string };
}

interface MLSearchResponse {
  results: MLSearchResult[];
}

const CONNECTOR_PATTERNS = [
  "H1","H3","H4","H7","H8","H9","H11","H13","H15","H16","H27",
  "HB3","HB4","T10","T5","P21W","P21/5W","T15","W16W",
];

function extractKeywords(descricao: string): string[] {
  const upper = descricao.toUpperCase();
  const found: string[] = [];
  for (const p of CONNECTOR_PATTERNS) {
    if (upper.includes(p)) found.push(p);
  }
  if (upper.includes("ULTRA LED")) found.unshift("ULTRA LED");
  else if (upper.includes("SUPER LED")) found.unshift("SUPER LED");
  else if (upper.includes("WORKLIGHT")) found.unshift("WORKLIGHT");
  else if (upper.includes("GIROLED")) found.unshift("GIROLED");
  else if (upper.includes("LUMINARIA")) found.unshift("LUMINARIA");
  return Array.from(new Set(found)).slice(0, 3);
}

function validateProduct(
  item: MLSearchResult,
  codigo: string,
  descricao: string,
  minMatch: number
): { valid: boolean; reason: string } {
  const title = item.title.toUpperCase();
  if (title.includes(codigo.toUpperCase())) return { valid: true, reason: "Código ASX no título" };
  if (title.includes("ASX")) {
    const kws = extractKeywords(descricao);
    const matches = kws.filter((k) => title.includes(k)).length;
    if (matches >= minMatch) return { valid: true, reason: `ASX + ${matches} keywords` };
  }
  return { valid: false, reason: "Não validado" };
}

async function searchML(query: string, limit: number): Promise<MLSearchResult[]> {
  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const { data } = await axios.get<MLSearchResponse>(url, { timeout: 10000 });
    return data.results ?? [];
  } catch {
    return [];
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runMonitoring(triggeredBy: "scheduled" | "manual" = "scheduled") {
  console.log(`[MLScraper] Starting monitoring run (${triggeredBy})`);

  // Load settings
  const settingsArr = await getAllSettings();
  const settings = Object.fromEntries(settingsArr.map((s) => [s.key, s.value]));
  const minMatch = parseInt(settings["ml_keywords_min_match"] ?? "2");
  const searchLimit = parseInt(settings["ml_search_limit"] ?? "50");

  // Create run record
  const runInsert = await createMonitoringRun({ triggeredBy, status: "running" });
  const runId = (runInsert as any)?.insertId ?? Date.now();

  const activeProducts = await getActiveProducts();
  let productsFound = 0;
  let violationsFound = 0;

  try {
    for (const product of activeProducts) {
      const keywords = extractKeywords(product.descricao);
      if (!keywords.length) continue;

      const searchQuery = `${keywords[0]} ASX`;
      const results = await searchML(searchQuery, searchLimit);

      for (const item of results) {
        const { valid, reason } = validateProduct(item, product.codigo, product.descricao, minMatch);
        if (!valid) continue;

        productsFound++;
        const precoMinimo = parseFloat(String(product.precoMinimo));
        const precoAnunciado = item.price;
        const isViolation = precoAnunciado < precoMinimo;

        // Insert snapshot
        await insertPriceSnapshot({
          runId,
          productId: product.id,
          sellerName: item.seller.nickname,
          sellerId: String(item.seller.id),
          mlItemId: item.id,
          mlTitle: item.title,
          mlUrl: item.permalink,
          mlThumbnail: item.thumbnail,
          precoAnunciado: String(precoAnunciado),
          precoMinimo: String(precoMinimo),
          isViolation,
          validationReason: reason,
        });

        if (isViolation) {
          violationsFound++;
          const diferenca = precoMinimo - precoAnunciado;
          const percentAbaixo = (diferenca / precoMinimo) * 100;
          await insertViolation({
            snapshotId: 0,
            runId,
            productId: product.id,
            sellerName: item.seller.nickname,
            sellerId: String(item.seller.id),
            mlItemId: item.id,
            mlUrl: item.permalink,
            mlThumbnail: item.thumbnail,
            mlTitle: item.title,
            precoAnunciado: String(precoAnunciado),
            precoMinimo: String(precoMinimo),
            diferenca: String(diferenca.toFixed(2)),
            percentAbaixo: String(percentAbaixo.toFixed(2)),
            status: "open",
          });
          console.log(`[MLScraper] VIOLATION: ${item.seller.nickname} selling ${product.codigo} at R$${precoAnunciado} (min: R$${precoMinimo})`);
        }
      }

      await sleep(800); // rate limiting
    }

    // Complete run
    await updateMonitoringRun(runId, {
      status: "completed",
      finishedAt: new Date(),
      totalProducts: activeProducts.length,
      productsFound,
      violationsFound,
    });

    // Send notification if violations found
    if (violationsFound > 0) {
      const alertCfgs = await getAlertConfigs();
      const activeAlerts = alertCfgs.filter((a) => a.active && a.notifyOnViolation);
      if (activeAlerts.length > 0) {
        await notifyOwner({
          title: `⚠️ ASX Price Monitor: ${violationsFound} violação(ões) detectada(s)`,
          content: `O monitoramento de ${new Date().toLocaleDateString("pt-BR")} detectou **${violationsFound} violações** de preço mínimo em ${productsFound} anúncios encontrados.\n\nAcesse o dashboard para ver os detalhes.`,
        });
      }
    }

    console.log(`[MLScraper] Run complete. Found: ${productsFound}, Violations: ${violationsFound}`);
    return { success: true, productsFound, violationsFound, runId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateMonitoringRun(runId, { status: "failed", finishedAt: new Date(), errorMessage: msg });
    console.error(`[MLScraper] Run failed:`, error);
    return { success: false, error: msg, runId };
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  if (schedulerInterval) return;
  console.log("[MLScraper] Scheduler started - will run daily at 14:00");

  schedulerInterval = setInterval(async () => {
    const now = new Date();
    const settings = await getAllSettings();
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const targetHour = parseInt(settingsMap["scraper_hora"] ?? "14");
    const scraperAtivo = settingsMap["scraper_ativo"] !== "false";

    if (scraperAtivo && now.getHours() === targetHour && now.getMinutes() === 0) {
      console.log("[MLScraper] Scheduled run triggered");
      await runMonitoring("scheduled");
    }
  }, 60 * 1000); // check every minute
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
