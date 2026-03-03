import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
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
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlTitle: text("ml_title"),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  isViolation: boolean("is_violation").default(false).notNull(),
  validationReason: varchar("validation_reason", { length: 255 }),
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
  mlItemId: varchar("ml_item_id", { length: 64 }),
  mlUrl: text("ml_url"),
  mlThumbnail: text("ml_thumbnail"),
  mlTitle: text("ml_title"),
  precoAnunciado: decimal("preco_anunciado", { precision: 10, scale: 2 }).notNull(),
  precoMinimo: decimal("preco_minimo", { precision: 10, scale: 2 }).notNull(),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }).notNull(),
  percentAbaixo: decimal("percent_abaixo", { precision: 5, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["open", "notified", "resolved"]).default("open").notNull(),
  notifiedAt: timestamp("notified_at"),
  resolvedAt: timestamp("resolved_at"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
});

export type Violation = typeof violations.$inferSelect;
export type InsertViolation = typeof violations.$inferInsert;

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
