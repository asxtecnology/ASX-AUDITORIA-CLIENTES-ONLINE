/**
 * ingestionProcessor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camada B — Normalização + Regras
 *
 * Responsável por:
 *  1. Receber lotes de anúncios coletados por agentes externos (extensão/collector)
 *  2. Fazer matching com o catálogo ASX
 *  3. Calcular violações de preço mínimo
 *  4. Persistir snapshots e violações no banco
 *  5. Atualizar o ml_ingestion_run com status e contadores
 *
 * NÃO faz scraping. NÃO acessa o Mercado Livre diretamente.
 */

import { getDb } from "./db";
import { matchProduct } from "./mlScraper";
import {
  mlIngestionRuns,
  mlListingSnapshots,
  violations,
  priceSnapshots,
  monitoringRuns,
  products,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncomingListing {
  mlItemId: string;
  mlTitle: string;
  mlUrl: string;
  mlThumbnail?: string;
  screenshotUrl?: string; // evidência obrigatória (recomendada)
  price: number;
  originalPrice?: number;
  currency?: string;
  sellerId?: string;
  sellerNickname?: string;
}

export interface IngestPayload {
  source: "browser_extension" | "collector_agent" | "manual";
  sourceVersion?: string;
  clienteId?: number;
  sellerNickname?: string;
  sellerId?: string;
  listings: IncomingListing[];
  apiKey: string; // autenticação
}

export interface IngestResult {
  runId: number;
  accepted: number;
  processed: number;
  violations: number;
  skipped: number;
  errors: string[];
}

// ─── API Key validation ───────────────────────────────────────────────────────

const VALID_API_KEYS = new Set([
  process.env.INGEST_API_KEY || "asx-ingest-2026",
]);

export function validateApiKey(key: string): boolean {
  return VALID_API_KEYS.has(key);
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processIngestion(payload: IngestPayload): Promise<IngestResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const errors: string[] = [];
  let violationsCount = 0;
  let processedCount = 0;
  let skippedCount = 0;

  // 1. Criar ingestion run
  const [run] = await db
    .insert(mlIngestionRuns)
    .values({
      source: payload.source,
      sourceVersion: payload.sourceVersion,
      clienteId: payload.clienteId,
      sellerNickname: payload.sellerNickname,
      sellerId: payload.sellerId,
      totalListings: payload.listings.length,
      status: "processing",
      apiKeyUsed: payload.apiKey.slice(0, 8) + "...", // hash parcial
    })
    .returning();

  const runId = run.id;

  // 2. Criar monitoring_run correspondente (para aparecer no histórico)
  const [monRun] = await db
    .insert(monitoringRuns)
    .values({
      status: "running",
      triggeredBy: payload.source === "manual" ? "manual" : "scheduled",
      totalFound: 0,
      totalViolations: 0,
    })
    .returning();

  const monRunId = monRun.id;

  try {
    // 3. Buscar catálogo ativo
    const catalog = await db
      .select()
      .from(products)
      .where(eq(products.ativo, true));

    if (catalog.length === 0) {
      throw new Error("Catálogo vazio — nenhum produto ativo encontrado");
    }

    // 4. Processar cada anúncio
    for (const listing of payload.listings) {
      try {
        // Validação mínima
        if (!listing.mlItemId || !listing.mlTitle || listing.price <= 0) {
          skippedCount++;
          errors.push(`Anúncio inválido: ${listing.mlItemId || "sem ID"}`);
          continue;
        }

        // Matching com catálogo
        const match = matchProduct(listing.mlTitle, catalog);

        if (!match) {
          skippedCount++;
          // Salvar snapshot sem match para auditoria
          await db.insert(mlListingSnapshots).values({
            ingestionRunId: runId,
            clienteId: payload.clienteId,
            sellerId: listing.sellerId || payload.sellerId,
            sellerNickname: listing.sellerNickname || payload.sellerNickname,
            mlItemId: listing.mlItemId,
            mlTitle: listing.mlTitle,
            mlUrl: listing.mlUrl,
            mlThumbnail: listing.mlThumbnail,
            screenshotUrl: listing.screenshotUrl,
            price: String(listing.price),
            originalPrice: listing.originalPrice ? String(listing.originalPrice) : null,
            currency: listing.currency || "BRL",
            matchConfidence: 0,
            isViolation: false,
          }).catch(() => {});
          continue;
        }

        // MatchResult fields: productId, codigo, descricao, precoMinimo, confianca, metodoMatch
        const confidence = match.confianca;
        const method = match.metodoMatch;
        const precoMinimo = match.precoMinimo;
        const isViolation = listing.price < precoMinimo;
        const diferenca = precoMinimo - listing.price;
        const percentAbaixo = (diferenca / precoMinimo) * 100;

        // Salvar ml_listing_snapshot
        const [snapshot] = await db.insert(mlListingSnapshots).values({
          ingestionRunId: runId,
          clienteId: payload.clienteId,
          sellerId: listing.sellerId || payload.sellerId,
          sellerNickname: listing.sellerNickname || payload.sellerNickname,
          mlItemId: listing.mlItemId,
          mlTitle: listing.mlTitle,
          mlUrl: listing.mlUrl,
          mlThumbnail: listing.mlThumbnail,
          screenshotUrl: listing.screenshotUrl,
          price: String(listing.price),
          originalPrice: listing.originalPrice ? String(listing.originalPrice) : null,
          currency: listing.currency || "BRL",
          matchedProductId: match.productId,
          matchedProductCode: match.codigo,
          matchConfidence: confidence,
          matchMethod: method,
          precoMinimo: String(precoMinimo),
          isViolation,
          processedAt: new Date(),
        }).returning();

        // Salvar price_snapshot (compatibilidade com sistema legado)
        const [priceSnap] = await db.insert(priceSnapshots).values({
          runId: monRunId,
          productId: match.productId,
          sellerName: listing.sellerNickname || payload.sellerNickname || "Desconhecido",
          sellerId: listing.sellerId || payload.sellerId,
          clienteId: payload.clienteId,
          mlItemId: listing.mlItemId,
          mlTitle: listing.mlTitle,
          mlUrl: listing.mlUrl,
          mlThumbnail: listing.mlThumbnail,
          precoAnunciado: String(listing.price),
          precoMinimo: String(precoMinimo),
          isViolation,
          confianca: confidence,
          metodoMatch: method,
          validationReason: isViolation
            ? `Preço R$${listing.price.toFixed(2)} abaixo do mínimo R$${precoMinimo.toFixed(2)}`
            : "OK",
        }).returning();

        // Se for violação, criar registro em violations
        if (isViolation) {
          const [violation] = await db.insert(violations).values({
            snapshotId: priceSnap.id,
            runId: monRunId,
            productId: match.productId,
            sellerName: listing.sellerNickname || payload.sellerNickname || "Desconhecido",
            sellerId: listing.sellerId || payload.sellerId,
            clienteId: payload.clienteId,
            mlItemId: listing.mlItemId,
            mlUrl: listing.mlUrl,
            mlThumbnail: listing.mlThumbnail || listing.screenshotUrl,
            mlTitle: listing.mlTitle,
            precoAnunciado: String(listing.price),
            precoMinimo: String(precoMinimo),
            diferenca: String(diferenca.toFixed(2)),
            percentAbaixo: String(percentAbaixo.toFixed(2)),
            confianca: confidence,
            metodoMatch: method,
            status: "open",
          }).returning();

          // Atualizar snapshot com violationId
          await db
            .update(mlListingSnapshots)
            .set({ violationId: violation.id })
            .where(eq(mlListingSnapshots.id, snapshot.id))
            .catch(() => {});

          violationsCount++;
        }

        processedCount++;
      } catch (itemErr: any) {
        errors.push(`Erro no item ${listing.mlItemId}: ${itemErr.message}`);
        skippedCount++;
      }
    }

    // 5. Finalizar ingestion run
    await db.update(mlIngestionRuns).set({
      status: "completed",
      processedListings: processedCount,
      violationsFound: violationsCount,
      finishedAt: new Date(),
    }).where(eq(mlIngestionRuns.id, runId));

    // 6. Finalizar monitoring run
    await db.update(monitoringRuns).set({
      status: "completed",
      finishedAt: new Date(),
      totalFound: processedCount + skippedCount,
      totalViolations: violationsCount,
    }).where(eq(monitoringRuns.id, monRunId));

    // 7. Notificar se houver violações
    if (violationsCount > 0) {
      await notifyOwner({
        title: `⚠️ ASX Monitor: ${violationsCount} violação(ões) detectada(s)`,
        content: `Ingestão concluída via ${payload.source}. ${processedCount} anúncios processados, ${violationsCount} violações de preço mínimo detectadas.`,
      }).catch(() => {});
    }

    return {
      runId,
      accepted: payload.listings.length,
      processed: processedCount,
      violations: violationsCount,
      skipped: skippedCount,
      errors,
    };
  } catch (err: any) {
    // Marcar como falha
    await db.update(mlIngestionRuns).set({
      status: "failed",
      errorMessage: err.message,
      finishedAt: new Date(),
    }).where(eq(mlIngestionRuns.id, runId)).catch(() => {});

    await db.update(monitoringRuns).set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: err.message,
    }).where(eq(monitoringRuns.id, monRunId)).catch(() => {});

    throw err;
  }
}
