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
export const mlCredStatusEnum = pgEnum("ml_cred_status", ["pending", "authorized", "expired", "error"]);

// ─── Users (auth) ─────────────────────────────────────────────────────────────
// Nota: users usa camelCase pois já existe no Supabase com esse formato
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 20 }).default("user").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  lastSignedIn: timestamp("lastSignedIn").notNull().defaultNow(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }).notNull(),
  lojaML: varchar("loja_ml", { length: 255 }),
  linkLoja: text("link_loja"),
  email: varchar("email", { length: 320 }),
  status: varchar("status", { length: 20 }).default("ativo").notNull(),
  totalProdutos: integer("total_produtos").default(0),
  totalViolacoes: integer("total_violacoes").default(0),
  ultimaVerificacao: timestamp("ultima_verificacao"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products (ASX Catalog) ───────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  unidade: varchar("unidade", { length: 10 }),
  caixa: integer("caixa"),
  voltagem: varchar("voltagem", { length: 20 }),
  ncm: varchar("ncm", { length: 20 }),
  precoCusto: decimal("preco_custo", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: decimal("margem_percent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  statusBase: varchar("status_base", { length: 20 }).default("ATIVO"),
  categoria: varchar("categoria", { length: 64 }),
  linha: varchar("linha", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ──────────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const monitoringRuns = pgTable("monitoring_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  totalFound: integer("total_products").default(0),
  productsFound: integer("products_found").default(0),
  totalViolations: integer("violations_found").default(0),
  errorMessage: text("error_message"),
  triggeredBy: varchar("triggered_by", { length: 20 }).default("scheduled").notNull(),
  slotHour: integer("slot_hour"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: integer("cliente_id"),
});
export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ──────────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  productId: integer("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  clienteId: integer("cliente_id"),
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlTitle: text("ml_title"),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("is_violation").default(false).notNull(),
  validationReason: varchar("validation_reason", { length: 255 }),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodo_match", { length: 64 }),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ───────────────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull(),
  runId: integer("run_id").notNull(),
  productId: integer("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  clienteId: integer("cliente_id"),
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  mlTitle: text("ml_title"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: decimal("percent_abaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: integer("confianca").default(0),
  metodoMatch: varchar("metodo_match", { length: 64 }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  notifiedAt: timestamp("notified_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  notes: text("notes"),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
});
export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const historicoPrecosTable = pgTable("historico_precos", {
  id: serial("id").primaryKey(),
  codigoAsx: varchar("codigo_asx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  itemId: varchar("item_id", { length: 64 }),
  preco: decimal("preco", { precision: 10, scale: 2 }).notNull(),
  dataCaptura: varchar("data_captura", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const vendedores = pgTable("vendedores", {
  id: serial("id").primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedor_id", { length: 64 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  clienteId: integer("cliente_id"),
  totalViolacoes: integer("total_violacoes").default(0),
  totalAnuncios: integer("total_anuncios").default(0),
  primeiraVez: timestamp("primeira_vez"),
  ultimaVez: timestamp("ultima_vez"),
});
export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
// Alinhado ao Supabase: snake_case
export const alertConfigs = pgTable("alert_configs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  notifyOnViolation: boolean("notify_on_violation").default(true).notNull(),
  notifyOnRunComplete: boolean("notify_on_run_complete").default(false).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── Mercado Livre OAuth Credentials ─────────────────────────────────────────
// Tabela nova — ainda não existe no Supabase, será criada via db:push
export const mlCredentials = pgTable("ml_credentials", {
  id: serial("id").primaryKey(),
  appId: varchar("app_id", { length: 64 }).notNull(),
  clientSecret: varchar("client_secret", { length: 128 }).notNull(),
  siteId: varchar("site_id", { length: 8 }).default("MLB").notNull(),
  redirectUri: varchar("redirect_uri", { length: 512 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenType: varchar("token_type", { length: 32 }).default("Bearer"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"),
  mlUserId: varchar("ml_user_id", { length: 64 }),
  mlNickname: varchar("ml_nickname", { length: 128 }),
  mlEmail: varchar("ml_email", { length: 320 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type MlCredential = typeof mlCredentials.$inferSelect;
export type InsertMlCredential = typeof mlCredentials.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
// Nota: app_settings usa camelCase pois já existe no Supabase com esse formato
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
