import {
  boolean,
  datetime,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users (auth) ─────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updatedAt").notNull().$defaultFn(() => new Date()),
  lastSignedIn: datetime("lastSignedIn").notNull().$defaultFn(() => new Date()),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
export const clientes = mysqlTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }).notNull().unique(),
  lojaML: varchar("lojaML", { length: 255 }),
  linkLoja: text("linkLoja"),
  status: mysqlEnum("status", ["ativo", "inativo"]).default("ativo").notNull(),
  totalProdutos: int("totalProdutos").default(0),
  totalViolacoes: int("totalViolacoes").default(0),
  ultimaVerificacao: datetime("ultimaVerificacao"),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updatedAt").notNull().$defaultFn(() => new Date()),
});
export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products (ASX Catalog) ───────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  unidade: varchar("unidade", { length: 10 }),
  caixa: int("caixa"),
  voltagem: varchar("voltagem", { length: 20 }),
  ncm: varchar("ncm", { length: 20 }),
  precoCusto: decimal("precoCusto", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: decimal("margemPercent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  statusBase: varchar("statusBase", { length: 20 }).default("ATIVO"),
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updatedAt").notNull().$defaultFn(() => new Date()),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ──────────────────────────────────────────────────────────
export const monitoringRuns = mysqlTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: datetime("startedAt").notNull().$defaultFn(() => new Date()),
  finishedAt: datetime("finishedAt"),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  totalFound: int("totalFound").default(0),
  productsFound: int("productsFound").default(0),
  totalViolations: int("totalViolations").default(0),
  errorMessage: text("errorMessage"),
  triggeredBy: mysqlEnum("triggeredBy", ["scheduled", "manual"]).default("scheduled").notNull(),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: int("clienteId"),
});
export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ──────────────────────────────────────────────────────────
export const priceSnapshots = mysqlTable("price_snapshots", {
  id: serial("id").primaryKey(),
  runId: int("runId").notNull(),
  productId: int("productId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }),
  clienteId: int("clienteId"),
  mlItemId: varchar("mlItemId", { length: 64 }),
  mlTitle: text("mlTitle"),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("isViolation").default(false).notNull(),
  validationReason: varchar("validationReason", { length: 255 }),
  confianca: int("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  capturedAt: datetime("capturedAt").notNull().$defaultFn(() => new Date()),
});
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
export const violations = mysqlTable("violations", {
  id: serial("id").primaryKey(),
  snapshotId: int("snapshotId").notNull(),
  runId: int("runId").notNull(),
  productId: int("productId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }),
  clienteId: int("clienteId"),
  mlItemId: varchar("mlItemId", { length: 64 }),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  mlTitle: text("mlTitle"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: decimal("percentAbaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: int("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  status: mysqlEnum("status", ["open", "notified", "resolved"]).default("open").notNull(),
  notifiedAt: datetime("notifiedAt"),
  resolvedAt: datetime("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 255 }),
  notes: text("notes"),
  detectedAt: datetime("detectedAt").notNull().$defaultFn(() => new Date()),
});
export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const historicoPrecosTable = mysqlTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigoAsx: varchar("codigoAsx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  itemId: varchar("itemId", { length: 64 }),
  preco: decimal("preco", { precision: 10, scale: 2 }).notNull(),
  dataCaptura: varchar("dataCaptura", { length: 10 }).notNull(),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
});
export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
export const vendedores = mysqlTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedorId", { length: 64 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  clienteId: int("clienteId"),
  totalViolacoes: int("totalViolacoes").default(0),
  totalAnuncios: int("totalAnuncios").default(0),
  primeiraVez: datetime("primeiraVez"),
  ultimaVez: datetime("ultimaVez"),
});
export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
export const alertConfigs = mysqlTable("alert_configs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  notifyOnViolation: boolean("notifyOnViolation").default(true).notNull(),
  notifyOnRunComplete: boolean("notifyOnRunComplete").default(false).notNull(),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
});
export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: datetime("updatedAt").notNull().$defaultFn(() => new Date()),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
