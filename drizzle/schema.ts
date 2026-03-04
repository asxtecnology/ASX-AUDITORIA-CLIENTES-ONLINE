import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  date,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusClienteEnum = pgEnum("status_cliente", ["ativo", "inativo"]);
export const statusRunEnum = pgEnum("status_run", ["running", "completed", "failed"]);
export const triggeredByEnum = pgEnum("triggered_by", ["scheduled", "manual"]);
export const statusViolationEnum = pgEnum("status_violation", ["open", "notified", "resolved"]);
export const linhaEnum = pgEnum("linha", ["PREMIUM", "PLUS", "ECO"]);

// ─── Users (auth) ────────────────────────────────────────────────────────────
// Supabase columns: id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
// Supabase columns: id, nome, sellerId, lojaML, status, totalProdutos, totalViolacoes,
//                   ultimaVerificacao, createdAt, updatedAt, email, telefone
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("sellerId", { length: 64 }).notNull().unique(),
  lojaML: varchar("lojaML", { length: 255 }),
  status: statusClienteEnum("status").default("ativo").notNull(),
  totalProdutos: integer("totalProdutos").default(0),
  totalViolacoes: integer("totalViolacoes").default(0),
  ultimaVerificacao: timestamp("ultimaVerificacao"),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products (ASX Catalog) ───────────────────────────────────────────────────
// Supabase columns: id, codigo, descricao, ean, linha, categoria, ativo,
//                   precoCusto, precoMinimo, margemPercent, createdAt, updatedAt
// NOTE: unidade, caixa, voltagem, ncm, statusBase NOT in Supabase — omitted
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  precoCusto: numeric("precoCusto", { precision: 10, scale: 2 }),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: numeric("margemPercent", { precision: 5, scale: 2 }).default("60.00"),
  categoria: varchar("categoria", { length: 64 }),
  linha: linhaEnum("linha"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
// Supabase columns: id, startedAt, finishedAt, status, totalFound, totalViolations,
//                   errorMessage, triggeredBy, plataforma, clienteId
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  status: statusRunEnum("status").default("running").notNull(),
  totalFound: integer("totalFound").default(0),
  totalViolations: integer("totalViolations").default(0),
  errorMessage: text("errorMessage"),
  triggeredBy: triggeredByEnum("triggeredBy").default("scheduled").notNull(),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: integer("clienteId"),
});

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ─────────────────────────────────────────────────────────
// Supabase columns: id, runId, productId, sellerName, sellerId, clienteId,
//                   mlItemId, mlTitle, mlUrl, mlThumbnail, plataforma,
//                   precoAnunciado, precoMinimo, isViolation, validationReason,
//                   confianca, metodoMatch, capturedAt
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
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("isViolation").default(false).notNull(),
  validationReason: varchar("validationReason", { length: 255 }),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ──────────────────────────────────────────────────────────────
// Supabase columns: id, snapshotId, runId, productId, sellerName, sellerId,
//                   clienteId, mlItemId, mlUrl, mlThumbnail, mlTitle, plataforma,
//                   precoAnunciado, precoMinimo, diferenca, percentAbaixo,
//                   confianca, metodoMatch, status, resolvedAt, resolvedBy,
//                   detected_at, notes
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
  precoAnunciado: numeric("precoAnunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: numeric("precoMinimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: numeric("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: numeric("percentAbaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodoMatch", { length: 64 }),
  status: statusViolationEnum("status").default("open").notNull(),
  notes: text("notes"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 255 }),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
// Supabase columns: id, codigo_asx, plataforma, vendedor, item_id, preco, data_captura
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
// Supabase columns: id, plataforma, vendedor_id, nome, cliente_id,
//                   total_violacoes, total_anuncios, primeira_vez, ultima_vez
export const vendedores = pgTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedor_id", { length: 64 }).unique(),
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
// Supabase columns: id, ativo, emailsDestinatarios, frequencia, incluirResumo,
//                   minViolacoes, userId, createdAt, updatedAt
export const alertConfigs = pgTable("alert_configs", {
  id: serial("id").primaryKey(),
  ativo: boolean("ativo").default(true).notNull(),
  emailsDestinatarios: text("emailsDestinatarios"),
  frequencia: varchar("frequencia", { length: 32 }).default("daily"),
  incluirResumo: boolean("incluirResumo").default(true),
  minViolacoes: integer("minViolacoes").default(1),
  userId: integer("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
// Supabase columns: id, key, value, updatedAt
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
