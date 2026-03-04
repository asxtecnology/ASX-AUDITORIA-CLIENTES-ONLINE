CREATE TABLE "alert_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"emailsDestinatarios" text,
	"frequencia" varchar(50) DEFAULT 'immediate',
	"minViolacoes" integer DEFAULT 1,
	"incluirResumo" boolean DEFAULT true,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255),
	"telefone" varchar(50),
	"lojaML" varchar(255),
	"sellerId" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'ativo' NOT NULL,
	"totalProdutos" integer DEFAULT 0,
	"totalViolacoes" integer DEFAULT 0,
	"ultimaVerificacao" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_sellerId_unique" UNIQUE("sellerId")
);
--> statement-breakpoint
CREATE TABLE "historico_precos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo_asx" varchar(32) NOT NULL,
	"item_id" varchar(64),
	"vendedor" varchar(255) NOT NULL,
	"preco" numeric(10, 2) NOT NULL,
	"plataforma" varchar(50) DEFAULT 'mercadolivre' NOT NULL,
	"data_captura" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"clienteId" integer,
	"plataforma" varchar(50) DEFAULT 'mercadolivre',
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp,
	"totalFound" integer DEFAULT 0,
	"totalViolations" integer DEFAULT 0,
	"triggeredBy" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"clienteId" integer,
	"runId" integer NOT NULL,
	"mlItemId" varchar(50),
	"mlTitle" text,
	"mlUrl" text,
	"mlThumbnail" text,
	"sellerId" varchar(50),
	"sellerName" varchar(200),
	"precoAnunciado" numeric(10, 2) NOT NULL,
	"precoMinimo" numeric(10, 2),
	"plataforma" varchar(50) DEFAULT 'mercadolivre',
	"isViolation" boolean DEFAULT false,
	"metodoMatch" varchar(50),
	"confianca" integer DEFAULT 0,
	"validationReason" text,
	"capturedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(32) NOT NULL,
	"descricao" text NOT NULL,
	"ean" varchar(20),
	"categoria" varchar(64),
	"linha" varchar(64),
	"precoCusto" numeric(10, 2) DEFAULT '0' NOT NULL,
	"precoMinimo" numeric(10, 2) DEFAULT '0' NOT NULL,
	"margemPercent" numeric(5, 2) DEFAULT '60' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(10) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer,
	"vendedor_id" varchar(100),
	"nome" varchar(200) NOT NULL,
	"plataforma" varchar(50) DEFAULT 'mercadolivre' NOT NULL,
	"total_anuncios" integer DEFAULT 0,
	"total_violacoes" integer DEFAULT 0,
	"primeira_vez" timestamp DEFAULT now(),
	"ultima_vez" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer,
	"clienteId" integer,
	"runId" integer,
	"snapshotId" integer,
	"mlItemId" varchar(50),
	"mlTitle" text,
	"mlUrl" text,
	"mlThumbnail" text,
	"sellerId" varchar(50),
	"sellerName" varchar(200),
	"precoAnunciado" numeric(10, 2),
	"precoMinimo" numeric(10, 2),
	"diferenca" numeric(10, 2),
	"percentAbaixo" numeric(5, 2),
	"plataforma" varchar(50) DEFAULT 'mercadolivre',
	"metodoMatch" varchar(50),
	"confianca" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp,
	"resolvedBy" varchar(200),
	"notes" text
);
