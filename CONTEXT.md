# ASX Price Monitor - Contexto do Projeto

## O que e este projeto

Sistema de monitoramento automatico de precos de produtos ASX no Mercado Livre. Detecta violacoes de preco minimo (custo + 60% de margem) praticadas por revendedores/distribuidores. O sistema coleta anuncios via pipeline de ingestao externa, faz matching com o catalogo ASX (423 SKUs), rastreia anuncios conhecidos e gera alertas quando precos estao abaixo do minimo permitido.

**Proprietario:** ASX Tecnology
**Repositorio:** github.com/asxtecnology/ASX-AUDITORIA-CLIENTES-ONLINE

---

## Stack Tecnica

| Camada        | Tecnologia                                      |
|---------------|--------------------------------------------------|
| Frontend      | React 19 + TypeScript 5.9 + Tailwind CSS 4       |
| UI Components | Radix UI (shadcn/ui) + Recharts + Framer Motion  |
| Roteamento    | Wouter (client-side)                              |
| Backend       | Node.js 22 + Express + tRPC 11                   |
| ORM           | Drizzle ORM                                       |
| Banco de Dados| PostgreSQL (Supabase)                             |
| Autenticacao  | Manus OAuth + JWT (cookie de sessao)              |
| Scraper       | Cheerio (HTML) + Puppeteer (headless) + API ML    |
| Testes        | Vitest (37 testes)                                |
| Build         | Vite 7 + esbuild                                  |
| Package Mgr   | pnpm 10                                           |

---

## Arquitetura Geral

```
Browser / Extensao Chrome
        |
        v
  +-----------+     +------------------+     +---------------------+
  |  Frontend |---->|  Backend Express  |---->|  Supabase PostgreSQL|
  |  React 19 |     |  tRPC + REST API  |     |  14 tabelas         |
  |  Wouter   |     |  Drizzle ORM      |     |  RLS habilitado     |
  +-----------+     +------------------+     +---------------------+
                          |
                    +-----+------+
                    |            |
              +---------+  +---------+
              | Scraper |  |Ingestao |
              | ML API  |  |Pipeline |
              +---------+  +---------+
```

---

## Estrutura de Diretorios

```
client/
  src/
    pages/           Dashboard, Violations, Catalog, Clientes, History,
                     Alerts, Settings, MercadoLivre, BrowserCheck,
                     Ingestion, TrackedListings, ReviewQueue, Vendedores
    components/      DashboardLayout, UI (shadcn/ui), ErrorBoundary
    _core/hooks/     useAuth
    lib/             format.ts (utilitarios)
    hooks/           useAdmin.ts

server/
  _core/index.ts     Entry point: Express + Vite + endpoints REST + tRPC
  routers.ts         tRPC routers (products, monitoring, violations,
                     alerts, clientes, settings, vendedores, tracked, review)
  db.ts              Camada de acesso ao banco (Drizzle ORM, ~50 funcoes CRUD)
  mlScraper.ts       Scraper ML: OAuth token, API publica, matching, scheduler
  ingestionProcessor.ts   Processamento de lotes de anuncios externos
  trackedListingsProcessor.ts  Maquina de estados para anuncios rastreados
  context.ts         Contexto tRPC (autenticacao, user)

drizzle/
  schema.ts          Schema completo (14 tabelas PostgreSQL)

supabase/
  migrations/        003_rls_policies.sql (Row Level Security)

scripts/
  check-env.mjs      Validacao de variaveis de ambiente
  create-tracked-tables.mjs  Criacao de tabelas de tracking
  import_catalog.py  Importacao em massa do catalogo
  update-ml-token.mjs  Refresh de token OAuth ML

docs/
  architecture-audit.md  Auditoria de seguranca e performance
  deploy.md              Guia completo de deploy
  supabase-migrations.sql  Script legado de migracao
```

---

## Banco de Dados (14 tabelas)

### Tabelas Core
- **users** — Usuarios autenticados via Manus OAuth (role: user/admin)
- **products** — Catalogo ASX: 423 SKUs com codigo, descricao, EAN, precoCusto, precoMinimo, margemPercent (60%)
- **clientes** — Revendedores monitorados (8 ativos): nome, sellerId (numerico ML), lojaML, status
- **violations** — Violacoes detectadas: precoAnunciado vs precoMinimo, status (open/notified/resolved), confianca
- **monitoring_runs** — Historico de execucoes do scraper: status, totais, slotHour (10h/16h)
- **price_snapshots** — Captura de precos individuais por anuncio por execucao
- **alert_configs** — Configuracao de notificacoes por email
- **app_settings** — Configuracoes key-value (margem, horario scraper, etc)

### Tabelas ML
- **ml_credentials** — Credenciais OAuth do Mercado Livre (PKCE, tokens, status)
- **historico_precos** — Historico de precos por produto/vendedor/plataforma
- **vendedores** — Ranking de vendedores por total de violacoes

### Tabelas de Ingestao e Tracking
- **ml_ingestion_runs** — Sessoes de coleta em lote (fonte: extensao/agente/manual)
- **ml_listing_snapshots** — Anuncios individuais coletados (com evidencia screenshot)
- **tracked_listings** — Anuncios rastreados continuamente (estados: novo/monitorado/suspeito/violador/inativo)
- **tracked_listing_checks** — Verificacoes pontuais de anuncios rastreados
- **match_review_queue** — Fila de revisao de matches com baixa confianca (<80%)

---

## Fluxos Principais

### 1. Pipeline de Ingestao

```
Extensao Chrome / Agente Coletor
  -> POST /api/ingest/ml-listings (batch de anuncios)
  -> ingestionProcessor: validar API key, match com catalogo ASX, calcular violacao
  -> Salvar: ml_listing_snapshots + violations
  -> Opcional: promover para tracked_listings (monitoramento continuo)
```

### 2. Maquina de Estados (Tracked Listings)

```
novo -> (check OK) -> monitorado -> (violacao) -> suspeito -> (2a violacao) -> violador
                                                           -> (OK) -> monitorado
violador -> (manual) -> inativo
```

### 3. Scraper (Legado/Fallback)

```
Scheduler (10h, 16h) ou Manual
  -> Para cada revendedor ativo:
     1. API publica ML (seller_id)
     2. API oficial ML (com token OAuth)
     3. Scraping HTML (fallback)
  -> matchProduct() com sistema de confianca 0-100
  -> Detectar violacoes (preco < precoMinimo)
  -> Salvar snapshots e violations
```

### 4. Sistema de Confianca (Matching)

| Metodo              | Confianca |
|---------------------|-----------|
| EAN exato           | 100       |
| Codigo ASX exato    | 95        |
| Linha + bulbo + watts| 85       |
| Marca + bulbo       | 70        |
| Apenas marca        | 50        |

---

## Endpoints REST (fora do tRPC)

| Metodo | Rota                        | Descricao                                    |
|--------|-----------------------------|----------------------------------------------|
| POST   | /api/ingest/ml-listings     | Recebe lote de anuncios de agentes externos   |
| POST   | /api/ingest/ml-checks       | Recebe checks da extensao Chrome              |
| GET    | /api/tracked/recheck        | Lista anuncios que precisam de re-verificacao |
| GET    | /ml/callback                | Callback OAuth do Mercado Livre               |

---

## Rotas Frontend

| Path             | Pagina            | Descricao                                    |
|------------------|--------------------|----------------------------------------------|
| /                | Dashboard          | KPIs, graficos de tendencia, violacoes recentes|
| /violations      | Violations         | Lista de violacoes com filtros e status       |
| /revendedores    | Clientes           | Cards de revendedores monitorados             |
| /catalog         | Catalog            | Catalogo de produtos ASX (423 SKUs)           |
| /history         | History            | Historico de monitoramentos e snapshots       |
| /alerts          | Alerts             | Configuracao de alertas por email             |
| /settings        | Settings           | Configuracoes gerais do sistema               |
| /ml              | MercadoLivre       | Setup OAuth Mercado Livre                     |
| /browser-check   | BrowserCheck       | Verificacao via browser (bypass bloqueio IP)  |
| /ingestion       | Ingestion          | Historico de ingestoes e extensao Chrome      |
| /tracked         | TrackedListings    | Anuncios rastreados continuamente             |
| /review          | ReviewQueue        | Fila de revisao de matches                    |

---

## Revendedores Monitorados (8)

| Nome                   | Seller ID    |
|------------------------|-------------|
| ACESSORIOS PREMIUM     | 1712320386  |
| BERTO PARTS            | 255978756   |
| COMBATSOM              | 287896166   |
| CSRPARTS               | 1229968748  |
| EXTREME AUDIO          | 188510514   |
| IMPERIAL LEDS          | 1116226805  |
| LIDER SOM              | 1917431909  |
| LS DISTRIBUIDORA       | 26540544    |
| PLANETA DO CARBURADOR  | 632372681   |

---

## Variaveis de Ambiente

| Variavel          | Descricao                              |
|-------------------|----------------------------------------|
| DATABASE_URL      | Connection string PostgreSQL/Supabase  |
| SUPABASE_URL      | URL alternativa Supabase (fallback)    |
| JWT_SECRET        | Segredo para cookies de sessao (32+ch) |
| VITE_APP_ID       | ID da aplicacao Manus OAuth            |
| OAUTH_SERVER_URL  | URL do servidor OAuth Manus            |
| OWNER_OPEN_ID     | OpenID do usuario admin                |
| ML_APP_ID         | App ID do Mercado Livre                |
| ML_CLIENT_SECRET  | Client Secret do Mercado Livre         |
| NODE_ENV          | development ou production              |

---

## Scripts NPM

```bash
pnpm dev         # Servidor dev com hot reload (tsx watch)
pnpm build       # Build producao: Vite (frontend) + esbuild (backend)
pnpm start       # Iniciar servidor producao
pnpm check       # TypeScript type check
pnpm test        # Rodar testes Vitest
pnpm db:push     # Gerar + aplicar migracoes Drizzle
pnpm check:env   # Validar variaveis de ambiente
pnpm format      # Prettier
```

---

## Problemas Conhecidos

### Seguranca
- Algumas procedures tRPC usam `protectedProcedure` onde deveriam usar `adminProcedure`
- Rate limiting in-memory nao funciona com multiplas instancias
- Validacao de API key sem rate limiting

### Performance
- Indices faltantes em colunas frequentemente consultadas (violations.detectedAt, violations.sellerId)
- Queries raw SQL em getViolationTrend

### Arquitetura
- routers.ts monolitico (~529 linhas) — deveria ser dividido em sub-routers
- Foreign keys nao declaradas no Drizzle schema (.references())

---

## Historico de Evolucao

1. **v1.0** — Schema base, scraper HTML Cheerio, dashboard basico
2. **Migracao MySQL -> PostgreSQL** — Supabase como banco primario
3. **API ML** — Integracao OAuth com Mercado Livre (PKCE)
4. **Puppeteer** — Scraper headless como fallback (bypass bloqueio IP)
5. **Pipeline de Ingestao** — Coleta externa via extensao Chrome + endpoint REST
6. **Tracked Listings** — Maquina de estados para monitoramento continuo
7. **Match Review Queue** — Revisao manual de matches com baixa confianca
