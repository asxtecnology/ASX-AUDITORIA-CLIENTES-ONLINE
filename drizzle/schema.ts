import {
  boolean,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusClienteEnum = pgEnum("status_cliente", ["ativo", "inativo"]);
export const violationStatusEnum = pgEnum("violation_status", ["open", "notified", "resolved"]);
export const monitoringStatusEnum = pgEnum("monitoring_status", ["running", "completed", "failed"]);
export const triggeredByEnum = pgEnum("triggered_by", ["scheduled", "manual"]);

// ─── Users (auth) ─────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  lastSignedIn: timestamp("lastSignedIn").notNull().defaultNow(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }).notNull(),
  lojaML: varchar("lojaML", { length: 255 }),
  linkLoja: text("linkLoja"),
  email: varchar("email", { length: 320 }),
  status: statusClienteEnum("status").default("ativo").notNull(),
  totalProdutos: integer("totalProdutos").default(0),
  totalViolacoes: integer("totalViolacoes").default(0),
  ultimaVerificacao: timestamp("ultimaVerificacao"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
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
  precoCusto: decimal("precoCusto", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: decimal("margemPercent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  statusBase: varchar("statusBase", { length: 20 }).default("ATIVO"),
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ──────────────────────────────────────────────────────────
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  finishedAt: timestamp("finishedAt"),
  status: monitoringStatusEnum("status").default("running").notNull(),
  totalFound: integer("totalFound").default(0),
  productsFound: integer("productsFound").default(0),
  totalViolations: integer("totalViolations").default(0),
  errorMessage: text("errorMessage"),
  triggeredBy: mysqlEnum("triggeredBy", ["scheduled", "manual"]).default("scheduled").notNull(),
  slotHour: int("slotHour"), // 10 = turno manhã, 16 = turno tarde, null = manual
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: integer("clienteId"),
});
export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ──────────────────────────────────────────────────────────
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  productId: integer("productId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }),
  clienteId: integer("clienteId"),
  mlItemId: varchar("mlItemId", { length: 64 }),
  mlTitle: text("mlTitle"),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("isViolation").default(false).notNull(),
  validationReason: varchar("validationReason", { length: 255 }),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  capturedAt: timestamp("capturedAt").notNull().defaultNow(),
});
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshotId").notNull(),
  runId: integer("runId").notNull(),
  productId: integer("productId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }),
  clienteId: integer("clienteId"),
  mlItemId: varchar("mlItemId", { length: 64 }),
  mlUrl: text("mlUrl"),
  mlThumbnail: text("mlThumbnail"),
  mlTitle: text("mlTitle"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: decimal("percentAbaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  status: violationStatusEnum("status").default("open").notNull(),
  notifiedAt: timestamp("notifiedAt"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 255 }),
  notes: text("notes"),
  detectedAt: timestamp("detectedAt").notNull().defaultNow(),
});
export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const historicoPrecosTable = pgTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigoAsx: varchar("codigoAsx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  itemId: varchar("itemId", { length: 64 }),
  preco: decimal("preco", { precision: 10, scale: 2 }).notNull(),
  dataCaptura: varchar("dataCaptura", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
export const vendedores = pgTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedorId", { length: 64 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  clienteId: integer("clienteId"),
  totalViolacoes: integer("totalViolacoes").default(0),
  totalAnuncios: integer("totalAnuncios").default(0),
  primeiraVez: timestamp("primeiraVez"),
  ultimaVez: timestamp("ultimaVez"),
});
export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
export const alertConfigs = pgTable("alert_configs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  notifyOnViolation: boolean("notifyOnViolation").default(true).notNull(),
  notifyOnRunComplete: boolean("notifyOnRunComplete").default(false).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── Mercado Livre OAuth Credentials ────────────────────────────────────────
export const mlCredentials = mysqlTable("ml_credentials", {
  id: serial("id").primaryKey(),
  // Dados do App ML (obtidos em developers.mercadolivre.com.br)
  appId: varchar("appId", { length: 64 }).notNull(),
  clientSecret: varchar("clientSecret", { length: 128 }).notNull(),
  siteId: varchar("siteId", { length: 8 }).default("MLB").notNull(), // MLB=Brasil, MLA=Argentina, MLM=México, MLE=Espanha
  redirectUri: varchar("redirectUri", { length: 512 }),
  // Tokens OAuth (preenchidos após autorização)
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenType: varchar("tokenType", { length: 32 }).default("Bearer"),
  expiresAt: datetime("expiresAt"), // quando o access_token expira
  scope: text("scope"), // escopos autorizados
  // Dados do usuário ML autenticado
  mlUserId: varchar("mlUserId", { length: 64 }), // ID numérico do usuário ML
  mlNickname: varchar("mlNickname", { length: 128 }), // nickname da conta ML
  mlEmail: varchar("mlEmail", { length: 320 }), // email da conta ML
  // Status
  status: mysqlEnum("status", ["pending", "authorized", "expired", "error"]).default("pending").notNull(),
  lastError: text("lastError"),
  createdAt: datetime("createdAt").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updatedAt").notNull().$defaultFn(() => new Date()),
});
export type MlCredential = typeof mlCredentials.$inferSelect;
export type InsertMlCredential = typeof mlCredentials.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
