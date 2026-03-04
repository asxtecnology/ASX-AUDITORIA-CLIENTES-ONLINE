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
