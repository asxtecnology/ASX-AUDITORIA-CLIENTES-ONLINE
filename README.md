# ASX Price Monitor

[![CI — ASX Price Monitor](https://github.com/asxtecnology/ASX-AUDITORIA-CLIENTES-ONLINE/actions/workflows/ci.yml/badge.svg)](https://github.com/asxtecnology/ASX-AUDITORIA-CLIENTES-ONLINE/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green?logo=node.js)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)

Sistema de monitoramento automático de preços de produtos ASX no Mercado Livre. Detecta violações de preço mínimo (custo + 60% de margem) praticadas pelos distribuidores.

---

## Funcionalidades

- **Monitoramento automático diário às 14h** — scraper HTML do Mercado Livre via `_CustId_`
- **8 clientes monitorados** com seller_ids numéricos reais
- **536 SKUs ASX** com preços de custo e mínimo calculados
- **Sistema de confiança 0–100** para validação de anúncios (EAN=100, código=95, keywords=50–85)
- **Dashboard** com KPIs, gráficos de tendência e tabela de violações
- **Alertas automáticos** por email quando violações são detectadas
- **Histórico completo** de monitoramentos e preços por produto

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| Backend | Node.js + Express + tRPC 11 |
| Banco de dados | MySQL (Manus) / PostgreSQL (Supabase) |
| ORM | Drizzle ORM |
| Scraper | Cheerio (HTML scraping) |
| Autenticação | Manus OAuth + JWT |
| Testes | Vitest |

---

## Estrutura do Projeto

```
client/src/
  pages/          ← Dashboard, Violações, Clientes, Vendedores, Catálogo, Histórico, Alertas, Configurações
  components/     ← DashboardLayout, shadcn/ui
server/
  mlScraper.ts    ← Scraper HTML do Mercado Livre
  routers.ts      ← tRPC procedures
  db.ts           ← Query helpers (Drizzle)
drizzle/
  schema.ts       ← Schema completo (10 tabelas)
```

---

## Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# Rodar migrações
pnpm db:push

# Iniciar servidor de desenvolvimento
pnpm dev

# Rodar testes
pnpm test

# TypeScript check
pnpm check
```

---

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string MySQL/PostgreSQL |
| `JWT_SECRET` | Segredo para assinar cookies de sessão |
| `VITE_APP_ID` | ID da aplicação Manus OAuth |
| `OAUTH_SERVER_URL` | URL do servidor OAuth Manus |

---

## Supabase

O banco de dados está configurado no Supabase:
- **Projeto:** ASX AUDITORIA CLIENTES ONLINE
- **Project ID:** `wwqdcjvxbglczabhqowp`
- **URL:** `https://wwqdcjvxbglczabhqowp.supabase.co`

Ver `SUPABASE_SETUP.md` para instruções completas de configuração.

---

## CI/CD

O projeto usa **GitHub Actions** para integração contínua:

- **`ci.yml`** — Roda em cada push para `main`/`develop`: TypeScript check → Testes Vitest → Build check
- **`pr-check.yml`** — Roda em cada Pull Request: valida TypeScript + testes e comenta resultado no PR

---

## Clientes Monitorados

| Cliente | Seller ID |
|---------|-----------|
| ACESSORIOS PREMIUM | 1712320386 |
| BERTO PARTS | 255978756 |
| COMBATSOM | 287896166 |
| CSRPARTS | 1229968748 |
| EXTREME AUDIO | 186722996 |
| IMPERIAL LEDS | 1116226805 |
| LIDER SOM | 1917431909 |
| LS DISTRIBUIDORA | 241146691 |

---

## Licença

Projeto proprietário — ASX Tecnology © 2026
