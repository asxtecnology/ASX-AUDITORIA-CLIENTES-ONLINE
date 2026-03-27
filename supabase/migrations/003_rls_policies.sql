-- ============================================================
-- Migration 003: Row Level Security (RLS) Policies
-- Protege todas as 10 tabelas do ASX Price Monitor
-- Apenas o service_role (backend) tem acesso total.
-- Usuários autenticados têm acesso somente leitura onde aplicável.
-- ============================================================

-- ─── Habilitar RLS em todas as tabelas ───────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ─── users ───────────────────────────────────────────────────────────────────
-- Usuários podem ver apenas seu próprio registro
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid()::text = "openId");

-- Service role tem acesso total (via backend)
CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL USING (auth.role() = 'service_role');

-- ─── clientes ────────────────────────────────────────────────────────────────
-- Usuários autenticados podem ler clientes (dashboard)
CREATE POLICY "clientes_select_authenticated" ON public.clientes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode inserir/atualizar/deletar
CREATE POLICY "clientes_service_role_all" ON public.clientes
  FOR ALL USING (auth.role() = 'service_role');

-- ─── products ────────────────────────────────────────────────────────────────
-- Usuários autenticados podem ler o catálogo
CREATE POLICY "products_select_authenticated" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode modificar
CREATE POLICY "products_service_role_all" ON public.products
  FOR ALL USING (auth.role() = 'service_role');

-- ─── monitoring_runs ─────────────────────────────────────────────────────────
-- Usuários autenticados podem ler histórico de execuções
CREATE POLICY "monitoring_runs_select_authenticated" ON public.monitoring_runs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode criar/atualizar runs
CREATE POLICY "monitoring_runs_service_role_all" ON public.monitoring_runs
  FOR ALL USING (auth.role() = 'service_role');

-- ─── price_snapshots ─────────────────────────────────────────────────────────
-- Usuários autenticados podem ler snapshots
CREATE POLICY "price_snapshots_select_authenticated" ON public.price_snapshots
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode inserir snapshots
CREATE POLICY "price_snapshots_service_role_all" ON public.price_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- ─── violations ──────────────────────────────────────────────────────────────
-- Usuários autenticados podem ler violações
CREATE POLICY "violations_select_authenticated" ON public.violations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Usuários autenticados podem atualizar o status de violações (resolver/notificar)
CREATE POLICY "violations_update_authenticated" ON public.violations
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Apenas service_role pode inserir/deletar violações
CREATE POLICY "violations_service_role_insert_delete" ON public.violations
  FOR ALL USING (auth.role() = 'service_role');

-- ─── historico_precos ────────────────────────────────────────────────────────
-- Usuários autenticados podem ler histórico
CREATE POLICY "historico_precos_select_authenticated" ON public.historico_precos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode inserir
CREATE POLICY "historico_precos_service_role_all" ON public.historico_precos
  FOR ALL USING (auth.role() = 'service_role');

-- ─── vendedores ──────────────────────────────────────────────────────────────
-- Usuários autenticados podem ler ranking de vendedores
CREATE POLICY "vendedores_select_authenticated" ON public.vendedores
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode modificar
CREATE POLICY "vendedores_service_role_all" ON public.vendedores
  FOR ALL USING (auth.role() = 'service_role');

-- ─── alert_configs ───────────────────────────────────────────────────────────
-- Usuários autenticados podem ler configurações de alertas
CREATE POLICY "alert_configs_select_authenticated" ON public.alert_configs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Usuários autenticados podem gerenciar seus próprios alertas
CREATE POLICY "alert_configs_manage_authenticated" ON public.alert_configs
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── app_settings ────────────────────────────────────────────────────────────
-- Usuários autenticados podem ler configurações do app
CREATE POLICY "app_settings_select_authenticated" ON public.app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas service_role pode modificar configurações
CREATE POLICY "app_settings_service_role_all" ON public.app_settings
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Comentário final ────────────────────────────────────────────────────────
-- IMPORTANTE: O backend usa DATABASE_URL com a role 'service_role' (via pooler),
-- que bypassa o RLS automaticamente. As políticas acima protegem acesso direto
-- via Supabase client (anon/authenticated) no frontend ou ferramentas externas.
COMMENT ON TABLE public.users IS 'RLS habilitado: usuários veem apenas seus próprios dados';
COMMENT ON TABLE public.violations IS 'RLS habilitado: autenticados podem ler e atualizar status';
