-- ============================================================
-- ASX Price Monitor — Scripts SQL para Supabase
-- Gerado em: 09/03/2026
-- Execute no SQL Editor do Supabase em ordem (1 → 4)
-- ============================================================

-- ============================================================
-- SCRIPT 1: Colunas novas (se ainda não existirem)
-- ============================================================

-- Coluna slotHour em monitoring_runs (adicionada pelo Scheduler v5)
ALTER TABLE monitoring_runs ADD COLUMN IF NOT EXISTS slotHour INT DEFAULT NULL;

-- Coluna linkLoja em clientes (adicionada para URL alternativa da loja ML)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS linkLoja VARCHAR(512) DEFAULT NULL;

-- ============================================================
-- SCRIPT 2: Índices de Performance (OBRIGATÓRIO para produção)
-- Sem estes índices, as queries de dashboard serão full table scans
-- ============================================================

-- violations — tabela mais consultada no dashboard
CREATE INDEX IF NOT EXISTS idx_violations_detected_at  ON violations(detectedAt);
CREATE INDEX IF NOT EXISTS idx_violations_seller_id    ON violations(sellerId);
CREATE INDEX IF NOT EXISTS idx_violations_product_id   ON violations(productId);
CREATE INDEX IF NOT EXISTS idx_violations_run_id       ON violations(runId);
CREATE INDEX IF NOT EXISTS idx_violations_cliente_id   ON violations(clienteId);
CREATE INDEX IF NOT EXISTS idx_violations_status       ON violations(status);

-- price_snapshots — consultada nos gráficos de histórico de preços
CREATE INDEX IF NOT EXISTS idx_snapshots_product_id    ON price_snapshots(productId);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at   ON price_snapshots(capturedAt);
CREATE INDEX IF NOT EXISTS idx_snapshots_seller_id     ON price_snapshots(sellerId);

-- monitoring_runs — consultada no histórico de execuções e gráficos por turno
CREATE INDEX IF NOT EXISTS idx_runs_started_at         ON monitoring_runs(startedAt);
CREATE INDEX IF NOT EXISTS idx_runs_status             ON monitoring_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_slot_hour          ON monitoring_runs(slotHour);

-- historico_precos — consultada nos relatórios de histórico por produto/vendedor
CREATE INDEX IF NOT EXISTS idx_historico_codigo_asx    ON historico_precos(codigoAsx);
CREATE INDEX IF NOT EXISTS idx_historico_data_captura  ON historico_precos(dataCaptura);
CREATE INDEX IF NOT EXISTS idx_historico_vendedor      ON historico_precos(vendedor);

-- products — consultada em filtros por categoria e linha
CREATE INDEX IF NOT EXISTS idx_products_categoria      ON products(categoria);
CREATE INDEX IF NOT EXISTS idx_products_linha          ON products(linha);
CREATE INDEX IF NOT EXISTS idx_products_ativo          ON products(ativo);

-- clientes — consultada no scraper e na listagem
CREATE INDEX IF NOT EXISTS idx_clientes_seller_id      ON clientes(sellerId);
CREATE INDEX IF NOT EXISTS idx_clientes_status         ON clientes(status);

-- ============================================================
-- SCRIPT 3: Integridade Referencial (Foreign Keys)
-- Adiciona FKs que o Drizzle não cria automaticamente sem .references()
-- ATENÇÃO: Execute apenas se as tabelas estiverem vazias ou com dados consistentes
-- ============================================================

-- violations → products
ALTER TABLE violations
  ADD CONSTRAINT IF NOT EXISTS fk_violations_product
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL;

-- violations → clientes
ALTER TABLE violations
  ADD CONSTRAINT IF NOT EXISTS fk_violations_cliente
  FOREIGN KEY (clienteId) REFERENCES clientes(id) ON DELETE SET NULL;

-- violations → monitoring_runs
ALTER TABLE violations
  ADD CONSTRAINT IF NOT EXISTS fk_violations_run
  FOREIGN KEY (runId) REFERENCES monitoring_runs(id) ON DELETE CASCADE;

-- price_snapshots → products
ALTER TABLE price_snapshots
  ADD CONSTRAINT IF NOT EXISTS fk_snapshots_product
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE;

-- price_snapshots → monitoring_runs
ALTER TABLE price_snapshots
  ADD CONSTRAINT IF NOT EXISTS fk_snapshots_run
  FOREIGN KEY (runId) REFERENCES monitoring_runs(id) ON DELETE CASCADE;

-- ============================================================
-- SCRIPT 4: RLS (Row Level Security)
-- IMPORTANTE: O projeto usa Manus OAuth (JWT próprio), NÃO o Supabase Auth.
-- As políticas abaixo são para o caso de migração futura para Supabase Auth.
-- Se continuar com Manus OAuth + backend tRPC, NÃO aplique RLS —
-- o controle de acesso já é feito pelo backend via adminProcedure/protectedProcedure.
--
-- Se quiser habilitar RLS para proteção extra na camada de banco,
-- descomente os blocos abaixo APENAS após configurar o Supabase Auth.
-- ============================================================

/*
-- Habilitar RLS nas tabelas sensíveis
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_configs    ENABLE ROW LEVEL SECURITY;

-- Política: apenas usuários autenticados podem ler
CREATE POLICY "authenticated_read_products"
  ON products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_violations"
  ON violations FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: apenas admins podem escrever
CREATE POLICY "admin_write_products"
  ON products FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_write_clientes"
  ON clientes FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_write_settings"
  ON app_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ml_credentials: apenas o owner pode ler/escrever (dados sensíveis)
CREATE POLICY "owner_only_ml_credentials"
  ON ml_credentials FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
*/

-- ============================================================
-- VERIFICAÇÃO FINAL
-- Execute para confirmar que os índices foram criados
-- ============================================================
SELECT
  TABLE_NAME,
  INDEX_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND INDEX_NAME LIKE 'idx_%'
ORDER BY TABLE_NAME, INDEX_NAME;
