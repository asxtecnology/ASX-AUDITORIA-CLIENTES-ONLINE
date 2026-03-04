import { and, count, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(_client);
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
  updateSet.updatedAt = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: updateSet,
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(opts?: { search?: string; ativo?: boolean; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions = [];
  if (opts?.search) {
    conditions.push(or(like(products.descricao, `%${opts.search}%`), like(products.codigo, `%${opts.search}%`)));
  }
  if (opts?.ativo !== undefined) conditions.push(eq(products.ativo, opts.ativo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select().from(products).where(where).orderBy(products.codigo).limit(opts?.limit ?? 50).offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(products).where(where),
  ]);
  return { items, total: totalRows[0]?.count ?? 0 };
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
  await db.insert(products).values(product).onConflictDoUpdate({
    target: products.codigo,
    set: {
      descricao: product.descricao,
      ean: product.ean,
      precoCusto: product.precoCusto,
      precoMinimo: product.precoMinimo,
      margemPercent: product.margemPercent,
      statusBase: product.statusBase,
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

// ─── Monitoring Runs ──────────────────────────────────────────────────────────
export async function createMonitoringRun(data: InsertMonitoringRun) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(monitoringRuns).values(data).returning({ id: monitoringRuns.id });
  return result[0] ?? null;
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
  if (opts?.dateFrom) conditions.push(gte(violations.detectedAt, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(violations.detectedAt, opts.dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select({ v: violations, p: products })
      .from(violations)
      .leftJoin(products, eq(violations.productId, products.id))
      .where(where)
      .orderBy(desc(violations.detectedAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(violations).where(where),
  ]);
  return { items, total: totalRows[0]?.count ?? 0 };
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
  const result = { total: 0, open: 0, notified: 0, resolved: 0, todayCount: todayStats[0]?.count ?? 0 };
  for (const row of allStats) {
    result.total += row.count;
    if (row.status === "open") result.open = row.count;
    else if (row.status === "notified") result.notified = row.count;
    else if (row.status === "resolved") result.resolved = row.count;
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
    if ((countResult[0]?.count ?? 0) === 0) return [];

    const results = await db
      .select({
        date: sql<string>`DATE(${violations.detectedAt})`,
        count: count(),
      })
      .from(violations)
      .where(gte(violations.detectedAt, since))
      .groupBy(sql`DATE(${violations.detectedAt})`)
      .orderBy(sql`DATE(${violations.detectedAt})`);

    return results.map((r) => ({ date: String(r.date), count: Number(r.count) }));
  } catch (e) {
    console.error("[DB] getViolationTrend error:", e);
    return [];
  }
}

// ─── Alert Configs ────────────────────────────────────────────────────────────
export async function getAlertConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alertConfigs).orderBy(alertConfigs.id);
}

export async function upsertAlertConfig(data: InsertAlertConfig) {
  const db = await getDb();
  if (!db) return;
  if (data.id) {
    // Update existing
    await db.update(alertConfigs).set({
      name: data.name,
      email: data.email,
      active: data.active,
      notifyOnViolation: data.notifyOnViolation,
      notifyOnRunComplete: data.notifyOnRunComplete,
    }).where(eq(alertConfigs.id, data.id));
  } else {
    // Insert new
    await db.insert(alertConfigs).values(data);
  }
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
  await db.insert(appSettings).values({ key, value, description }).onConflictDoUpdate({
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

// ─── Clientes ─────────────────────────────────────────────────────────────────
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
  if (data.id) {
    await db.update(clientes).set({
      nome: data.nome,
      lojaML: data.lojaML,
      linkLoja: data.linkLoja,
      status: data.status,
      updatedAt: new Date(),
    }).where(eq(clientes.id, data.id));
  } else {
    await db.insert(clientes).values(data).onConflictDoUpdate({
      target: clientes.sellerId,
      set: { nome: data.nome, lojaML: data.lojaML, linkLoja: data.linkLoja, status: data.status, updatedAt: new Date() },
    });
  }
}

export async function deleteCliente(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clientes).where(eq(clientes.id, id));
}

// ─── Vendedores ───────────────────────────────────────────────────────────────
export async function getVendedores(opts?: { limit?: number; offset?: number; orderBy?: "total_violacoes" | "total_anuncios" }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const orderCol = opts?.orderBy === "total_anuncios" ? vendedores.totalAnuncios : vendedores.totalViolacoes;
  const [items, totalRows] = await Promise.all([
    db.select({ v: vendedores, c: clientes })
      .from(vendedores)
      .leftJoin(clientes, eq(vendedores.clienteId, clientes.id))
      .orderBy(desc(orderCol))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(vendedores),
  ]);
  return { items, total: totalRows[0]?.count ?? 0 };
}

// ─── Histórico de Preços ──────────────────────────────────────────────────────
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
  return db.select().from(historicoPrecosTable).where(where).orderBy(desc(historicoPrecosTable.createdAt)).limit(200);
}

// ─── Violações por Cliente ────────────────────────────────────────────────────
export async function getViolationsByCliente(clienteId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ v: violations, p: products })
    .from(violations)
    .leftJoin(products, eq(violations.productId, products.id))
    .where(eq(violations.clienteId, clienteId))
    .orderBy(desc(violations.detectedAt))
    .limit(limit);
}
