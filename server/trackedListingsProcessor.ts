/**
 * trackedListingsProcessor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Processador de Anúncios Monitorados (Tracked Listings)
 *
 * Responsável por:
 *  1. Promover anúncios da ingestão para tracked_listings (promoteNewListings)
 *  2. Processar verificações pontuais de anúncios conhecidos (processChecks)
 *  3. Gerenciar o ciclo de vida: novo → monitorado → suspeito → violador → inativo
 *  4. Gerenciar a fila de revisão para matches de baixa confiança (<80%)
 *  5. Revalidar violações abertas (revalidateViolations)
 *
 * Ciclo de vida dos status:
 *  - novo: recém-promovido da ingestão, aguarda primeira verificação
 *  - monitorado: verificado, sem violação ativa
 *  - suspeito: 1 violação detectada, aguarda confirmação
 *  - violador: 2+ violações consecutivas confirmadas
 *  - inativo: anúncio removido/indisponível ou manualmente inativado
 */

import { getDb } from "./db";
import { matchProduct } from "./mlScraper";
import {
  trackedListings,
  trackedListingChecks,
  matchReviewQueue,
  mlListingSnapshots,
  violations,
  products,
} from "../drizzle/schema";
import { eq, and, desc, lt, isNull, inArray, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListingStatus = "novo" | "monitorado" | "suspeito" | "violador" | "inativo";
export type CheckSource = "browser_extension" | "manual" | "api";
export type ViolationStatus = "ok" | "violation" | "unavailable";
export type ReviewStatus = "pending" | "approved" | "rejected" | "skipped";

export interface CheckPayload {
  /** mlItemId do anúncio a ser verificado */
  mlItemId: string;
  /** Preço observado */
  observedPrice: number;
  /** Preço original (riscado), se houver */
  observedOriginalPrice?: number;
  /** Título observado */
  observedTitle?: string;
  /** Anúncio ainda disponível? */
  observedAvailable?: boolean;
  /** URL de evidência (screenshot, link direto) */
  evidenceUrl?: string;
  screenshotUrl?: string;
  /** Fonte da verificação */
  checkSource: CheckSource;
  /** Timestamp da verificação (opcional, usa NOW() se ausente) */
  checkedAt?: Date;
}

export interface ChecksPayload {
  source: CheckSource;
  sourceVersion?: string;
  checks: CheckPayload[];
  apiKey: string;
}

export interface ChecksResult {
  accepted: number;
  processed: number;
  violations: number;
  notFound: number;
  errors: string[];
}

export interface PromoteResult {
  promoted: number;
  alreadyTracked: number;
  addedToReview: number;
  errors: string[];
}

// ─── Constantes de ciclo de vida ─────────────────────────────────────────────

const VIOLATION_THRESHOLD = 2;   // violações consecutivas para → violador
const OK_THRESHOLD = 3;          // verificações OK consecutivas para → monitorado
const LOW_CONFIDENCE_THRESHOLD = 80; // abaixo disso → fila de revisão

// ─── Utilitários ─────────────────────────────────────────────────────────────

export function validateApiKey(key: string): boolean {
  const validKey = process.env.INGEST_API_KEY || "asx-ingest-2026";
  return key === validKey;
}

/**
 * Calcula o novo status baseado no ciclo de vida
 */
function computeNewStatus(
  currentStatus: ListingStatus,
  violationStatus: ViolationStatus,
  consecutiveViolations: number,
  consecutiveOk: number
): ListingStatus {
  if (violationStatus === "unavailable") return "inativo";

  if (violationStatus === "violation") {
    if (consecutiveViolations >= VIOLATION_THRESHOLD) return "violador";
    return "suspeito";
  }

  // violationStatus === "ok"
  if (currentStatus === "violador" || currentStatus === "suspeito") {
    if (consecutiveOk >= OK_THRESHOLD) return "monitorado";
    return currentStatus; // mantém até confirmar melhora
  }

  return "monitorado";
}

// ─── Promover anúncios da ingestão para tracked_listings ─────────────────────

/**
 * Varre ml_listing_snapshots recentes e promove anúncios únicos para tracked_listings.
 * Anúncios com match_confidence < LOW_CONFIDENCE_THRESHOLD vão para match_review_queue.
 */
export async function promoteNewListings(
  options: { sinceHours?: number; limit?: number } = {}
): Promise<PromoteResult> {
  const db = await getDb();
  if (!db) return { promoted: 0, alreadyTracked: 0, addedToReview: 0, errors: ["DB unavailable"] };

  const { sinceHours = 24, limit = 500 } = options;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  let promoted = 0;
  let alreadyTracked = 0;
  let addedToReview = 0;
  const errors: string[] = [];

  try {
    // Buscar snapshots recentes não processados
    const snapshots = await db
      .select()
      .from(mlListingSnapshots)
      .where(
        and(
          sql`${mlListingSnapshots.capturedAt} >= ${since.toISOString()}`,
          isNull(mlListingSnapshots.processedAt)
        )
      )
      .limit(limit);

    for (const snap of snapshots) {
      try {
        // Verificar se já está sendo monitorado
        const existing = await db
          .select({ id: trackedListings.id })
          .from(trackedListings)
          .where(eq(trackedListings.mlItemId, snap.mlItemId))
          .limit(1);

        if (existing.length > 0) {
          alreadyTracked++;
          continue;
        }

        const confidence = snap.matchConfidence || 0;
        const needsReview = confidence < LOW_CONFIDENCE_THRESHOLD;

        // Inserir em tracked_listings
        const [tracked] = await db.insert(trackedListings).values({
          mlItemId: snap.mlItemId,
          mlUrl: snap.mlUrl,
          mlTitle: snap.mlTitle,
          mlThumbnail: snap.mlThumbnail,
          sellerId: snap.sellerId,
          sellerNickname: snap.sellerNickname,
          clienteId: snap.clienteId,
          matchedProductId: snap.matchedProductId,
          matchedProductCode: snap.matchedProductCode,
          matchConfidence: confidence,
          matchMethod: snap.matchMethod,
          listingStatus: needsReview ? "novo" : "monitorado",
          lastPrice: snap.price,
          sourceIngestionRunId: snap.ingestionRunId,
          sourceSnapshotId: snap.id,
          promotedAt: new Date(),
        }).returning();

        promoted++;

        // Se baixa confiança, adicionar à fila de revisão
        if (needsReview && tracked) {
          await db.insert(matchReviewQueue).values({
            trackedListingId: tracked.id,
            snapshotId: snap.id,
            suggestedProductId: snap.matchedProductId,
            confidence: snap.matchConfidence ? String(snap.matchConfidence) : null,
            reason: `Confiança baixa (${confidence}%) — método: ${snap.matchMethod || "desconhecido"}`,
            status: "pending",
          });
          addedToReview++;
        }
      } catch (itemErr: any) {
        errors.push(`Erro ao promover ${snap.mlItemId}: ${itemErr.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Erro geral: ${err.message}`);
  }

  return { promoted, alreadyTracked, addedToReview, errors };
}

// ─── Processar verificações pontuais ─────────────────────────────────────────

/**
 * Processa um lote de verificações de anúncios conhecidos.
 * Atualiza o status do anúncio e cria registros em tracked_listing_checks.
 */
export async function processChecks(payload: ChecksPayload): Promise<ChecksResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let processed = 0;
  let violationsCount = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const check of payload.checks) {
    try {
      // Buscar o anúncio monitorado
      const [tracked] = await db
        .select()
        .from(trackedListings)
        .where(eq(trackedListings.mlItemId, check.mlItemId))
        .limit(1);

      if (!tracked) {
        notFound++;
        // Anúncio não monitorado ainda — ignorar silenciosamente
        continue;
      }

      // Determinar violationStatus
      let violationStatus: ViolationStatus = "ok";
      let isViolation = false;

      if (check.observedAvailable === false) {
        violationStatus = "unavailable";
      } else if (tracked.matchedProductId && check.observedPrice !== undefined) {
        // Buscar preço mínimo do produto
        const [prod] = await db
          .select({ precoMinimo: products.precoMinimo })
          .from(products)
          .where(eq(products.id, tracked.matchedProductId))
          .limit(1);

        if (prod && check.observedPrice < parseFloat(String(prod.precoMinimo))) {
          violationStatus = "violation";
          isViolation = true;
          violationsCount++;
        }
      }

      // Calcular novos contadores
      const newConsecutiveViolations = violationStatus === "violation"
        ? (tracked.consecutiveViolations || 0) + 1
        : 0;
      const newConsecutiveOk = violationStatus === "ok"
        ? (tracked.consecutiveOk || 0) + 1
        : 0;

      // Calcular novo status
      const newStatus = computeNewStatus(
        tracked.listingStatus as ListingStatus,
        violationStatus,
        newConsecutiveViolations,
        newConsecutiveOk
      );

      const checkedAt = check.checkedAt || new Date();

      // Inserir check
      const [checkRecord] = await db.insert(trackedListingChecks).values({
        trackedListingId: tracked.id,
        checkSource: check.checkSource,
        observedTitle: check.observedTitle,
        observedPrice: check.observedPrice !== undefined ? String(check.observedPrice) : null,
        observedOriginalPrice: check.observedOriginalPrice !== undefined ? String(check.observedOriginalPrice) : null,
        observedAvailable: check.observedAvailable,
        evidenceUrl: check.evidenceUrl,
        screenshotUrl: check.screenshotUrl,
        checkedAt,
        violationStatus,
      }).returning();

      // Atualizar tracked_listing
      await db.update(trackedListings).set({
        listingStatus: newStatus,
        lastCheckedAt: checkedAt,
        lastPrice: check.observedPrice !== undefined ? String(check.observedPrice) : tracked.lastPrice,
        lastViolationAt: isViolation ? checkedAt : tracked.lastViolationAt,
        consecutiveViolations: newConsecutiveViolations,
        consecutiveOk: newConsecutiveOk,
        totalChecks: (tracked.totalChecks || 0) + 1,
        inactivatedAt: newStatus === "inativo" ? checkedAt : tracked.inactivatedAt,
        inactivationReason: newStatus === "inativo" ? "Anúncio indisponível" : tracked.inactivationReason,
        updatedAt: new Date(),
      }).where(eq(trackedListings.id, tracked.id));

      // Se nova violação confirmada, registrar em violations
      if (isViolation && tracked.matchedProductId) {
        const [prod] = await db
          .select()
          .from(products)
          .where(eq(products.id, tracked.matchedProductId))
          .limit(1);

        if (prod) {
          const precoMinimo = parseFloat(String(prod.precoMinimo));
          const diferenca = precoMinimo - check.observedPrice;
          const percentAbaixo = (diferenca / precoMinimo) * 100;

          await db.insert(violations).values({
            snapshotId: checkRecord.id, // usa check id como referência
            runId: 0, // sem run associado
            productId: tracked.matchedProductId,
            sellerName: tracked.sellerNickname || "Desconhecido",
            sellerId: tracked.sellerId,
            clienteId: tracked.clienteId,
            mlItemId: tracked.mlItemId,
            mlUrl: tracked.mlUrl,
            mlThumbnail: tracked.mlThumbnail,
            mlTitle: check.observedTitle || tracked.mlTitle,
            precoAnunciado: String(check.observedPrice),
            precoMinimo: String(precoMinimo),
            diferenca: String(diferenca.toFixed(2)),
            percentAbaixo: String(percentAbaixo.toFixed(2)),
            confianca: tracked.matchConfidence,
            metodoMatch: tracked.matchMethod,
            status: "open",
          });
        }
      }

      processed++;
    } catch (itemErr: any) {
      errors.push(`Erro no check ${check.mlItemId}: ${itemErr.message}`);
    }
  }

  // Notificar se houver violações
  if (violationsCount > 0) {
    await notifyOwner({
      title: `⚠️ ASX Monitor: ${violationsCount} violação(ões) em anúncios monitorados`,
      content: `${processed} verificações processadas via ${payload.source}. ${violationsCount} violações detectadas.`,
    }).catch(() => {});
  }

  return {
    accepted: payload.checks.length,
    processed,
    violations: violationsCount,
    notFound,
    errors,
  };
}

// ─── Revalidar violações abertas ─────────────────────────────────────────────

/**
 * Retorna lista de anúncios que precisam de revalidação (violadores/suspeitos sem check recente).
 * Usado pela extensão para saber quais anúncios verificar.
 */
export async function getListingsForRecheck(
  options: { limit?: number; staleSinceHours?: number } = {}
): Promise<typeof trackedListings.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  const { limit = 100, staleSinceHours = 6 } = options;
  const staleThreshold = new Date(Date.now() - staleSinceHours * 60 * 60 * 1000);

  try {
    const listings = await db
      .select()
      .from(trackedListings)
      .where(
        and(
          inArray(trackedListings.listingStatus, ["suspeito", "violador", "monitorado"]),
          sql`(${trackedListings.lastCheckedAt} IS NULL OR ${trackedListings.lastCheckedAt} < ${staleThreshold.toISOString()})`
        )
      )
      .orderBy(
        desc(trackedListings.consecutiveViolations),
        desc(trackedListings.lastViolationAt)
      )
      .limit(limit);

    return listings;
  } catch {
    return [];
  }
}

// ─── Aprovar/Rejeitar item da fila de revisão ────────────────────────────────

export async function reviewMatchQueueItem(
  itemId: number,
  decision: "approved" | "rejected" | "skipped",
  reviewedBy: string,
  notes?: string,
  correctProductId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [item] = await db
    .select()
    .from(matchReviewQueue)
    .where(eq(matchReviewQueue.id, itemId))
    .limit(1);

  if (!item) throw new Error("Item não encontrado na fila de revisão");

  // Atualizar fila
  await db.update(matchReviewQueue).set({
    status: decision,
    reviewedBy,
    reviewedAt: new Date(),
    decisionNotes: notes,
  }).where(eq(matchReviewQueue.id, itemId));

  // Se aprovado com produto correto, atualizar o tracked_listing
  if (decision === "approved" && correctProductId) {
    const [prod] = await db
      .select({ codigo: products.codigo })
      .from(products)
      .where(eq(products.id, correctProductId))
      .limit(1);

    if (prod) {
      await db.update(trackedListings).set({
        matchedProductId: correctProductId,
        matchedProductCode: prod.codigo,
        matchConfidence: 100,
        matchMethod: "manual_review",
        listingStatus: "monitorado",
        updatedAt: new Date(),
      }).where(eq(trackedListings.id, item.trackedListingId));
    }
  }

  // Se rejeitado, marcar como sem produto correspondente
  if (decision === "rejected") {
    await db.update(trackedListings).set({
      matchedProductId: null,
      matchedProductCode: null,
      matchConfidence: 0,
      listingStatus: "inativo",
      inactivationReason: "Rejeitado na revisão de match",
      inactivatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(trackedListings.id, item.trackedListingId));
  }
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

export async function getTrackedListingsStats() {
  const db = await getDb();
  if (!db) return null;

  try {
    const allListings = await db.select().from(trackedListings);
    const reviewPending = await db
      .select()
      .from(matchReviewQueue)
      .where(eq(matchReviewQueue.status, "pending"));

    const byStatus = allListings.reduce((acc: Record<string, number>, l: typeof trackedListings.$inferSelect) => {
      const s = l.listingStatus || "novo";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: allListings.length,
      byStatus,
      reviewPending: reviewPending.length,
      violadores: byStatus["violador"] || 0,
      suspeitos: byStatus["suspeito"] || 0,
      monitorados: byStatus["monitorado"] || 0,
      novos: byStatus["novo"] || 0,
      inativos: byStatus["inativo"] || 0,
    };
  } catch {
    return null;
  }
}
