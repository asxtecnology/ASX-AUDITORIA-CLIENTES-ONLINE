import {
  boolean,
  date,
  decimal,
  int,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA — Mapeamento EXATO das colunas do banco MySQL/TiDB
// Cada coluna usa o nome EXATO como está no banco de dados.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Users ────────────────────────────────────────────────────────────────────
// users: id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 10 }).$type<"user" | "admin">().default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes ─────────────────────────────────────────────────────────────────
// clientes: id, nome, seller_id, loja_ml, link_loja, status, total_produtos, total_violacoes, ultima_verificacao, createdAt, updatedAt
export const clientes = mysqlTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  seller_id: varchar("seller_id", { length: 64 }).notNull().unique(),
  loja_ml: varchar("loja_ml", { length: 255 }),
  link_loja: varchar("link_loja", { length: 500 }),
  status: varchar("status", { length: 20 }).$type<"ativo" | "inativo">().default("ativo").notNull(),
  total_produtos: int("total_produtos").default(0),
  total_violacoes: int("total_violacoes").default(0),
  ultima_verificacao: timestamp("ultima_verificacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products ─────────────────────────────────────────────────────────────────
// products: id, codigo, descricao, ean, unidade, caixa, voltagem, ncm, preco_custo, preco_minimo, margem_percent, status_base, ativo, createdAt, updatedAt, categoria, linha
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  unidade: varchar("unidade", { length: 20 }),
  caixa: int("caixa"),
  voltagem: varchar("voltagem", { length: 20 }),
  ncm: varchar("ncm", { length: 20 }),
  preco_custo: decimal("preco_custo", { precision: 10, scale: 2 }).default("0").notNull(),
  preco_minimo: decimal("preco_minimo", { precision: 10, scale: 2 }).default("0").notNull(),
  margem_percent: decimal("margem_percent", { precision: 5, scale: 2 }).default("60").notNull(),
  status_base: varchar("status_base", { length: 50 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 64 }),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
// monitoring_runs: id, started_at, finished_at, status, total_products, products_found, violations_found, error_message, triggered_by, plataforma, cliente_id
export const monitoringRuns = mysqlTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  started_at: timestamp("started_at").defaultNow().notNull(),
  finished_at: timestamp("finished_at"),
  status: varchar("status", { length: 20 }).$type<"running" | "completed" | "failed">().default("running").notNull(),
  total_products: int("total_products").default(0),
  products_found: int("products_found").default(0),
  violations_found: int("violations_found").default(0),
  error_message: text("error_message"),
  triggered_by: varchar("triggered_by", { length: 50 }).$type<"scheduled" | "manual">().default("scheduled").notNull(),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  cliente_id: int("cliente_id"),
});

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ─────────────────────────────────────────────────────────
// price_snapshots: id, run_id, product_id, seller_name, seller_id, ml_item_id, ml_title, ml_url, ml_thumbnail, preco_anunciado, preco_minimo, is_violation, validation_reason, captured_at, cliente_id, plataforma, confianca, metodo_match
export const priceSnapshots = mysqlTable("price_snapshots", {
  id: serial("id").primaryKey(),
  run_id: int("run_id").notNull(),
  product_id: int("product_id").notNull(),
  seller_name: varchar("seller_name", { length: 200 }),
  seller_id: varchar("seller_id", { length: 50 }),
  ml_item_id: varchar("ml_item_id", { length: 50 }),
  ml_title: text("ml_title"),
  ml_url: text("ml_url"),
  ml_thumbnail: text("ml_thumbnail"),
  preco_anunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  preco_minimo: decimal("preco_minimo", { precision: 10, scale: 2 }),
  is_violation: boolean("is_violation").default(false),
  validation_reason: text("validation_reason"),
  captured_at: timestamp("captured_at").defaultNow().notNull(),
  cliente_id: int("cliente_id"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  confianca: int("confianca").default(0),
  metodo_match: varchar("metodo_match", { length: 50 }),
});

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
// violations: id, snapshot_id, run_id, product_id, seller_name, seller_id, ml_item_id, ml_url, ml_thumbnail, ml_title, preco_anunciado, preco_minimo, diferenca, percent_abaixo, status, notified_at, resolved_at, detected_at, cliente_id, plataforma, confianca, metodo_match
export const violations = mysqlTable("violations", {
  id: serial("id").primaryKey(),
  snapshot_id: int("snapshot_id"),
  run_id: int("run_id"),
  product_id: int("product_id"),
  seller_name: varchar("seller_name", { length: 200 }),
  seller_id: varchar("seller_id", { length: 50 }),
  ml_item_id: varchar("ml_item_id", { length: 50 }),
  ml_url: text("ml_url"),
  ml_thumbnail: text("ml_thumbnail"),
  ml_title: text("ml_title"),
  preco_anunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }),
  preco_minimo: decimal("preco_minimo", { precision: 10, scale: 2 }),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }),
  percent_abaixo: decimal("percent_abaixo", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 20 }).$type<"open" | "notified" | "resolved">().default("open").notNull(),
  notified_at: timestamp("notified_at"),
  resolved_at: timestamp("resolved_at"),
  detected_at: timestamp("detected_at").defaultNow().notNull(),
  cliente_id: int("cliente_id"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  confianca: int("confianca").default(0),
  metodo_match: varchar("metodo_match", { length: 50 }),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
// historico_precos: id, codigo_asx, plataforma, vendedor, item_id, preco, data_captura, createdAt
export const historicoPrecosTable = mysqlTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigo_asx: varchar("codigo_asx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 50 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  item_id: varchar("item_id", { length: 64 }),
  preco: decimal("preco", { precision: 10, scale: 2 }).notNull(),
  data_captura: date("data_captura").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores ───────────────────────────────────────────────────────────────
// vendedores: id, plataforma, vendedor_id, nome, cliente_id, total_violacoes, total_anuncios, primeira_vez, ultima_vez
export const vendedores = mysqlTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 50 }).notNull().default("mercadolivre"),
  vendedor_id: varchar("vendedor_id", { length: 100 }),
  nome: varchar("nome", { length: 200 }).notNull(),
  cliente_id: int("cliente_id"),
  total_violacoes: int("total_violacoes").default(0),
  total_anuncios: int("total_anuncios").default(0),
  primeira_vez: timestamp("primeira_vez").defaultNow(),
  ultima_vez: timestamp("ultima_vez").defaultNow(),
});

export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configs ────────────────────────────────────────────────────────────
// alert_configs: id, email, name, active, notify_on_violation, notify_on_run_complete, createdAt
export const alertConfigs = mysqlTable("alert_configs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }),
  name: varchar("name", { length: 200 }),
  active: boolean("active").default(true).notNull(),
  notify_on_violation: boolean("notify_on_violation").default(true),
  notify_on_run_complete: boolean("notify_on_run_complete").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
// app_settings: id, key, value, description, updatedAt
export const appSettings = mysqlTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
