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

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA DEFINITIVO — Mapeamento exato das colunas do Supabase (camelCase)
// Cada coluna usa o nome EXATO como está no banco de dados PostgreSQL.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Users (auth) ────────────────────────────────────────────────────────────
export const users = pgTable("users", {
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

// ─── Clientes (Revendedores ASX) ─────────────────────────────────────────────
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 50 }),
  lojaML: varchar("lojaML", { length: 255 }),
  sellerId: varchar("sellerId", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 20 }).$type<"ativo" | "inativo">().default("ativo").notNull(),
  totalProdutos: integer("totalProdutos").default(0),
  totalViolacoes: integer("totalViolacoes").default(0),
  ultimaVerificacao: timestamp("ultimaVerificacao"),
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
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 64 }),
  precoCusto: numeric("precoCusto", { precision: 10, scale: 2 }).default("0").notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).default("0").notNull(),
  margemPercent: numeric("margemPercent", { precision: 5, scale: 2 }).default("60").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  clienteId: integer("clienteId"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  status: varchar("status", { length: 20 }).$type<"running" | "completed" | "failed">().default("running").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  totalFound: integer("totalFound").default(0),
  totalViolations: integer("totalViolations").default(0),
  triggeredBy: varchar("triggeredBy", { length: 50 }).$type<"scheduled" | "manual">().default("scheduled").notNull(),
  errorMessage: text("errorMessage"),
});

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ─────────────────────────────────────────────────────────
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  clienteId: integer("clienteId"),
  runId: integer("runId").notNull(),
  mlItemId: varchar("mlItemId", { length: 50 }),
  mlTitle: text("mlTitle"),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  sellerId: varchar("sellerId", { length: 50 }),
  sellerName: varchar("sellerName", { length: 200 }),
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  isViolation: boolean("isViolation").default(false),
  metodoMatch: varchar("metodoMatch", { length: 50 }),
  confianca: integer("confianca").default(0),
  validationReason: text("validationReason"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  productId: integer("productId"),
  clienteId: integer("clienteId"),
  runId: integer("runId"),
  snapshotId: integer("snapshotId"),
  mlItemId: varchar("mlItemId", { length: 50 }),
  mlTitle: text("mlTitle"),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  sellerId: varchar("sellerId", { length: 50 }),
  sellerName: varchar("sellerName", { length: 200 }),
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }),
  diferenca: numeric("diferenca", { precision: 10, scale: 2 }),
  percentAbaixo: numeric("percentAbaixo", { precision: 5, scale: 2 }),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  metodoMatch: varchar("metodoMatch", { length: 50 }),
  confianca: integer("confianca").default(0),
  status: varchar("status", { length: 20 }).$type<"open" | "notified" | "resolved">().default("open").notNull(),
  detected_at: timestamp("detected_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 200 }),
  notes: text("notes"),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const historicoPrecosTable = pgTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigo_asx: varchar("codigo_asx", { length: 32 }).notNull(),
  item_id: varchar("item_id", { length: 64 }),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
  plataforma: varchar("plataforma", { length: 50 }).notNull().default("mercadolivre"),
  data_captura: date("data_captura").notNull(),
});

export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
export const vendedores = pgTable("vendedores", {
  id: serial("id").primaryKey(),
  cliente_id: integer("cliente_id"),
  vendedor_id: varchar("vendedor_id", { length: 100 }),
  nome: varchar("nome", { length: 200 }).notNull(),
  plataforma: varchar("plataforma", { length: 50 }).notNull().default("mercadolivre"),
  total_anuncios: integer("total_anuncios").default(0),
  total_violacoes: integer("total_violacoes").default(0),
  primeira_vez: timestamp("primeira_vez").defaultNow(),
  ultima_vez: timestamp("ultima_vez").defaultNow(),
});

export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
export const alertConfigs = pgTable("alert_configs", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  emailsDestinatarios: text("emailsDestinatarios"),
  frequencia: varchar("frequencia", { length: 50 }).default("immediate"),
  minViolacoes: integer("minViolacoes").default(1),
  incluirResumo: boolean("incluirResumo").default(true),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
