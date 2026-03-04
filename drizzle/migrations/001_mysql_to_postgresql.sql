-- =====================================================
-- ASX Price Monitor — Migration: MySQL → PostgreSQL
-- Execute no SQL Editor do Supabase
-- SEM dependência de ENUM types (usa VARCHAR)
-- =====================================================

-- Adicionar constraint UNIQUE no vendedor_id (necessário para ON CONFLICT)
DO $$ BEGIN
  ALTER TABLE vendedores ADD CONSTRAINT vendedores_vendedor_id_unique UNIQUE (vendedor_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verificar que todas as tabelas existem

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  "openId" VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  "loginMethod" VARCHAR(64),
  role VARCHAR(20) DEFAULT 'user' NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "lastSignedIn" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  seller_id VARCHAR(64) NOT NULL UNIQUE,
  loja_ml VARCHAR(255),
  link_loja TEXT,
  status VARCHAR(20) DEFAULT 'ativo' NOT NULL,
  total_produtos INTEGER DEFAULT 0,
  total_violacoes INTEGER DEFAULT 0,
  ultima_verificacao TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(32) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  ean VARCHAR(20),
  unidade VARCHAR(10),
  caixa INTEGER,
  voltagem VARCHAR(20),
  ncm VARCHAR(20),
  preco_custo NUMERIC(10,2) NOT NULL,
  preco_minimo NUMERIC(10,2) NOT NULL,
  margem_percent NUMERIC(5,2) DEFAULT 60.00 NOT NULL,
  status_base VARCHAR(20) DEFAULT 'ATIVO',
  categoria VARCHAR(64),
  linha VARCHAR(20),
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'running' NOT NULL,
  total_products INTEGER DEFAULT 0,
  products_found INTEGER DEFAULT 0,
  violations_found INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by VARCHAR(20) DEFAULT 'scheduled' NOT NULL,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre',
  cliente_id INTEGER
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  seller_name VARCHAR(255) NOT NULL,
  seller_id VARCHAR(64),
  cliente_id INTEGER,
  ml_item_id VARCHAR(64),
  ml_title TEXT,
  ml_url TEXT,
  ml_thumbnail TEXT,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre',
  preco_anunciado NUMERIC(10,2) NOT NULL,
  preco_minimo NUMERIC(10,2) NOT NULL,
  is_violation BOOLEAN DEFAULT FALSE NOT NULL,
  validation_reason VARCHAR(255),
  confianca INTEGER DEFAULT 0,
  metodo_match VARCHAR(64),
  captured_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS violations (
  id SERIAL PRIMARY KEY,
  snapshot_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  seller_name VARCHAR(255) NOT NULL,
  seller_id VARCHAR(64),
  cliente_id INTEGER,
  ml_item_id VARCHAR(64),
  ml_url TEXT,
  ml_thumbnail TEXT,
  ml_title TEXT,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre',
  preco_anunciado NUMERIC(10,2) NOT NULL,
  preco_minimo NUMERIC(10,2) NOT NULL,
  diferenca NUMERIC(10,2) NOT NULL,
  percent_abaixo NUMERIC(5,2) NOT NULL,
  confianca INTEGER DEFAULT 0,
  metodo_match VARCHAR(64),
  status VARCHAR(20) DEFAULT 'open' NOT NULL,
  notified_at TIMESTAMP,
  resolved_at TIMESTAMP,
  detected_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS historico_precos (
  id SERIAL PRIMARY KEY,
  codigo_asx VARCHAR(32) NOT NULL,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre' NOT NULL,
  vendedor VARCHAR(255) NOT NULL,
  item_id VARCHAR(64),
  preco NUMERIC(10,2) NOT NULL,
  data_captura DATE NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vendedores (
  id SERIAL PRIMARY KEY,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre' NOT NULL,
  vendedor_id VARCHAR(64) UNIQUE,
  nome VARCHAR(255) NOT NULL,
  cliente_id INTEGER,
  total_violacoes INTEGER DEFAULT 0,
  total_anuncios INTEGER DEFAULT 0,
  primeira_vez TIMESTAMP DEFAULT NOW(),
  ultima_vez TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_configs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  name VARCHAR(255),
  active BOOLEAN DEFAULT TRUE NOT NULL,
  notify_on_violation BOOLEAN DEFAULT TRUE NOT NULL,
  notify_on_run_complete BOOLEAN DEFAULT FALSE NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(64) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Se as tabelas já existem com colunas ENUM, converter para VARCHAR
DO $$ BEGIN ALTER TABLE products ALTER COLUMN linha TYPE VARCHAR(20) USING linha::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE violations ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE monitoring_runs ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE monitoring_runs ALTER COLUMN triggered_by TYPE VARCHAR(20) USING triggered_by::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE clientes ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::VARCHAR; EXCEPTION WHEN others THEN NULL; END $$;

SELECT 'Migration concluída com sucesso!' AS resultado;
