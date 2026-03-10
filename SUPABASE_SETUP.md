# ASX Price Monitor — Configuração Supabase

## Projeto Supabase
- **Nome:** ASX AUDITORIA CLIENTES ONLINE
- **Project ID:** `SEU_PROJECT_ID`
- **URL:** https://SEU_PROJECT_ID.supabase.co
- **Região:** us-east-2 (Ohio)

## Status da Migração
- ✅ 10 tabelas criadas no Supabase
- ✅ 536 produtos importados (catálogo ASX completo)
- ✅ 8 clientes cadastrados com seller_ids reais
- ✅ Configurações padrão inseridas (margem 60%, scraper 14h)

## Tabelas Criadas

| Tabela | Registros | Descrição |
|--------|-----------|-----------|
| `products` | 536 | SKUs ASX com preços de custo e mínimo |
| `clientes` | 8 | Clientes monitorados no ML |
| `monitoring_runs` | 0 | Histórico de execuções do scraper |
| `violations` | 0 | Violações de preço detectadas |
| `price_snapshots` | 0 | Snapshots de preços por anúncio |
| `vendedores` | 0 | Vendedores identificados |
| `historico_precos` | 0 | Histórico diário de preços |
| `alert_configs` | 0 | Configurações de alertas por email |
| `app_settings` | 5 | Configurações do sistema |
| `users` | 0 | Usuários do dashboard |

## Connection Strings para Self-Hosting

### Pooler (recomendado para produção — suporta múltiplas conexões)
```
DATABASE_URL=postgresql://postgres.SEU_PROJECT_ID:SUA_SENHA@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

### Direto (para migrations e scripts)
```
DIRECT_URL=postgresql://postgres:SUA_SENHA@db.SEU_PROJECT_ID.supabase.co:5432/postgres
```

## Clientes Cadastrados no Supabase

| Nome | Seller ID |
|------|-----------|
| ACESSORIOS P | 1712320386 |
| BERTO PARTS | 255978756 |
| COMBATSOM | 287896166 |
| CSRPARTS | 1229968748 |
| EXTREME AUDIO | 186722996 |
| IMPERIAL LEDS | 1116226805 |
| LIDER SOM | 1917431909 |
| LS DISTRIBUIDORA | 241146691 |

## Acesso ao Dashboard Supabase

Acesse o painel de controle do banco em:
👉 https://supabase.com/dashboard/project/SEU_PROJECT_ID

Lá você pode:
- Visualizar e editar dados diretamente na aba **Table Editor**
- Executar SQL na aba **SQL Editor**
- Monitorar performance na aba **Reports**
- Ver logs de acesso na aba **Logs**

## Para Migrar a Aplicação para Supabase (Self-Hosting)

A aplicação atual usa MySQL (Manus-hosted). Para migrar para Supabase PostgreSQL:

1. Instale o driver PostgreSQL:
   ```bash
   pnpm add pg
   pnpm remove mysql2
   ```

2. Atualize `drizzle/schema.ts` para usar `pgTable` em vez de `mysqlTable`

3. Configure a variável de ambiente:
   ```
   DATABASE_URL=postgresql://postgres.SEU_PROJECT_ID:SUA_SENHA@aws-0-us-east-2.pooler.supabase.com:6543/postgres
   ```

4. Execute as migrations:
   ```bash
   pnpm db:push
   ```
