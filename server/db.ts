import { and, count, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import {
  AlertConfig,
  AppSetting,
  InsertAlertConfig,
  InsertAppSetting,
  InsertMonitoringRun,
  InsertPriceSnapshot,
  InsertProduct,
  InsertUser,
  InsertViolation,
  MonitoringRun,
  Product,
  alertConfigs,
  appSettings,
  monitoringRuns,
  priceSnapshots,
  products,
  users,
  violations,
  clientes,
  vendedores,
  historicoPrecosTable,
  InsertCliente,
  mlCredentials,
  MlCredential,
  InsertMlCredential,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

export async function getDb() {
  // Seleciona a URL correta: prioriza SUPABASE_URL quando DATABASE_URL for MySQL/TiDB
  const rawUrl = process.env.DATABASE_URL ?? "";
  const isMySQL = rawUrl.startsWith("mysql://") || rawUrl.includes("tidbcloud.com");
  const effectiveUrl = isMySQL
    ? (process.env.SUPABASE_URL ?? "")
    : rawUrl;

  if (!_db && effectiveUrl) {
    try {
      const dbUrl = effectiveUrl;
      if (!dbUrl || dbUrl.startsWith("mysql://")) {
        console.warn("[Database] No PostgreSQL URL available. Set SUPABASE_URL with your Supabase connection string.");
        return null;
      }
      const isSupabase = dbUrl.includes("supabase.com") || dbUrl.includes("supabase.co");
      const client = postgres(dbUrl, {
        max: 10,
        idle_timeout: 20,
        max_lifetime: 1800,
        connect_timeout: 10,
        ssl: isSupabase ? "require" : false,
      });
      _db = drizzle(client);
      console.log("[Database] Connected via postgres.js (PostgreSQL/Supabase)");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _db as any;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values)
    .onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(opts?: {
  search?: string;
  ativo?: boolean;
  categoria?: string;
  linha?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions = [];
  if (opts?.search) {
    conditions.push(or(like(products.descricao, `%${opts.search}%`), like(products.codigo, `%${opts.search}%`)));
  }
  if (opts?.ativo !== undefined) conditions.push(eq(products.ativo, opts.ativo));
  if (opts?.categoria) conditions.push(eq(products.categoria, opts.categoria));
  if (opts?.linha) conditions.push(eq(products.linha, opts.linha));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select().from(products).where(where).orderBy(products.codigo).limit(opts?.limit ?? 50).offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(products).where(where),
  ]);
  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function getProductByCodigo(codigo: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.codigo, codigo)).limit(1);
  return result[0];
}

export async function upsertProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) return;
  await db.insert(products).values(product)
    .onConflictDoUpdate({
      target: products.codigo,
      set: {
        descricao: product.descricao,
        ean: product.ean,
        categoria: product.categoria,
        linha: product.linha,
        ativo: product.ativo,
        precoCusto: product.precoCusto,
        precoMinimo: product.precoMinimo,
        margemPercent: product.margemPercent,
        updatedAt: new Date(),
      },
    });
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function toggleProductActive(id: number, ativo: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set({ ativo, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function getActiveProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.ativo, true)).orderBy(products.codigo);
}

// ─── Recalcular precoMinimo de TODOS os produtos com nova margem ──────────────
// precoMinimo = precoCusto * (1 + margem / 100)
export async function recalculateAllProductPrices(margemPercent: number) {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const multiplier = 1 + margemPercent / 100;
  // PostgreSQL: usa NUMERIC cast e NOW()
  await db.execute(
    sql`UPDATE products
        SET preco_minimo   = ROUND(CAST(preco_custo AS NUMERIC(10,2)) * ${multiplier}, 2),
            margem_percent = ${String(margemPercent)},
            "updatedAt"    = NOW()`
  );
  const result = await db.select({ count: count() }).from(products);
  return { updated: Number(result[0]?.count ?? 0) };
}

// ─── Monitoring Runs ──────────────────────────────────────────────────────────
export async function createMonitoringRun(data: InsertMonitoringRun) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(monitoringRuns).values(data).returning({ id: monitoringRuns.id });
  return result[0] ? { id: result[0].id } : null;
}

export async function updateMonitoringRun(id: number, data: Partial<MonitoringRun>) {
  const db = await getDb();
  if (!db) return;
  await db.update(monitoringRuns).set(data).where(eq(monitoringRuns.id, id));
}

export async function getMonitoringRuns(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monitoringRuns).orderBy(desc(monitoringRuns.startedAt)).limit(limit);
}

export async function getLatestMonitoringRun() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(monitoringRuns).orderBy(desc(monitoringRuns.startedAt)).limit(1);
  return result[0] ?? null;
}

// ─── Price Snapshots ──────────────────────────────────────────────────────────
export async function insertPriceSnapshot(data: InsertPriceSnapshot) {
  const db = await getDb();
  if (!db) return;
  await db.insert(priceSnapshots).values(data);
}

export async function getSnapshotsByProduct(productId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db.select().from(priceSnapshots)
    .where(and(eq(priceSnapshots.productId, productId), gte(priceSnapshots.capturedAt, since)))
    .orderBy(desc(priceSnapshots.capturedAt));
}

// ─── Violations ───────────────────────────────────────────────────────────────
export async function insertViolation(data: InsertViolation) {
  const db = await getDb();
  if (!db) return;
  await db.insert(violations).values(data);
}

export async function getViolations(opts?: {
  status?: "open" | "notified" | "resolved";
  productId?: number;
  sellerId?: string;
  clienteId?: number;
  categoria?: string;
  confiancaMin?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions = [];
  if (opts?.status) conditions.push(eq(violations.status, opts.status));
  if (opts?.productId) conditions.push(eq(violations.productId, opts.productId));
  if (opts?.sellerId) conditions.push(eq(violations.sellerId, opts.sellerId));
  if (opts?.clienteId) conditions.push(eq(violations.clienteId, opts.clienteId));
  if (opts?.confiancaMin !== undefined) conditions.push(gte(violations.confianca, opts.confiancaMin));
  if (opts?.dateFrom) conditions.push(gte(violations.detectedAt, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(violations.detectedAt, opts.dateTo));
  if (opts?.categoria) conditions.push(eq(products.categoria, opts.categoria));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select({ v: violations, p: products })
      .from(violations)
      .leftJoin(products, eq(violations.productId, products.id))
      .where(where)
      .orderBy(desc(violations.detectedAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0),
    db
      .select({ count: count() })
      .from(violations)
      .leftJoin(products, eq(violations.productId, products.id))
      .where(where),
  ]);
  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getViolationStats() {
  const db = await getDb();
  if (!db) return { total: 0, open: 0, notified: 0, resolved: 0, todayCount: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [allStats, todayStats] = await Promise.all([
    db.select({ status: violations.status, count: count() }).from(violations).groupBy(violations.status),
    db.select({ count: count() }).from(violations).where(gte(violations.detectedAt, today)),
  ]);
  const result = { total: 0, open: 0, notified: 0, resolved: 0, todayCount: Number(todayStats[0]?.count ?? 0) };
  for (const row of allStats) {
    const n = Number(row.count);
    result.total += n;
    if (row.status === "open") result.open = n;
    else if (row.status === "notified") result.notified = n;
    else if (row.status === "resolved") result.resolved = n;
  }
  return result;
}

export async function updateViolationStatus(id: number, status: "open" | "notified" | "resolved") {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = { status };
  if (status === "notified") update.notifiedAt = new Date();
  if (status === "resolved") update.resolvedAt = new Date();
  await db.update(violations).set(update).where(eq(violations.id, id));
}

export async function getViolationTrend(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  try {
    const countResult = await db.select({ count: count() }).from(violations);
    if (Number(countResult[0]?.count ?? 0) === 0) return [];
    // PostgreSQL: DATE() funciona igual ao MySQL
    const rows = await db.execute(
      sql`SELECT DATE(detected_at) as date, COUNT(*) as cnt
          FROM violations
          WHERE detected_at >= ${since}
          GROUP BY DATE(detected_at)
          ORDER BY DATE(detected_at)`
    );
    const results: any[] = Array.isArray(rows) ? rows as any[] : [];
    return results.map((r: any) => ({
      date: String(r.date),
      count: Number(r.cnt),
    }));
  } catch (e) {
    console.error("[DB] getViolationTrend error:", e);
    return [];
  }
}

// ─── Violation Trend por Slot (10h e 16h) ────────────────────────────────────
export async function getViolationTrendBySlot(days = 30) {
  const db = await getDb();
  if (!db) return { slot10: [], slot16: [] };
  const since = new Date();
  since.setDate(since.getDate() - days);
  try {
    const rows = await db.execute(
      sql`SELECT DATE(v.detected_at) as date,
                 mr.slot_hour,
                 COUNT(*) as cnt
          FROM violations v
          LEFT JOIN monitoring_runs mr ON mr.id = v.run_id
          WHERE v.detected_at >= ${since}
          GROUP BY DATE(v.detected_at), mr.slot_hour
          ORDER BY DATE(v.detected_at)`
    );
    const results: any[] = Array.isArray(rows) ? rows as any[] : [];
    const slot10: { date: string; count: number }[] = [];
    const slot16: { date: string; count: number }[] = [];
    for (const r of results) {
      const entry = { date: String(r.date), count: Number(r.cnt) };
      if (Number(r.slot_hour) === 10) slot10.push(entry);
      else if (Number(r.slot_hour) === 16) slot16.push(entry);
    }
    return { slot10, slot16 };
  } catch (e) {
    console.error("[DB] getViolationTrendBySlot error:", e);
    return { slot10: [], slot16: [] };
  }
}

// ─── Alert Configs ────────────────────────────────────────────────────────────
export async function getAlertConfigs(): Promise<AlertConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alertConfigs).orderBy(alertConfigs.id);
}

export async function upsertAlertConfig(data: InsertAlertConfig) {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertConfigs).values(data)
    .onConflictDoUpdate({
      target: alertConfigs.email,
      set: { name: data.name, active: data.active, notifyOnViolation: data.notifyOnViolation, notifyOnRunComplete: data.notifyOnRunComplete },
    });
}

export async function deleteAlertConfig(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(alertConfigs).where(eq(alertConfigs.id, id));
}

// ─── App Settings ─────────────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return result[0]?.value;
}

export async function getAllSettings(): Promise<AppSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appSettings).orderBy(appSettings.key);
}

export async function upsertSetting(key: string, value: string, description?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value, description })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function initDefaultSettings() {
  const defaults: InsertAppSetting[] = [
    { key: "margem_percent", value: "60", description: "Margem mínima de preço (%)" },
    { key: "scraper_hora", value: "14", description: "Hora de execução do scraper (0-23)" },
    { key: "scraper_ativo", value: "true", description: "Scraper automático ativo" },
    { key: "ml_keywords_min_match", value: "2", description: "Mínimo de keywords para validar produto" },
    { key: "ml_search_limit", value: "50", description: "Limite de resultados por busca no ML" },
    { key: "alert_email_ativo", value: "true", description: "Alertas por email ativos" },
  ];
  for (const s of defaults) {
    const existing = await getSetting(s.key);
    if (!existing) await upsertSetting(s.key, s.value, s.description ?? undefined);
  }
}

// ─── v2: Clientes ─────────────────────────────────────────────────────────────
export async function getClientes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientes).orderBy(clientes.nome);
}

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result[0];
}

export async function upsertCliente(data: InsertCliente) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clientes).values(data)
    .onConflictDoUpdate({
      target: clientes.sellerId,
      set: {
        nome: data.nome,
        lojaML: data.lojaML,
        linkLoja: data.linkLoja,
        status: data.status,
        updatedAt: new Date(),
      },
    });
}

export async function deleteCliente(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clientes).where(eq(clientes.id, id));
}

// ─── v2: Vendedores ───────────────────────────────────────────────────────────
export async function getVendedores(opts?: { limit?: number; offset?: number; orderBy?: "totalViolacoes" | "totalAnuncios" }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const orderCol = opts?.orderBy === "totalAnuncios" ? vendedores.totalAnuncios : vendedores.totalViolacoes;
  const [items, totalRows] = await Promise.all([
    db.select({ v: vendedores, c: clientes })
      .from(vendedores)
      .leftJoin(clientes, eq(vendedores.clienteId, clientes.id))
      .orderBy(desc(orderCol))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(vendedores),
  ]);
  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getViolationsByCliente(clienteId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const cliente = await getClienteById(clienteId);
  if (!cliente) return [];
  return db.select({ v: violations, p: products })
    .from(violations)
    .leftJoin(products, eq(violations.productId, products.id))
    .where(eq(violations.sellerId, cliente.sellerId))
    .orderBy(desc(violations.detectedAt))
    .limit(limit);
}

// ─── v2: Histórico de Preços ──────────────────────────────────────────────────
export async function getHistoricoPrecos(opts?: { codigoAsx?: string; vendedor?: string; days?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.codigoAsx) conditions.push(eq(historicoPrecosTable.codigoAsx, opts.codigoAsx));
  if (opts?.vendedor) conditions.push(like(historicoPrecosTable.vendedor, `%${opts.vendedor}%`));
  if (opts?.days) {
    const since = new Date();
    since.setDate(since.getDate() - opts.days);
    conditions.push(gte(historicoPrecosTable.createdAt, since));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(historicoPrecosTable).where(where).orderBy(desc(historicoPrecosTable.dataCaptura)).limit(500);
}

// ─── Mercado Livre OAuth Credentials ─────────────────────────────────────────
export async function getMlCredentials(): Promise<MlCredential | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mlCredentials).limit(1);
  return rows[0] ?? null;
}

export async function saveMlCredentials(
  data: Pick<InsertMlCredential, "appId" | "clientSecret" | "siteId" | "redirectUri">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getMlCredentials();
  if (existing) {
    await db.update(mlCredentials)
      .set({
        appId: data.appId,
        clientSecret: data.clientSecret,
        siteId: data.siteId ?? "MLB",
        redirectUri: data.redirectUri ?? null,
        status: "pending",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(mlCredentials.id, existing.id));
  } else {
    await db.insert(mlCredentials).values({
      appId: data.appId,
      clientSecret: data.clientSecret,
      siteId: data.siteId ?? "MLB",
      redirectUri: data.redirectUri ?? null,
      status: "pending",
    });
  }
}

export async function updateMlTokens(
  data: Partial<Pick<MlCredential, "accessToken" | "refreshToken" | "tokenType" | "expiresAt" | "scope" | "mlUserId" | "mlNickname" | "mlEmail" | "status" | "lastError">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getMlCredentials();
  if (!existing) return;
  await db.update(mlCredentials)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mlCredentials.id, existing.id));
}

export async function deleteMlCredentials(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mlCredentials);
}
