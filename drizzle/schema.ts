import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  date,
} from "drizzle-orm/pg-core";

// ─── Users (auth) ────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 20 }).default("user").notNull(),
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
  sellerId: varchar("sellerId", { length: 64 }).notNull().unique(),
  lojaML: varchar("lojaML", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 30 }),
  status: varchar("status", { length: 20 }).default("ativo").notNull(),
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
  precoCusto: numeric("precoCusto", { precision: 10, scale: 2 }).notNull().default("0"),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull().default("0"),
  margemPercent: numeric("margemPercent", { precision: 5, scale: 2 }).default("60").notNull(),
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  triggeredBy: varchar("triggeredBy", { length: 50 }).default("scheduled").notNull(),
  clienteId: integer("clienteId"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  totalFound: integer("totalFound").default(0),
  totalViolations: integer("totalViolations").default(0),
  errorMessage: text("errorMessage"),
});
export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ──────────────────────────────────────────────────────────
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  productId: integer("productId").notNull(),
  sellerName: varchar("sellerName", { length: 200 }).notNull(),
  sellerId: varchar("sellerId", { length: 50 }),
  clienteId: integer("clienteId"),
  mlItemId: varchar("mlItemId", { length: 50 }),
  mlTitle: text("mlTitle"),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("isViolation").default(false).notNull(),
  validationReason: text("validationReason"),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 50 }),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ──────────────────────────────────────────────────────────────
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshotId").notNull(),
  runId: integer("runId").notNull(),
  productId: integer("productId").notNull(),
  sellerName: varchar("sellerName", { length: 200 }).notNull(),
  sellerId: varchar("sellerId", { length: 50 }),
  clienteId: integer("clienteId"),
  mlItemId: varchar("mlItemId", { length: 50 }),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  mlTitle: text("mlTitle"),
  plataforma: varchar("plataforma", { length: 50 }).default("mercadolivre"),
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: numeric("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: numeric("percentAbaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 50 }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 200 }),
  notes: text("notes"),
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
  userId: integer("userId"),
  emailsDestinatarios: text("emailsDestinatarios"),
  ativo: boolean("ativo").default(true).notNull(),
  frequencia: varchar("frequencia", { length: 20 }).default("immediate"),
  minViolacoes: integer("minViolacoes").default(1),
  incluirResumo: boolean("incluirResumo").default(true),
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
