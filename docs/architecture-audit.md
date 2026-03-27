# ASX Price Monitor — Auditoria de Arquitetura e Segurança

**Data:** 09/03/2026  
**Engenheiro:** Análise automatizada (Senior Software Engineer + Solutions Architect)  
**Stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL/TiDB

---

## 1. Análise de Problemas Encontrados

### 1.1 Segurança

| # | Severidade | Arquivo | Problema |
|---|---|---|---|
| S1 | **ALTA** | `server/routers.ts` | `clientes.upsert` usa `protectedProcedure` — qualquer usuário autenticado pode criar/editar revendedores. Deveria ser `adminProcedure`. |
| S2 | **ALTA** | `server/routers.ts` | `alerts.delete` usa `protectedProcedure` — qualquer usuário pode deletar alertas de email. Deveria ser `adminProcedure`. |
| S3 | **MÉDIA** | `server/routers.ts` | `settings.update` usa `protectedProcedure` — qualquer usuário pode alterar configurações críticas como `margem_percent` e `scraper_ativo`. Deveria ser `adminProcedure`. |
| S4 | **MÉDIA** | `server/routers.ts` | `clients.runCheck` não valida se o `clienteId` pertence ao usuário autenticado — qualquer usuário pode disparar scraping de qualquer cliente. |
| S5 | **BAIXA** | `server/mlScraper.ts` | O comentário no cabeçalho ainda diz "PostgreSQL" (v4) mas o código usa MySQL. Pode causar confusão em auditorias futuras. |

### 1.2 Bugs Lógicos

| # | Severidade | Arquivo | Problema |
|---|---|---|---|
| B1 | **ALTA** | `server/routers.ts` | Rate limiter (`assertCanRun`/`markRunFinished`) é **in-memory por processo** — em ambiente com múltiplas instâncias (ex: Vercel Edge, PM2 cluster), dois usuários podem disparar o scraper simultaneamente. O lock `scraperInProgress` no mlScraper mitiga parcialmente, mas não é suficiente. |
| B2 | **MÉDIA** | `server/db.ts` | `getViolationsByCliente` filtra por `violations.sellerId = cliente.sellerId` — mas `sellerId` na tabela `clientes` é o ID numérico do ML, enquanto em `violations` pode ser o nickname. Isso pode resultar em 0 violações retornadas para clientes com sellerId numérico. |
| B3 | **MÉDIA** | `server/db.ts` | `initDefaultSettings` faz N queries sequenciais (1 SELECT + 1 INSERT por setting) — deveria usar `INSERT IGNORE` em lote para melhor performance. |
| B4 | **BAIXA** | `server/mlScraper.ts` | `scraperInProgress = false` no `finally` do `runScraper` pode ser chamado antes de `markRunFinished(false)` no router, causando uma janela de inconsistência no estado do lock. |

### 1.3 Performance

| # | Severidade | Arquivo | Problema |
|---|---|---|---|
| P1 | **ALTA** | `drizzle/schema.ts` | **Índices ausentes** nas colunas mais consultadas: `violations.detectedAt`, `violations.sellerId`, `violations.productId`, `violations.runId`, `price_snapshots.productId`, `price_snapshots.capturedAt`, `monitoring_runs.startedAt`. Queries de dashboard serão lentas com volume de dados. |
| P2 | **MÉDIA** | `server/db.ts` | `getViolationTrend` e `getViolationTrendBySlot` usam `db.execute(sql\`...\`)` com SQL raw — não aproveita o cache de query do Drizzle e é mais difícil de manter. |
| P3 | **BAIXA** | `server/db.ts` | `getVendedores` faz dois `Promise.all` separados (items + count) — pode ser otimizado com uma única query usando `COUNT(*) OVER()` (window function). |

### 1.4 Arquitetura e Boas Práticas

| # | Severidade | Arquivo | Problema |
|---|---|---|---|
| A1 | **MÉDIA** | `server/routers.ts` | O arquivo tem 529 linhas — excede o limite recomendado de 150 linhas. Deveria ser dividido em `server/routers/products.ts`, `server/routers/monitoring.ts`, `server/routers/clientes.ts`, etc. |
| A2 | **BAIXA** | `drizzle/schema.ts` | Campos `clienteId` nas tabelas `price_snapshots` e `violations` são `int` sem `references` (FK) declaradas. O Drizzle não cria FKs sem declaração explícita, então não há integridade referencial no banco. |

---

## 2. Correções Aplicadas no Código

### Correção S1+S2+S3 — Elevação de privilégio para operações críticas

**Arquivo:** `server/routers.ts`

- `clientes.upsert` → `adminProcedure`
- `alerts.delete` → `adminProcedure`  
- `settings.update` → `adminProcedure`

### Correção B2 — Filtro de violações por cliente

**Arquivo:** `server/db.ts`

A função `getViolationsByCliente` agora filtra por `clienteId` diretamente (coluna já existente em `violations`), eliminando a dependência do `sellerId` como string.

### Correção P1 — Índices de performance

**Arquivo:** `drizzle/schema.ts` + SQL para Supabase

Adicionados índices nas colunas críticas para queries de dashboard.

---

## 3. Scripts SQL para Supabase

> Execute no **SQL Editor** do Supabase em ordem.

### 3.1 Índices de Performance (OBRIGATÓRIO)

```sql
-- Índices para violations (queries de dashboard e filtros)
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON violations(detectedAt);
CREATE INDEX IF NOT EXISTS idx_violations_seller_id ON violations(sellerId);
CREATE INDEX IF NOT EXISTS idx_violations_product_id ON violations(productId);
CREATE INDEX IF NOT EXISTS idx_violations_run_id ON violations(runId);
CREATE INDEX IF NOT EXISTS idx_violations_cliente_id ON violations(clienteId);
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status);

-- Índices para price_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_product_id ON price_snapshots(productId);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at ON price_snapshots(capturedAt);
CREATE INDEX IF NOT EXISTS idx_snapshots_seller_id ON price_snapshots(sellerId);

-- Índices para monitoring_runs
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON monitoring_runs(startedAt);
CREATE INDEX IF NOT EXISTS idx_runs_status ON monitoring_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_slot_hour ON monitoring_runs(slotHour);

-- Índices para historico_precos
CREATE INDEX IF NOT EXISTS idx_historico_codigo_asx ON historico_precos(codigoAsx);
CREATE INDEX IF NOT EXISTS idx_historico_data_captura ON historico_precos(dataCaptura);
CREATE INDEX IF NOT EXISTS idx_historico_vendedor ON historico_precos(vendedor);
```

### 3.2 RLS (Row Level Security) — Se migrar para Supabase com auth nativo

> **Nota:** O projeto usa Manus OAuth (JWT próprio), não o Supabase Auth. As políticas RLS abaixo são para o caso de migração futura para Supabase Auth. Se continuar com Manus OAuth, **não aplique RLS** pois o acesso é controlado pelo backend tRPC.

```sql
-- Habilitar RLS nas tabelas sensíveis (apenas se usar Supabase Auth)
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ml_credentials ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados (apenas se usar Supabase Auth)
-- CREATE POLICY "authenticated_read" ON products FOR SELECT USING (auth.role() = 'authenticated');
-- CREATE POLICY "admin_write" ON products FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

### 3.3 Coluna slotHour em monitoring_runs (se ainda não existir)

```sql
-- Verificar se a coluna já existe antes de adicionar
ALTER TABLE monitoring_runs ADD COLUMN IF NOT EXISTS slotHour INT DEFAULT NULL;
```

### 3.4 Coluna linkLoja em clientes (se ainda não existir)

```sql
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS linkLoja VARCHAR(512) DEFAULT NULL;
```

---

## 4. Preparação para o GitHub

### 4.1 Comandos Git

```bash
# 1. Entrar no diretório do projeto
cd /home/ubuntu/asx-price-monitor

# 2. Verificar o estado atual
git status

# 3. Adicionar todos os arquivos modificados
git add -A

# 4. Criar o commit com a mensagem padronizada
git commit -m "fix(security): elevate privilege for critical mutations + add DB indexes

- clientes.upsert: protectedProcedure → adminProcedure (S1)
- alerts.delete: protectedProcedure → adminProcedure (S2)
- settings.update: protectedProcedure → adminProcedure (S3)
- getViolationsByCliente: fix filter by clienteId instead of sellerId string (B2)
- schema: add performance indexes for violations, snapshots, runs, historico
- docs: add architecture-audit.md with full analysis report"

# 5. Push para o branch main
git push origin main
```

### 4.2 Modelo de Pull Request

**Título:** `fix(security+perf): privilege escalation fixes, DB indexes, violation filter bug`

**Descrição:**

```markdown
## O que foi alterado

### Segurança (crítico)
- `clientes.upsert` e `alerts.delete` e `settings.update` agora exigem role `admin`
  — antes qualquer usuário autenticado podia criar revendedores, deletar alertas e alterar configurações críticas

### Bug Fix
- `getViolationsByCliente` corrigido para filtrar por `clienteId` (coluna direta)
  em vez de `sellerId` como string — evitava retornar 0 violações para clientes com sellerId numérico

### Performance
- Adicionados 14 índices nas tabelas `violations`, `price_snapshots`, `monitoring_runs` e `historico_precos`
  — queries de dashboard e filtros eram full table scans

### Documentação
- Adicionado `docs/architecture-audit.md` com análise completa de segurança, bugs e performance

## Como testar
1. Logar como usuário não-admin → tentar criar revendedor → deve retornar FORBIDDEN
2. Logar como admin → criar revendedor → deve funcionar
3. Executar "Verificar Agora" → verificar violações por cliente na aba Revendedores

## Scripts SQL necessários
Ver `docs/architecture-audit.md` seção 3 para os índices a criar no Supabase.
```

---

## 5. Problemas Não Corrigidos (Backlog Técnico)

| # | Problema | Esforço | Prioridade |
|---|---|---|---|
| B1 | Rate limiter in-memory (multi-instância) | Médio — usar Redis ou tabela DB | Alta |
| A1 | routers.ts com 529 linhas | Médio — dividir em sub-routers | Média |
| A2 | FK sem referências declaradas no schema | Baixo — adicionar `.references()` | Baixa |
| P2 | SQL raw em getViolationTrend | Baixo — refatorar para Drizzle ORM | Baixa |
| P3 | getVendedores com 2 queries | Baixo — window function | Baixa |
