-- ============================================================================
-- Migração 004: UNIQUE constraint em vendedores + Índices de performance
-- Executar no Supabase SQL Editor: https://supabase.com/dashboard/project/qmmgureyatsgjafjlrxe/sql
-- Data: 2026-03-27
-- ============================================================================

-- 1. UNIQUE em vendedores.vendedor_id (necessário para ON CONFLICT DO UPDATE)
-- Primeiro verificar se já existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendedores_vendedor_id_unique'
  ) THEN
    ALTER TABLE vendedores ADD CONSTRAINT vendedores_vendedor_id_unique UNIQUE (vendedor_id);
    RAISE NOTICE 'UNIQUE constraint adicionada em vendedores.vendedor_id';
  ELSE
    RAISE NOTICE 'UNIQUE constraint já existe em vendedores.vendedor_id';
  END IF;
END $$;

-- 2. Índices de performance para queries frequentes

-- violations: busca por data (dashboard trend, filtros por período)
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON violations (detected_at DESC);

-- violations: busca por seller (filtro por vendedor)
CREATE INDEX IF NOT EXISTS idx_violations_seller_id ON violations (seller_id);

-- violations: busca por status (open/notified/resolved)
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations (status);

-- violations: busca por cliente
CREATE INDEX IF NOT EXISTS idx_violations_cliente_id ON violations (cliente_id);

-- violations: busca por produto
CREATE INDEX IF NOT EXISTS idx_violations_product_id ON violations (product_id);

-- price_snapshots: busca por produto + data
CREATE INDEX IF NOT EXISTS idx_snapshots_product_id ON price_snapshots (product_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at ON price_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_run_id ON price_snapshots (run_id);

-- monitoring_runs: busca por data
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON monitoring_runs (started_at DESC);

-- clientes: busca por status
CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes (status);
CREATE INDEX IF NOT EXISTS idx_clientes_seller_id ON clientes (seller_id);

-- tracked_listings: busca por status + última verificação
CREATE INDEX IF NOT EXISTS idx_tracked_listing_status ON tracked_listings (listing_status);
CREATE INDEX IF NOT EXISTS idx_tracked_last_checked ON tracked_listings (last_checked_at);
CREATE INDEX IF NOT EXISTS idx_tracked_ml_item_id ON tracked_listings (ml_item_id);

-- ml_listing_snapshots: busca por ingestion run
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_run_id ON ml_listing_snapshots (ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_ml_item_id ON ml_listing_snapshots (ml_item_id);

-- match_review_queue: busca por status pendente
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON match_review_queue (status);

-- historico_precos: busca por código ASX
CREATE INDEX IF NOT EXISTS idx_historico_codigo_asx ON historico_precos (codigo_asx);

-- ============================================================================
-- Verificação final
-- ============================================================================
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
