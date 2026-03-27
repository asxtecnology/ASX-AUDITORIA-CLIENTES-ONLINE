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
  vendedorId: varchar("vendedor_id", { length: 64 }).unique(),
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

// ─── Ingestão ML (nova arquitetura) ──────────────────────────────────────────
// ml_ingestion_runs: cada sessão de coleta enviada por agente externo ou extensão
export const mlIngestionRuns = pgTable("ml_ingestion_runs", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 64 }).notNull(), // 'browser_extension' | 'collector_agent' | 'manual'
  sourceVersion: varchar("source_version", { length: 32 }), // versão do agente/extensão
  clienteId: integer("cliente_id"),
  sellerNickname: varchar("seller_nickname", { length: 255 }),
  sellerId: varchar("seller_id", { length: 64 }),
  totalListings: integer("total_listings").default(0),
  processedListings: integer("processed_listings").default(0),
  violationsFound: integer("violations_found").default(0),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | processing | completed | failed
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  apiKeyUsed: varchar("api_key_used", { length: 64 }), // hash da API key usada
});
export type MlIngestionRun = typeof mlIngestionRuns.$inferSelect;
export type InsertMlIngestionRun = typeof mlIngestionRuns.$inferInsert;

// ml_listing_snapshots: cada anúncio coletado pelo agente externo
export const mlListingSnapshots = pgTable("ml_listing_snapshots", {
  id: serial("id").primaryKey(),
  ingestionRunId: integer("ingestion_run_id").notNull(),
  clienteId: integer("cliente_id"),
  sellerId: varchar("seller_id", { length: 64 }),
  sellerNickname: varchar("seller_nickname", { length: 255 }),
  mlItemId: varchar("ml_item_id", { length: 64 }).notNull(),
  mlTitle: text("ml_title").notNull(),
  mlUrl: text("ml_url").notNull(),
  mlThumbnail: text("ml_thumbnail"),
  screenshotUrl: text("screenshot_url"), // evidência obrigatória
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }), // preço riscado
  currency: varchar("currency", { length: 8 }).default("BRL"),
  // Resultado do matching (preenchido pelo processamento)
  matchedProductId: integer("matched_product_id"),
  matchedProductCode: varchar("matched_product_code", { length: 32 }),
  matchConfidence: integer("match_confidence").default(0),
  matchMethod: varchar("match_method", { length: 64 }),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }),
  isViolation: boolean("is_violation").default(false),
  violationId: integer("violation_id"), // FK para violations se for violação
  processedAt: timestamp("processed_at"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});
export type MlListingSnapshot = typeof mlListingSnapshots.$inferSelect;
export type InsertMlListingSnapshot = typeof mlListingSnapshots.$inferInsert;

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

// ─── Tracked Listings (arquitetura de monitoramento de anúncios conhecidos) ───
// Anúncios conhecidos que serão monitorados periodicamente pela extensão
export const trackedListings = pgTable("tracked_listings", {
  id: serial("id").primaryKey(),
  mlItemId: varchar("ml_item_id", { length: 64 }).notNull().unique(),
  mlUrl: text("ml_url").notNull(),
  mlTitle: text("ml_title"),
  mlThumbnail: text("ml_thumbnail"),
  sellerId: varchar("seller_id", { length: 64 }),
  sellerNickname: varchar("seller_nickname", { length: 255 }),
  clienteId: integer("cliente_id"),
  matchedProductId: integer("matched_product_id"),
  matchedProductCode: varchar("matched_product_code", { length: 32 }),
  matchConfidence: integer("match_confidence").default(0),
  matchMethod: varchar("match_method", { length: 64 }),
  // Ciclo de vida: novo → monitorado → suspeito → violador → inativo
  listingStatus: varchar("listing_status", { length: 30 }).default("novo").notNull(),
  lastCheckedAt: timestamp("last_checked_at"),
  lastPrice: decimal("last_price", { precision: 10, scale: 2 }),
  lastViolationAt: timestamp("last_violation_at"),
  consecutiveViolations: integer("consecutive_violations").default(0),
  consecutiveOk: integer("consecutive_ok").default(0),
  totalChecks: integer("total_checks").default(0),
  // Origem do anúncio (de qual ingestão veio)
  sourceIngestionRunId: integer("source_ingestion_run_id"),
  sourceSnapshotId: integer("source_snapshot_id"),
  promotedAt: timestamp("promoted_at"),
  inactivatedAt: timestamp("inactivated_at"),
  inactivationReason: varchar("inactivation_reason", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type TrackedListing = typeof trackedListings.$inferSelect;
export type InsertTrackedListing = typeof trackedListings.$inferInsert;

// ─── Tracked Listing Checks ───────────────────────────────────────────────────
// Cada verificação pontual de um anúncio monitorado
export const trackedListingChecks = pgTable("tracked_listing_checks", {
  id: serial("id").primaryKey(),
  trackedListingId: integer("tracked_listing_id").notNull(),
  runId: integer("run_id"),
  checkSource: varchar("check_source", { length: 50 }).notNull(), // 'browser_extension' | 'manual' | 'api'
  observedTitle: text("observed_title"),
  observedPrice: decimal("observed_price", { precision: 12, scale: 2 }),
  observedOriginalPrice: decimal("observed_original_price", { precision: 12, scale: 2 }),
  observedCurrency: varchar("observed_currency", { length: 10 }).default("BRL"),
  observedAvailable: boolean("observed_available"),
  evidenceUrl: text("evidence_url"),
  screenshotUrl: text("screenshot_url"),
  htmlSnapshotUrl: text("html_snapshot_url"),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
  violationStatus: varchar("violation_status", { length: 30 }), // 'ok' | 'violation' | 'unavailable'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type TrackedListingCheck = typeof trackedListingChecks.$inferSelect;
export type InsertTrackedListingCheck = typeof trackedListingChecks.$inferInsert;

// ─── Match Review Queue ───────────────────────────────────────────────────────
// Fila de revisão para matches com baixa confiança (<80%)
export const matchReviewQueue = pgTable("match_review_queue", {
  id: serial("id").primaryKey(),
  trackedListingId: integer("tracked_listing_id").notNull(),
  snapshotId: integer("snapshot_id"),
  suggestedProductId: integer("suggested_product_id"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  reason: varchar("reason", { length: 100 }).notNull(),
  // Status: pending → approved | rejected | skipped
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  decisionNotes: text("decision_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type MatchReviewItem = typeof matchReviewQueue.$inferSelect;
export type InsertMatchReviewItem = typeof matchReviewQueue.$inferInsert;
