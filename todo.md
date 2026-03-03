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
