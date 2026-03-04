import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Users (auth) ────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: text("role").$type<"user" | "admin">().default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }).notNull().unique(),
  lojaML: varchar("loja_ml", { length: 255 }),
  linkLoja: text("link_loja"),
  status: text("status").$type<"ativo" | "inativo">().default("ativo").notNull(),
  totalProdutos: integer("total_produtos").default(0),
  totalViolacoes: integer("total_violacoes").default(0),
  ultimaVerificacao: timestamp("ultima_verificacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products (ASX Catalog) ───────────────────────────────────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  unidade: varchar("unidade", { length: 10 }),
  caixa: integer("caixa"),
  voltagem: varchar("voltagem", { length: 20 }),
  ncm: varchar("ncm", { length: 20 }),
  precoCusto: numeric("preco_custo", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: numeric("margem_percent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  statusBase: varchar("status_base", { length: 20 }).default("ATIVO"),
  categoria: varchar("categoria", { length: 64 }),
  linha: text("linha").$type<"PREMIUM" | "PLUS" | "ECO">(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: text("status").$type<"running" | "completed" | "failed">().default("running").notNull(),
  totalProducts: integer("total_products").default(0),
  productsFound: integer("products_found").default(0),
  violationsFound: integer("violations_found").default(0),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by").$type<"scheduled" | "manual">().default("scheduled").notNull(),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: integer("cliente_id"),
});

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ─────────────────────────────────────────────────────────
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  productId: integer("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  clienteId: integer("cliente_id"),
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  mlTitle: text("ml_title"),
  precoAnunciado: numeric("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull(),
  runId: integer("run_id").notNull(),
  productId: integer("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  mlTitle: text("ml_title"),
  precoAnunciado: numeric("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: numeric("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: numeric("percent_abaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodo_match", { length: 64 }),
  status: text("status").$type<"open" | "notified" | "resolved">().default("open").notNull(),
  notifiedAt: timestamp("notified_at"),
  resolvedAt: timestamp("resolved_at"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const historicoPrecosTable = pgTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigoAsx: varchar("codigo_asx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  itemId: varchar("item_id", { length: 64 }),
  preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
  dataCaptura: date("data_captura").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
export const vendedores = pgTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedor_id", { length: 64 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  clienteId: integer("cliente_id"),
  totalViolacoes: integer("total_violacoes").default(0),
  totalAnuncios: integer("total_anuncios").default(0),
  primeiraVez: timestamp("primeira_vez").defaultNow(),
  ultimaVez: timestamp("ultima_vez").defaultNow(),
});

export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
export const alertConfigs = pgTable("alert_configs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  notifyOnViolation: boolean("notify_on_violation").default(true).notNull(),
  notifyOnRunComplete: boolean("notify_on_run_complete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
