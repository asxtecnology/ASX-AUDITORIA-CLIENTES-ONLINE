import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
} from "drizzle-orm/mysql-core";

// ─── Users (auth) ────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes Monitorados ─────────────────────────────────────────────────────
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }).notNull().unique(),
  lojaML: varchar("loja_ml", { length: 255 }),
  linkLoja: text("link_loja"),
  status: mysqlEnum("status", ["ativo", "inativo"]).default("ativo").notNull(),
  totalProdutos: int("total_produtos").default(0),
  totalViolacoes: int("total_violacoes").default(0),
  ultimaVerificacao: timestamp("ultima_verificacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Products (ASX Catalog) ───────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  ean: varchar("ean", { length: 20 }),
  unidade: varchar("unidade", { length: 10 }),
  caixa: int("caixa"),
  voltagem: varchar("voltagem", { length: 20 }),
  ncm: varchar("ncm", { length: 20 }),
  precoCusto: decimal("preco_custo", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  margemPercent: decimal("margem_percent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  statusBase: varchar("status_base", { length: 20 }).default("ATIVO"),
  // Categorização automática
  categoria: varchar("categoria", { length: 64 }), // ULTRA LED, SUPER LED, LAMPADA, CHICOTE, WORKLIGHT, etc.
  linha: mysqlEnum("linha", ["PREMIUM", "PLUS", "ECO"]), // baseado no preço de custo
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Monitoring Runs ─────────────────────────────────────────────────────────
export const monitoringRuns = mysqlTable("monitoring_runs", {
  id: int("id").autoincrement().primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  totalProducts: int("total_products").default(0),
  productsFound: int("products_found").default(0),
  violationsFound: int("violations_found").default(0),
  errorMessage: text("error_message"),
  triggeredBy: mysqlEnum("triggered_by", ["scheduled", "manual"]).default("scheduled").notNull(),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  clienteId: int("cliente_id"), // se foi scan individual de cliente
});

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = typeof monitoringRuns.$inferInsert;

// ─── Price Snapshots ─────────────────────────────────────────────────────────
export const priceSnapshots = mysqlTable("price_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id").notNull(),
  productId: int("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  clienteId: int("cliente_id"), // FK para clientes (null = não cadastrado)
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlTitle: text("ml_title"),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("is_violation").default(false).notNull(),
  validationReason: varchar("validation_reason", { length: 255 }),
  // Sistema de confiança v2
  confianca: int("confianca").default(0), // 0-100
  metodoMatch: varchar("metodo_match", { length: 64 }), // ean, codigo, linha_bulbo, marca_bulbo, marca
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Violations ──────────────────────────────────────────────────────────────
export const violations = mysqlTable("violations", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshot_id").notNull(),
  runId: int("run_id").notNull(),
  productId: int("product_id").notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  sellerId: varchar("seller_id", { length: 64 }),
  clienteId: int("cliente_id"), // FK para clientes (null = não cadastrado)
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  mlTitle: text("ml_title"),
  plataforma: varchar("plataforma", { length: 32 }).default("mercadolivre"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: decimal("percent_abaixo", { precision: 5, scale: 2 }).notNull(),
  confianca: int("confianca").default(0),
  metodoMatch: varchar("metodo_match", { length: 64 }),
  status: mysqlEnum("status", ["open", "notified", "resolved"]).default("open").notNull(),
  notifiedAt: timestamp("notified_at"),
  resolvedAt: timestamp("resolved_at"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const historicoPrecosTable = mysqlTable("historico_precos", {
  id: int("id").autoincrement().primaryKey(),
  codigoAsx: varchar("codigo_asx", { length: 32 }).notNull(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedor: varchar("vendedor", { length: 255 }).notNull(),
  itemId: varchar("item_id", { length: 64 }),
  preco: decimal("preco", { precision: 10, scale: 2 }).notNull(),
  dataCaptura: date("data_captura").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoPreco = typeof historicoPrecosTable.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecosTable.$inferInsert;

// ─── Vendedores (ranking) ─────────────────────────────────────────────────────
export const vendedores = mysqlTable("vendedores", {
  id: int("id").autoincrement().primaryKey(),
  plataforma: varchar("plataforma", { length: 32 }).notNull().default("mercadolivre"),
  vendedorId: varchar("vendedor_id", { length: 64 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  clienteId: int("cliente_id"), // FK para clientes (null = desconhecido)
  totalViolacoes: int("total_violacoes").default(0),
  totalAnuncios: int("total_anuncios").default(0),
  primeiraVez: timestamp("primeira_vez").defaultNow(),
  ultimaVez: timestamp("ultima_vez").defaultNow().onUpdateNow(),
});

export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

// ─── Alert Configurations ─────────────────────────────────────────────────────
export const alertConfigs = mysqlTable("alert_configs", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  notifyOnViolation: boolean("notify_on_violation").default(true).notNull(),
  notifyOnRunComplete: boolean("notify_on_run_complete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = typeof alertConfigs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
