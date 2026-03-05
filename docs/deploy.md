# Guia de Deploy — ASX Price Monitor

Este documento descreve o processo completo de deploy do ASX Price Monitor, incluindo configuração do banco de dados, variáveis de ambiente e CI/CD.

---

## Pré-requisitos

- Conta no [Supabase](https://supabase.com) com um projeto criado
- Node.js 22+ e pnpm 10+
- GitHub CLI (`gh`) para operações de repositório
- Acesso ao painel da plataforma Manus (para variáveis de ambiente injetadas)

---

## 1. Configuração do Banco de Dados (Supabase)

### 1.1 Obter a Connection String

1. Acesse o painel do Supabase: `https://supabase.com/dashboard/project/SEU_PROJECT_ID/settings/database`
2. Copie a **Connection String** no modo **Transaction Pooler** (porta 6543)
3. Substitua `[YOUR-PASSWORD]` pela senha do banco

```
DATABASE_URL=postgresql://postgres.SEU_PROJECT_ID:SUA_SENHA@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

### 1.2 Executar Migrations

```bash
# Instalar dependências
pnpm install

# Validar variáveis de ambiente
pnpm check:env

# Gerar e aplicar migrations
pnpm db:push
```

### 1.3 Aplicar RLS (Row Level Security)

Execute o arquivo de políticas RLS diretamente no SQL Editor do Supabase:

```bash
# Via Supabase CLI
supabase db push

# Ou manualmente no SQL Editor:
# https://supabase.com/dashboard/project/SEU_PROJECT_ID/sql/new
# Cole o conteúdo de: supabase/migrations/003_rls_policies.sql
```

---

## 2. Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha todos os valores:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | PostgreSQL connection string (Supabase Transaction Pooler) |
| `JWT_SECRET` | Sim | Segredo para assinar cookies JWT (mínimo 32 caracteres) |
| `VITE_APP_ID` | Sim | ID da aplicação Manus OAuth |
| `OAUTH_SERVER_URL` | Sim | URL base do servidor OAuth Manus |
| `OWNER_OPEN_ID` | Sim | Open ID do proprietário na plataforma Manus |
| `BUILT_IN_FORGE_API_URL` | Sim | URL das APIs built-in da Manus |
| `BUILT_IN_FORGE_API_KEY` | Sim | Chave de autenticação das APIs built-in |
| `NODE_ENV` | Sim | `development` ou `production` |

### Validar variáveis antes do deploy

```bash
NODE_ENV=production pnpm check:env
```

---

## 3. Deploy na Plataforma Manus

O deploy é gerenciado diretamente pela plataforma Manus:

1. Faça commit e push das alterações para o branch `main`
2. No painel de gerenciamento do projeto, clique em **Publish**
3. As variáveis de ambiente são injetadas automaticamente pela plataforma
4. O build e deploy são executados automaticamente

---

## 4. CI/CD (GitHub Actions)

O repositório inclui dois workflows:

### `.github/workflows/ci.yml`
Executado em push para `main` e em Pull Requests:
- Instala dependências com cache
- Executa typecheck (`pnpm check`)
- Executa testes (`pnpm test`)

### `.github/workflows/pr-check.yml`
Executado apenas em Pull Requests:
- Verifica formatação com Prettier
- Valida presença do `.env.example`
- Executa typecheck

---

## 5. Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores reais

# Validar variáveis
pnpm check:env

# Iniciar servidor de desenvolvimento
pnpm dev
```

O servidor estará disponível em `http://localhost:3000`.

---

## 6. Estrutura de Banco de Dados

O schema PostgreSQL inclui 10 tabelas principais:

| Tabela | Descrição |
|---|---|
| `users` | Usuários autenticados via Manus OAuth |
| `clientes` | Revendedores monitorados |
| `products` | Catálogo de produtos ASX |
| `monitoring_runs` | Histórico de execuções do scraper |
| `price_snapshots` | Capturas de preços por execução |
| `violations` | Violações de preço mínimo detectadas |
| `historico_precos` | Série histórica de preços por produto |
| `vendedores` | Ranking de vendedores por violações |
| `alert_configs` | Configurações de alertas por email |
| `app_settings` | Configurações gerais da aplicação |

---

## 7. Segurança

- **RLS ativo** em todas as tabelas (ver `supabase/migrations/003_rls_policies.sql`)
- **Secrets** nunca commitados no repositório (use `.env` local ou secrets do GitHub)
- **JWT_SECRET** deve ter mínimo 32 caracteres e ser gerado aleatoriamente
- **DATABASE_URL** usa Transaction Pooler (porta 6543) para melhor performance

### Gerar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 8. Rollback

Em caso de problemas após deploy:

1. No painel Manus, clique em **Rollback** no checkpoint anterior
2. Ou via GitHub: `git revert HEAD && git push origin main`

Para rollback de migrations de banco:
```bash
# Restaurar backup do Supabase
# https://supabase.com/dashboard/project/SEU_PROJECT_ID/database/backups
```
