-- ============================================================================
-- ASX Price Monitor - Schema Completo (todas as 16 tabelas)
-- Projeto Supabase: twxqhonyyojvnpmxeyca
-- Executar no SQL Editor: https://supabase.com/dashboard/project/twxqhonyyojvnpmxeyca/sql
-- ============================================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  "openId" VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  "loginMethod" VARCHAR(64),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSignedIn" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. CLIENTES (Revendedores Monitorados)
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  loja_ml VARCHAR(255),
  link_loja TEXT,
  email VARCHAR(320),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  total_produtos INTEGER DEFAULT 0,
  total_violacoes INTEGER DEFAULT 0,
  ultima_verificacao TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. PRODUCTS (Catalogo ASX)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(32) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  ean VARCHAR(20),
  unidade VARCHAR(10),
  caixa INTEGER,
  voltagem VARCHAR(20),
  ncm VARCHAR(20),
  preco_custo DECIMAL(10,2) NOT NULL,
  preco_minimo DECIMAL(10,2) NOT NULL,
  margem_percent DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  status_base VARCHAR(20) DEFAULT 'ATIVO',
  categoria VARCHAR(64),
  linha VARCHAR(20),
  ativo BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. MONITORING RUNS
CREATE TABLE IF NOT EXISTS monitoring_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  total_products INTEGER DEFAULT 0,
  products_found INTEGER DEFAULT 0,
  violations_found INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  slot_hour INTEGER,
  plataforma VARCHAR(32) DEFAULT 'mercadolivre',
  cliente_id INTEGER
);

-- 5. PRICE SNAPSHOTS
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
  preco_anunciado DECIMAL(10,2) NOT NULL,
  preco_minimo DECIMAL(10,2) NOT NULL,
  is_violation BOOLEAN NOT NULL DEFAULT false,
  validation_reason VARCHAR(255),
  confianca INTEGER DEFAULT 0,
  metodo_match VARCHAR(64),
  captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. VIOLATIONS
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
  preco_anunciado DECIMAL(10,2) NOT NULL,
  preco_minimo DECIMAL(10,2) NOT NULL,
  diferenca DECIMAL(10,2) NOT NULL,
  percent_abaixo DECIMAL(5,2) NOT NULL,
  confianca INTEGER DEFAULT 0,
  metodo_match VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  notified_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(255),
  notes TEXT,
  detected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. HISTORICO DE PRECOS
CREATE TABLE IF NOT EXISTS historico_precos (
  id SERIAL PRIMARY KEY,
  codigo_asx VARCHAR(32) NOT NULL,
  plataforma VARCHAR(32) NOT NULL DEFAULT 'mercadolivre',
  vendedor VARCHAR(255) NOT NULL,
  item_id VARCHAR(64),
  preco DECIMAL(10,2) NOT NULL,
  data_captura VARCHAR(10) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. VENDEDORES (Ranking)
CREATE TABLE IF NOT EXISTS vendedores (
  id SERIAL PRIMARY KEY,
  plataforma VARCHAR(32) NOT NULL DEFAULT 'mercadolivre',
  vendedor_id VARCHAR(64) UNIQUE,
  nome VARCHAR(255) NOT NULL,
  cliente_id INTEGER,
  total_violacoes INTEGER DEFAULT 0,
  total_anuncios INTEGER DEFAULT 0,
  primeira_vez TIMESTAMP,
  ultima_vez TIMESTAMP
);

-- 9. ALERT CONFIGS
CREATE TABLE IF NOT EXISTS alert_configs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT true,
  notify_on_violation BOOLEAN NOT NULL DEFAULT true,
  notify_on_run_complete BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 10. ML CREDENTIALS (OAuth Mercado Livre)
CREATE TABLE IF NOT EXISTS ml_credentials (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL,
  client_secret VARCHAR(128) NOT NULL,
  site_id VARCHAR(8) NOT NULL DEFAULT 'MLB',
  redirect_uri VARCHAR(512),
  access_token TEXT,
  refresh_token TEXT,
  token_type VARCHAR(32) DEFAULT 'Bearer',
  expires_at TIMESTAMP,
  scope TEXT,
  ml_user_id VARCHAR(64),
  ml_nickname VARCHAR(128),
  ml_email VARCHAR(320),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. ML INGESTION RUNS
CREATE TABLE IF NOT EXISTS ml_ingestion_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  source_version VARCHAR(32),
  cliente_id INTEGER,
  seller_nickname VARCHAR(255),
  seller_id VARCHAR(64),
  total_listings INTEGER DEFAULT 0,
  processed_listings INTEGER DEFAULT 0,
  violations_found INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  api_key_used VARCHAR(64)
);

-- 12. ML LISTING SNAPSHOTS
CREATE TABLE IF NOT EXISTS ml_listing_snapshots (
  id SERIAL PRIMARY KEY,
  ingestion_run_id INTEGER NOT NULL,
  cliente_id INTEGER,
  seller_id VARCHAR(64),
  seller_nickname VARCHAR(255),
  ml_item_id VARCHAR(64) NOT NULL,
  ml_title TEXT NOT NULL,
  ml_url TEXT NOT NULL,
  ml_thumbnail TEXT,
  screenshot_url TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  currency VARCHAR(8) DEFAULT 'BRL',
  matched_product_id INTEGER,
  matched_product_code VARCHAR(32),
  match_confidence INTEGER DEFAULT 0,
  match_method VARCHAR(64),
  preco_minimo DECIMAL(10,2),
  is_violation BOOLEAN DEFAULT false,
  violation_id INTEGER,
  processed_at TIMESTAMP,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 13. APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(64) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 14. TRACKED LISTINGS
CREATE TABLE IF NOT EXISTS tracked_listings (
  id SERIAL PRIMARY KEY,
  ml_item_id VARCHAR(64) NOT NULL UNIQUE,
  ml_url TEXT NOT NULL,
  ml_title TEXT,
  ml_thumbnail TEXT,
  seller_id VARCHAR(64),
  seller_nickname VARCHAR(255),
  cliente_id INTEGER,
  matched_product_id INTEGER,
  matched_product_code VARCHAR(32),
  match_confidence INTEGER DEFAULT 0,
  match_method VARCHAR(64),
  listing_status VARCHAR(30) NOT NULL DEFAULT 'novo',
  last_checked_at TIMESTAMP,
  last_price DECIMAL(10,2),
  last_violation_at TIMESTAMP,
  consecutive_violations INTEGER DEFAULT 0,
  consecutive_ok INTEGER DEFAULT 0,
  total_checks INTEGER DEFAULT 0,
  source_ingestion_run_id INTEGER,
  source_snapshot_id INTEGER,
  promoted_at TIMESTAMP,
  inactivated_at TIMESTAMP,
  inactivation_reason VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 15. TRACKED LISTING CHECKS
CREATE TABLE IF NOT EXISTS tracked_listing_checks (
  id SERIAL PRIMARY KEY,
  tracked_listing_id INTEGER NOT NULL,
  run_id INTEGER,
  check_source VARCHAR(50) NOT NULL,
  observed_title TEXT,
  observed_price DECIMAL(12,2),
  observed_original_price DECIMAL(12,2),
  observed_currency VARCHAR(10) DEFAULT 'BRL',
  observed_available BOOLEAN,
  evidence_url TEXT,
  screenshot_url TEXT,
  html_snapshot_url TEXT,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  violation_status VARCHAR(30),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 16. MATCH REVIEW QUEUE
CREATE TABLE IF NOT EXISTS match_review_queue (
  id SERIAL PRIMARY KEY,
  tracked_listing_id INTEGER NOT NULL,
  snapshot_id INTEGER,
  suggested_product_id INTEGER,
  confidence DECIMAL(5,2),
  reason VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  decision_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDICES DE PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON violations (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_seller_id ON violations (seller_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations (status);
CREATE INDEX IF NOT EXISTS idx_violations_cliente_id ON violations (cliente_id);
CREATE INDEX IF NOT EXISTS idx_violations_product_id ON violations (product_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_product_id ON price_snapshots (product_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at ON price_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_run_id ON price_snapshots (run_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON monitoring_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes (status);
CREATE INDEX IF NOT EXISTS idx_clientes_seller_id ON clientes (seller_id);
CREATE INDEX IF NOT EXISTS idx_tracked_listing_status ON tracked_listings (listing_status);
CREATE INDEX IF NOT EXISTS idx_tracked_last_checked ON tracked_listings (last_checked_at);
CREATE INDEX IF NOT EXISTS idx_tracked_ml_item_id ON tracked_listings (ml_item_id);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_run_id ON ml_listing_snapshots (ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_ml_item_id ON ml_listing_snapshots (ml_item_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON match_review_queue (status);
CREATE INDEX IF NOT EXISTS idx_historico_codigo_asx ON historico_precos (codigo_asx);

-- ============================================================================
-- SEED: Revendedores Monitorados
-- ============================================================================
INSERT INTO clientes (nome, seller_id, loja_ml, status) VALUES
  ('ACESSORIOS PREMIUM', '1712320386', 'acessoriospremium', 'ativo'),
  ('BERTO PARTS', '255978756', 'bertoparts', 'ativo'),
  ('COMBATSOM', '287896166', 'combatsom', 'ativo'),
  ('CSRPARTS', '1229968748', 'csrparts', 'ativo'),
  ('EXTREME AUDIO', '188510514', 'extremeaudio', 'ativo'),
  ('IMPERIAL LEDS', '1116226805', 'imperialleds', 'ativo'),
  ('LIDER SOM', '1917431909', 'lidersom', 'ativo'),
  ('LS DISTRIBUIDORA', '26540544', 'ls-distribuidora', 'ativo'),
  ('PLANETA DO CARBURADOR', '632372681', 'planetadocarburadorr8181', 'ativo')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Verificacao final
-- ============================================================================
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
