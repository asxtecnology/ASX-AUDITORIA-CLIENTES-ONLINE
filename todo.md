# ASX Price Monitor - TODO

## Fase 1: Banco de Dados e Estrutura Base
- [x] Criar schema: products, monitoring_runs, price_snapshots, violations, alert_configs, settings
- [x] Rodar db:push para criar tabelas

## Fase 2: Backend (tRPC Routers)
- [x] Router: products (list, get, create, update, toggleActive, import)
- [x] Router: monitoring (runNow, getHistory, getStats, getViolations)
- [x] Router: violations (list, getByProduct, getByPeriod)
- [x] Router: alerts (getConfig, updateConfig, testAlert)
- [x] Router: settings (get, update)
- [x] Serviço: ML scraper integrado no backend
- [x] Job: agendamento diário 14h

## Fase 3: Frontend - Layout e Dashboard
- [x] DashboardLayout com sidebar (Dashboard, Catálogo, Histórico, Alertas, Configurações)
- [x] Página Dashboard: KPIs, gráfico de violações, tabela de violações recentes
- [x] Tema escuro/profissional com paleta azul/cinza

## Fase 4: Páginas Adicionais
- [x] Página Catálogo: tabela de produtos, filtros, upload CSV, edição inline
- [x] Página Histórico: timeline de monitoramentos, gráficos de preço por produto
- [x] Página Alertas: configuração de email, destinatários, frequência
- [x] Página Configurações: margem %, horário scraper, critérios de validação

## Fase 5: Scraper e Alertas
- [x] Integrar ml_scraper.py como serviço Node.js/axios
- [x] Agendamento cron diário às 14h
- [x] Notificações por email via notifyOwner

## Fase 6: Importação e Testes
- [x] Importar 531 SKUs do catálogo ASX
- [x] Escrever testes vitest (11 testes passando)
- [x] Exportação CSV de violações
- [x] Checkpoint final e entrega

## v2.0 — Melhorias (COMANDO_MELHORIA_MANUS.md)

### Fase 1: Banco de Dados
- [ ] Nova tabela: clientes (seller_id, nome, loja_ml, link_loja, status)
- [ ] Nova tabela: historico_precos (codigo_asx, plataforma, vendedor, item_id, preco, data)
- [ ] Nova tabela: vendedores (plataforma, vendedor_id, nome, cliente_id, total_violacoes)
- [ ] Adicionar colunas em anuncios: confianca, metodo_match, cliente_id, thumbnail
- [ ] Rodar db:push

### Fase 2: Scraper v2 + Seed Clientes
- [ ] Extrair seller_id da LS DISTRIBUIDORA via API ML (item MLB5770989382)
- [ ] Seed dos 8 clientes no banco
- [ ] Refazer mlScraper: busca por seller_id + busca geral
- [ ] Sistema de confiança 0-100 (EAN=100, código=95, linha+bulbo=85, marca+bulbo=70, só marca=50)
- [ ] Deduplicação por item_id
- [ ] Retry com backoff exponencial (429: 5s, 10s, 20s)
- [ ] Delay 1.5s entre requests

### Fase 3: Aba Clientes Monitorados
- [ ] Cards por cliente (nome, produtos ASX, violações, última verificação)
- [ ] Botão "Verificar Agora" individual por cliente
- [ ] Modal de detalhamento: lista anúncios do cliente vs preço mínimo
- [ ] Indicadores visuais: verde/amarelo/vermelho
- [ ] Formulário adicionar/editar/remover cliente

### Fase 4: Aba Vendedores
- [ ] Ranking top 10 violadores (gráfico barras horizontal)
- [ ] Tabela: total violações, produtos violados, primeira/última violação
- [ ] Badge: cliente cadastrado vs desconhecido

### Fase 5: Melhorias nas abas existentes
- [ ] Dashboard: card "Clientes Monitorados", pizza "Violações por Cliente", card "Vendedores Não Cadastrados"
- [ ] Violações: coluna Cliente, coluna Confiança (barra visual), exportar CSV funcional, filtros por cliente/categoria/data
- [ ] Catálogo: coluna Categoria, coluna Linha (PREMIUM/PLUS/ECO), filtros
- [ ] Histórico: gráfico evolução violações, gráfico barras por execução
- [ ] Configurações: slider confiança mínima, checkboxes plataformas, campo delay

### Fase 6: Modal Detalhe Produto + Testes
- [ ] Modal ao clicar em código ASX: info produto + gráfico histórico preços + lista anúncios
- [ ] Testes vitest v2.0 (sistema de confiança, deduplicação, categorização)

## Fixes urgentes aplicados (FIX_ERROS_MANUS)
- [x] Schema verificado: violations.detected_at existe com defaultNow()
- [x] Backend: monitoring.latest retorna null (nunca undefined) via ?? null
- [x] Backend: getViolationTrend verifica count antes de executar SQL raw
- [x] Backend: todas as rotas retornam array vazio ou null-safe
- [x] Frontend: Dashboard já tinha ?? em todos os campos (stats?.open ?? 0, etc.)
- [x] Servidor reiniciado, cache Vite limpo
- [x] 11 testes vitest passando

## Fix: Scraper não detecta violações reais (LS Distribuidora)
- [ ] Buscar seller_id numérico real da LS Distribuidora via API ML
- [ ] Atualizar seller_id no banco (de slug para número)
- [ ] Corrigir scraper: validar que seller_id é numérico antes de buscar
- [ ] Corrigir lógica de comparação preço anunciado vs preço mínimo
- [ ] Corrigir matching de produtos: buscar por keywords mais amplas (não só "ASX")
- [ ] Testar e confirmar violação detectada para LS Distribuidora

## Migração Supabase PostgreSQL (ZIP 21 arquivos Claude)
- [x] Extrair e analisar ZIP com 21 arquivos corrigidos
- [x] Instalar dependência postgres-js e remover mysql2
- [x] Reescrever drizzle/schema.ts para PostgreSQL (schema real do Supabase)
- [x] Adaptar server/db.ts para usar SUPABASE_URL com fallback
- [x] Corrigir server/mlScraper.ts (campos totalFound/totalViolations)
- [x] Corrigir server/routers.ts (schema alerts e products)
- [x] Corrigir client/src/pages/History.tsx (campos totalFound/totalViolations)
- [x] Corrigir client/src/pages/Settings.tsx (campo description removido do DB)
- [x] Corrigir client/src/pages/Alerts.tsx (campos ativo/emailsDestinatarios/incluirResumo)
- [x] Corrigir client/src/pages/Clientes.tsx (linkLoja opcional)
- [x] Configurar SUPABASE_URL como variável de ambiente
- [x] 24/24 testes vitest passando
- [x] 0 erros TypeScript

## ZIP v4 Final (22 arquivos Claude)
- [x] Corrigir bug crítico: ONE_YEAR_MS → SESSION_MAX_AGE_MS (sdk.ts + const.ts)
- [x] Aplicar mlScraper.ts v2 (async correto, .returning(), error handling)
- [x] Aplicar server/db.ts atualizado
- [x] Aplicar server/routers.ts (rate limiter, adminProcedure)
- [x] Aplicar server/asx.test.ts (+14 testes)
- [x] Aplicar shared/const.ts (SESSION_MAX_AGE_MS)
- [x] Aplicar client/src/lib/format.ts (novo utilitário)
- [x] Aplicar client/src/hooks/useAdmin.ts (novo hook)
- [x] Aplicar páginas frontend (Dashboard, Violations, Catalog, Clientes, Vendedores, Settings, Alerts)
- [x] Corrigir History.tsx (totalFound → productsFound, totalViolations → violationsFound)
- [x] 24/24 testes vitest passando, 0 erros TypeScript

## ZIP v5 (23 arquivos - context.ts mock dev)
- [x] Aplicar context.ts com mock de usuário admin para desenvolvimento
- [x] Aplicar todos os 23 arquivos do ZIP v5
- [x] 0 erros TypeScript
- [x] 24/24 testes vitest passando

## ZIP v6 (25 arquivos - Revendedores + SSL fix)
- [x] Aplicar 25 arquivos (Clientes→Revendedores, SSL fix, seed SQL)
- [ ] Executar seed 002_seed_revendedores.sql no Supabase (manual - SQL Editor)
- [x] 0 erros TypeScript
- [x] 24/24 testes vitest passando

## Correção de Schema (erros de query Supabase)
- [x] Auditar colunas reais do Supabase (products, violations, monitoring_runs)
- [x] Corrigir drizzle/schema.ts para mapear colunas reais
- [x] Corrigir Alerts.tsx (active/name/email → ativo/emailsDestinatarios/incluirResumo)
- [x] Corrigir Catalog.tsx (precoCusto pode ser null)
- [x] Corrigir Settings.tsx (s.description → SETTING_LABELS[s.key]?.description)
- [x] Corrigir Clientes.tsx (remover linkLoja, link via lojaML)
- [x] Corrigir routers.ts (alerts upsert input → campos reais Supabase)
- [x] 24/24 testes vitest passando
- [x] 0 erros TypeScript

## ZIP v7 (25 arquivos - schema snake_case + SSL)
- [x] Aplicar 25 arquivos do ZIP v7
- [x] Corrigir History.tsx (totalFound/totalViolations → productsFound/violationsFound)
- [x] Corrigir asx.test.ts (require → import estático, categoria LAMPADA vs LED)
- [x] 0 erros TypeScript
- [x] 24/24 testes vitest passando

## Correção de Deploy (pnpm-lock.yaml divergente)
- [x] Regenerar pnpm-lock.yaml com pnpm install
- [x] 0 erros TypeScript após install
- [x] 24/24 testes passando
- [ ] Salvar checkpoint para publicar

## Correção Definitiva Schema + Deploy
- [x] Aplicar schema.ts, db.ts e drizzle.config.ts do ZIP v8 (Claude)
- [x] mysql2 já removido (não estava instalado), postgres já presente
- [x] Corrigir mlScraper.ts (remover campos inexistentes: plataforma, isViolation, validationReason, confianca/metodoMatch de priceSnapshots, clienteId de violations)
- [x] 0 erros TypeScript
- [x] 24/24 testes passando
- [ ] Salvar checkpoint

## Otimização de Deploy (timeout)
- [x] Aplicar code splitting no vite.config.ts (bundle: 1.3MB → 638KB)
- [x] 24/24 testes passando
- [ ] Salvar checkpoint e publicar

## Migrations Supabase Produção
- [ ] Auditar tabelas existentes no Supabase
- [ ] Criar tabelas faltantes (violations, monitoring_runs, etc.)
- [ ] Confirmar que todas as tabelas existem

## Patch asx-price-monitor-fixes.patch
- [x] Aplicar patch via git apply ou manualmente
- [x] Reiniciar servidor após patch
- [x] Atualizar testes vitest (confiança 85→95 para linha_bulbo_watts, metodoMatch bulbo)
- [x] 24/24 testes passando, 0 erros TypeScript
- [x] Testar 'Verificar Agora' na TECNO AUDIO — Scraper v4 executado com sucesso:
  - LS DISTRIBUIDORA: 35 produtos, 20 violações
  - CSR PARTS: 18 produtos, 8 violações
  - BERTO PARTS: 8 produtos, 8 violações
  - EXTREME AUDIO: 0 produtos (sellerId incorreto, pendente)
  - ACESSORIOS P/ CAMINHAO: 1 produto, 1 violação
  - COMBAT SOM: 3 produtos, 0 violações
  - TECNO AUDIO: 0 produtos (sellerId incorreto, pendente)
  - Fase2 (busca geral): concluída
  - Total: 115 anúncios encontrados, 76 violações detectadas

## Correções Clientes.tsx (04/03/2026)
- [x] Correção 1: Layout dos botões de ação no ClienteCard (grid grid-cols-3 gap-2)
- [x] Correção 2: Função buildClienteStoreUrl — prioridade sellerId numérico (_CustId_) primeiro, ignorar URLs /perfil/

## Campo linkLoja no formulário (04/03/2026)
- [x] Adicionar campo "Link da Loja" ao ClienteForm (input linkLoja)
- [x] Garantir que linkLoja seja enviado no handleSave e salvo pelo procedure upsert

## Integração API Oficial Mercado Livre (05/03/2026)
- [x] Tabela ml_credentials criada no banco MySQL via SQL direto
- [x] Funções CRUD no db.ts: getMlCredentials, saveMlCredentials, updateMlTokens, deleteMlCredentials
- [x] Router tRPC ml: getCredentials, saveCredentials, getAuthUrl, exchangeCode, refreshToken, deleteCredentials
- [x] Página MercadoLivre.tsx com interface OAuth completa (3 passos: App ID/Secret → Autorizar → Conectado)
- [x] Item de navegação "Mercado Livre" adicionado na sidebar (ShoppingBag icon)
- [x] Rota /ml adicionada no App.tsx
- [x] mlScraper.ts: getMlAccessToken() com cache + auto-refresh
- [x] mlScraper.ts: fetchSellerItemsViaApi() — busca todos anúncios do seller via API oficial
- [x] mlScraper.ts: searchItemsViaApi() — busca por query via API oficial
- [x] Fase 1 do scraper usa API oficial quando token válido, fallback HTML quando não
- [x] 24/24 testes passando, 0 erros TypeScript
- [ ] Configurar App ML no Mercado Livre Developers (usuário)
- [ ] Inserir App ID e Client Secret na página /ml
- [ ] Completar fluxo OAuth e testar busca via API oficial

## Novo Revendedor: PLANETA DO CARBURADOR (06/03/2026)
- [x] Inserir PLANETA DO CARBURADOR (sellerId: 632372681, lojaML: planetadocarburadorr8181) na base

## API Pública ML sem autenticação (06/03/2026)
- [x] Implementar fetchSellerItemsPublicApi() usando GET /sites/MLB/search?seller_id={id} (sem token)
- [x] Implementar searchItemsPublicApi() usando GET /sites/MLB/search?q={query}&seller_id={id} (sem token)
- [x] Fase 1: prioridade 1º API pública, 2º API oficial (token), 3º scraping HTML
- [x] Fase 2: usa searchItemsPublicApi() em vez de scraping HTML
- [x] 24/24 testes passando, 0 erros TypeScript
- [ ] Testar em produção (sandbox bloqueado pelo ML) após publicar

## Reset + Agendamento + Gráficos por Horário (06/03/2026)
- [ ] Zerar violations, price_snapshots e monitoring_runs no banco
- [ ] Executar nova verificação completa
- [ ] Agendar verificações diárias às 10h e 16h (America/Sao_Paulo)
- [ ] Criar dois gráficos no dashboard: 10h e 16h separados
- [ ] Adicionar slot_hour (10 ou 16) nos monitoring_runs para identificar o turno

## Remoção de Produtos por Palavra-chave (06/03/2026)
- [x] Remover produtos com "chicote" (103), "bateria" (4) e "mostruario" (1) no nome — 108 produtos removidos, catálogo agora com 423 SKUs

## Atualização Revendedores (06/03/2026)
- [x] Atualizar EXTREME AUDIO: sellerId 186722996 → 188510514, lojaML extremeaudio (extraído da página ML)
- [x] Remover TECNO AUDIO da base (sellerId era MLB3058625923 inválido)
- [x] Atualizar LS DISTRIBUIDORA: sellerId "ls-distribuidora" → 26540544 (extraído da página ML)
