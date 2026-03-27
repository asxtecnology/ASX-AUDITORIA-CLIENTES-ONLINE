CREATE TYPE "public"."ml_cred_status" AS ENUM('pending', 'authorized', 'expired', 'error');--> statement-breakpoint
CREATE TYPE "public"."monitoring_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."status_cliente" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."triggered_by" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."violation_status" AS ENUM('open', 'notified', 'resolved');--> statement-breakpoint
CREATE TABLE "alert_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"notify_on_violation" boolean DEFAULT true NOT NULL,
	"notify_on_run_complete" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_configs_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"seller_id" varchar(64) NOT NULL,
	"loja_ml" varchar(255),
	"link_loja" text,
	"email" varchar(320),
	"status" varchar(20) DEFAULT 'ativo' NOT NULL,
	"total_produtos" integer DEFAULT 0,
	"total_violacoes" integer DEFAULT 0,
	"ultima_verificacao" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historico_precos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo_asx" varchar(32) NOT NULL,
	"plataforma" varchar(32) DEFAULT 'mercadolivre' NOT NULL,
	"vendedor" varchar(255) NOT NULL,
	"item_id" varchar(64),
	"preco" numeric(10, 2) NOT NULL,
	"data_captura" varchar(10) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracked_listing_id" integer NOT NULL,
	"snapshot_id" integer,
	"suggested_product_id" integer,
	"confidence" numeric(5, 2),
	"reason" varchar(100) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp,
	"decision_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"client_secret" varchar(128) NOT NULL,
	"site_id" varchar(8) DEFAULT 'MLB' NOT NULL,
	"redirect_uri" varchar(512),
	"access_token" text,
	"refresh_token" text,
	"token_type" varchar(32) DEFAULT 'Bearer',
	"expires_at" timestamp,
	"scope" text,
	"ml_user_id" varchar(64),
	"ml_nickname" varchar(128),
	"ml_email" varchar(320),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(64) NOT NULL,
	"source_version" varchar(32),
	"cliente_id" integer,
	"seller_nickname" varchar(255),
	"seller_id" varchar(64),
	"total_listings" integer DEFAULT 0,
	"processed_listings" integer DEFAULT 0,
	"violations_found" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"api_key_used" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "ml_listing_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingestion_run_id" integer NOT NULL,
	"cliente_id" integer,
	"seller_id" varchar(64),
	"seller_nickname" varchar(255),
	"ml_item_id" varchar(64) NOT NULL,
	"ml_title" text NOT NULL,
	"ml_url" text NOT NULL,
	"ml_thumbnail" text,
	"screenshot_url" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"currency" varchar(8) DEFAULT 'BRL',
	"matched_product_id" integer,
	"matched_product_code" varchar(32),
	"match_confidence" integer DEFAULT 0,
	"match_method" varchar(64),
	"preco_minimo" numeric(10, 2),
	"is_violation" boolean DEFAULT false,
	"violation_id" integer,
	"processed_at" timestamp,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"total_products" integer DEFAULT 0,
	"products_found" integer DEFAULT 0,
	"violations_found" integer DEFAULT 0,
	"error_message" text,
	"triggered_by" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"slot_hour" integer,
	"plataforma" varchar(32) DEFAULT 'mercadolivre',
	"cliente_id" integer
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"seller_name" varchar(255) NOT NULL,
	"seller_id" varchar(64),
	"cliente_id" integer,
	"ml_item_id" varchar(64),
	"ml_title" text,
	"ml_url" text,
	"ml_thumbnail" text,
	"plataforma" varchar(32) DEFAULT 'mercadolivre',
	"preco_anunciado" numeric(10, 2) NOT NULL,
	"preco_minimo" numeric(10, 2) NOT NULL,
	"is_violation" boolean DEFAULT false NOT NULL,
	"validation_reason" varchar(255),
	"confianca" integer DEFAULT 0,
	"metodo_match" varchar(64),
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(32) NOT NULL,
	"descricao" text NOT NULL,
	"ean" varchar(20),
	"unidade" varchar(10),
	"caixa" integer,
	"voltagem" varchar(20),
	"ncm" varchar(20),
	"preco_custo" numeric(10, 2) NOT NULL,
	"preco_minimo" numeric(10, 2) NOT NULL,
	"margem_percent" numeric(5, 2) DEFAULT '60.00' NOT NULL,
	"status_base" varchar(20) DEFAULT 'ATIVO',
	"categoria" varchar(64),
	"linha" varchar(20),
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "tracked_listing_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracked_listing_id" integer NOT NULL,
	"run_id" integer,
	"check_source" varchar(50) NOT NULL,
	"observed_title" text,
	"observed_price" numeric(12, 2),
	"observed_original_price" numeric(12, 2),
	"observed_currency" varchar(10) DEFAULT 'BRL',
	"observed_available" boolean,
	"evidence_url" text,
	"screenshot_url" text,
	"html_snapshot_url" text,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"violation_status" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ml_item_id" varchar(64) NOT NULL,
	"ml_url" text NOT NULL,
	"ml_title" text,
	"ml_thumbnail" text,
	"seller_id" varchar(64),
	"seller_nickname" varchar(255),
	"cliente_id" integer,
	"matched_product_id" integer,
	"matched_product_code" varchar(32),
	"match_confidence" integer DEFAULT 0,
	"match_method" varchar(64),
	"listing_status" varchar(30) DEFAULT 'novo' NOT NULL,
	"last_checked_at" timestamp,
	"last_price" numeric(10, 2),
	"last_violation_at" timestamp,
	"consecutive_violations" integer DEFAULT 0,
	"consecutive_ok" integer DEFAULT 0,
	"total_checks" integer DEFAULT 0,
	"source_ingestion_run_id" integer,
	"source_snapshot_id" integer,
	"promoted_at" timestamp,
	"inactivated_at" timestamp,
	"inactivation_reason" varchar(100),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_listings_ml_item_id_unique" UNIQUE("ml_item_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"plataforma" varchar(32) DEFAULT 'mercadolivre' NOT NULL,
	"vendedor_id" varchar(64),
	"nome" varchar(255) NOT NULL,
	"cliente_id" integer,
	"total_violacoes" integer DEFAULT 0,
	"total_anuncios" integer DEFAULT 0,
	"primeira_vez" timestamp,
	"ultima_vez" timestamp
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"seller_name" varchar(255) NOT NULL,
	"seller_id" varchar(64),
	"cliente_id" integer,
	"ml_item_id" varchar(64),
	"ml_url" text,
	"ml_thumbnail" text,
	"ml_title" text,
	"plataforma" varchar(32) DEFAULT 'mercadolivre',
	"preco_anunciado" numeric(10, 2) NOT NULL,
	"preco_minimo" numeric(10, 2) NOT NULL,
	"diferenca" numeric(10, 2) NOT NULL,
	"percent_abaixo" numeric(5, 2) NOT NULL,
	"confianca" integer DEFAULT 0,
	"metodo_match" varchar(64),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"notified_at" timestamp,
	"resolved_at" timestamp,
	"resolved_by" varchar(255),
	"notes" text,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
