import { and, count, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql, { Pool } from "mysql2/promise";
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

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<Record<string, unknown>, Pool>> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool(process.env.DATABASE_URL);
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(opts?: { search?: string; ativo?: boolean; categoria?: string; linha?: string; limit?: number; offset?: number }) {
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
  await db.insert(products).values(product).onDuplicateKeyUpdate({
    set: {
      descricao: product.descricao,
      ean: product.ean,
      categoria: product.categoria,
      linha: product.linha,
      preco_custo: product.preco_custo,
      preco_minimo: product.preco_minimo,
      margem_percent: product.margem_percent,
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
  const result = await db.insert(monitoringRuns).values(data).$returningId();
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
  return db.select().from(monitoringRuns).orderBy(desc(monitoringRuns.started_at)).limit(limit);
}

export async function getLatestMonitoringRun() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(monitoringRuns).orderBy(desc(monitoringRuns.started_at)).limit(1);
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
    .where(and(eq(priceSnapshots.product_id, productId), gte(priceSnapshots.captured_at, since)))
    .orderBy(desc(priceSnapshots.captured_at));
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
  if (opts?.productId) conditions.push(eq(violations.product_id, opts.productId));
  if (opts?.sellerId) conditions.push(eq(violations.seller_id, opts.sellerId));
  if (opts?.clienteId) conditions.push(eq(violations.cliente_id, opts.clienteId));
  if (opts?.dateFrom) conditions.push(gte(violations.detected_at, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(violations.detected_at, opts.dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select({ v: violations, p: products })
      .from(violations)
      .leftJoin(products, eq(violations.product_id, products.id))
      .where(where)
      .orderBy(desc(violations.detected_at))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0),
    db.select({ count: count() }).from(violations).where(where),
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
    db.select({ count: count() }).from(violations).where(gte(violations.detected_at, today)),
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
  if (status === "resolved") update.resolved_at = new Date();
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

    const rows = await db.execute(
      sql`SELECT DATE(detected_at) as date, COUNT(*) as cnt
          FROM violations
          WHERE detected_at >= ${since}
          GROUP BY DATE(detected_at)
          ORDER BY DATE(detected_at)`
    );
    const results = Array.isArray(rows) ? (rows as unknown as any[][])[0] ?? [] : [];
    return results.map((r: any) => ({ date: String(r.date), count: Number(r.cnt) }));
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
    await db.update(alertConfigs).set({
      email: data.email,
      name: data.name,
      active: data.active,
      notify_on_violation: data.notify_on_violation,
      notify_on_run_complete: data.notify_on_run_complete,
    }).where(eq(alertConfigs.id, data.id));
  } else {
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

export async function upsertSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({
    set: { value, updatedAt: new Date() },
  });
}

export async function initDefaultSettings() {
  const defaults: { key: string; value: string }[] = [
    { key: "margem_percent", value: "60" },
    { key: "scraper_hora", value: "14" },
    { key: "scraper_ativo", value: "true" },
    { key: "ml_keywords_min_match", value: "2" },
    { key: "ml_search_limit", value: "50" },
    { key: "alert_email_ativo", value: "true" },
  ];
  for (const s of defaults) {
    const existing = await getSetting(s.key);
    if (!existing) await upsertSetting(s.key, s.value);
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
  await db.insert(clientes).values(data).onDuplicateKeyUpdate({
    set: { nome: data.nome, loja_ml: data.loja_ml, status: data.status, updatedAt: new Date() },
  });
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
  const orderCol = opts?.orderBy === "total_anuncios" ? vendedores.total_anuncios : vendedores.total_violacoes;
  const [items, totalRows] = await Promise.all([
    db.select({ v: vendedores, c: clientes })
      .from(vendedores)
      .leftJoin(clientes, eq(vendedores.cliente_id, clientes.id))
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
  return db.select({ v: violations, p: products })
    .from(violations)
    .leftJoin(products, eq(violations.product_id, products.id))
    .where(eq(violations.cliente_id, clienteId))
    .orderBy(desc(violations.detected_at))
    .limit(limit);
}

// ─── Historico de Precos ──────────────────────────────────────────────────────
export async function getHistoricoPrecos(opts?: { codigoAsx?: string; vendedor?: string; days?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.codigoAsx) conditions.push(eq(historicoPrecosTable.codigo_asx, opts.codigoAsx));
  if (opts?.vendedor) conditions.push(like(historicoPrecosTable.vendedor, `%${opts.vendedor}%`));
  if (opts?.days) {
    const since = new Date();
    since.setDate(since.getDate() - opts.days);
    conditions.push(gte(historicoPrecosTable.data_captura, since.toISOString().split("T")[0] as unknown as Date));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(historicoPrecosTable).where(where).orderBy(desc(historicoPrecosTable.data_captura)).limit(500);
}
