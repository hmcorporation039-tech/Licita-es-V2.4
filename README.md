# Plataforma de Monitoramento de Licitações

Monitora licitações vigentes do **PNCP** e **ComprasNet** por itens previamente cadastrados, cruza com um cofre de documentos da empresa, analisa editais por IA e organiza um plano de participação por licitação.

---

## Pré-requisitos

- Node.js 20+
- Conta no [Railway](https://railway.app) (banco PostgreSQL + hospedagem da API/workers)
- Conta no [Upstash](https://upstash.com) (Redis gerenciado, usado pelas filas do BullMQ)
- VS Code com extensão **Prisma** instalada

---

## 1. Clonar / abrir o projeto no VS Code

```bash
git clone <seu-repo>
cd licitacao-platform
code .
```

---

## 2. Instalar dependências

```bash
npm install
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha:

| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | Railway → serviço Postgres → aba Variables → `DATABASE_URL` (use o endpoint com TCP proxy pra acessar de fora do Railway) |
| `REDIS_URL` | Dashboard Upstash → seu banco → `rediss://...` |
| `JWT_SECRET` | Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `RESEND_API_KEY` | [resend.com](https://resend.com) — opcional, sem ela os e-mails só ficam registrados sem enviar |
| `CORS_ORIGINS` | Origens do frontend separadas por vírgula. **Obrigatória em produção** — vazia lá, nenhum navegador é aceito |
| `AI_ANALYSIS_ENABLED` | `"false"` (padrão) desliga a análise por IA por completo: **nenhuma chamada de API, nenhum crédito gasto** |
| `AI_PROVIDER` | `"claude"` ou `"gemini"` — controla qual IA analisa os editais |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) — necessária se `AI_PROVIDER="claude"` |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — gratuita, necessária se `AI_PROVIDER="gemini"` |

---

## 4. Configurar o banco de dados

```bash
npm run db:generate       # gera o Prisma Client
npm run db:migrate:deploy # aplica as migrations (cria as tabelas)
```

> **Migrando um banco que já existe (v1.0):** leia o [`MIGRACAO.md`](MIGRACAO.md)
> antes. O banco de produção precisa de um `prisma migrate resolve --applied`
> uma única vez, senão o deploy tenta recriar tabelas que já existem.
>
> `prisma db push` não é mais parte do fluxo (ficou como `db:push:danger`): era
> ele que deixava o histórico de migrations defasado em 5 tabelas.

---

## 5. Criar o primeiro usuário administrador

Não existe autocadastro aberto — o primeiro admin é criado direto no banco, e ele cria os demais usuários pela tela "Usuários" (ou via `POST /api/admin/users`):

```bash
npx ts-node scripts/createAdmin.ts seu-email@empresa.com "sua-senha-com-8+caracteres" "Seu Nome"
```

---

## 6. Rodar a API e os workers em desenvolvimento

```bash
npm run dev:api       # API REST em http://localhost:3333
npm run dev:workers   # coletores PNCP/ComprasNet + matcher + rotinas periódicas
```

Em outro terminal, o frontend:

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

---

## 7. Rodar os testes

```bash
npm run verify   # typecheck + lint + testes unitários
```

Os testes unitários (Vitest) cobrem só função pura — matcher, parsers, geo, hash,
escape de HTML. **Não tocam banco, rede nem API de IA**, então rodam offline e não
gastam crédito nenhum. É a mesma coisa que o CI roda, sem nenhum segredo configurado.

```bash
npm run test         # só os unitários
npm run test:watch   # em modo watch
```

E os de ponta a ponta, que precisam de banco e da API no ar:

```bash
npm run test:e2e
```

Usa o admin criado no passo 5 (configure `CYPRESS_ADMIN_EMAIL`/`CYPRESS_ADMIN_PASSWORD` se usar credenciais diferentes das do `cypress.config.ts`) pra criar usuários de teste via `/api/admin/users`.

---

## Scripts úteis

| Comando | O que faz |
|---|---|
| `npm run build` | Compila TS → `dist/` (usado em produção) |
| `npm run start:api` / `npm run start:workers` | Roda a versão compilada (produção) |
| `npm run matches:rebuild` | Recalcula todos os matches do zero |
| `npm run situacoes:refresh` | Reconsulta a situação real das licitações no PNCP |
| `npm run tenders:cleanup` | Remove licitações encerradas/antigas que ninguém acompanha (retenção) |
| `npm run rawjson:enxugar` | Backfill: reescreve o `raw_json` das licitações já coletadas, guardando só o que é lido |
| `npm run tenders:backfill-norm` | Preenche colunas normalizadas pra busca sem acento |
| `npm run documentos:check-expirations` | Dispara avisos de documento vencendo |

> `tenders:cleanup` e `rawjson:enxugar` apagam/reescrevem dados. Quando a
> `DATABASE_URL` não é local, os dois param e pedem que você digite o host do
> banco antes de seguir — a `DATABASE_URL` de desenvolvimento costuma apontar
> para produção neste projeto. Use `-- --sim` para pular a pergunta em
> automação (sem terminal interativo, sem a flag, eles abortam).

---

## Estrutura do projeto

```
licitacao-platform/
├── prisma/schema.prisma        ← Schema do banco
├── scripts/                    ← Scripts operacionais (rodados sob demanda)
├── src/
│   ├── api/
│   │   ├── routes/              ← auth, admin, tenders, monitored-items, matches, company-documents, dashboard
│   │   └── authMiddleware.ts    ← requireAuth / requireAdmin
│   ├── lib/                     ← geoService, checklistTemplate, participationPlanTemplate
│   ├── queues/                  ← BullMQ + Redis
│   ├── services/
│   │   ├── llm/                 ← analisadores de edital (claude, gemini) por trás de AI_PROVIDER
│   │   ├── matcherService.ts    ← cruza licitação × item monitorado
│   │   ├── situacaoUpdateService.ts
│   │   ├── retentionService.ts
│   │   └── documentAlertService.ts
│   └── workers/                 ← coletores PNCP/ComprasNet, matcher, notificador, rotinas periódicas
├── web/                         ← Frontend Next.js
├── cypress/e2e/                 ← Testes de API de ponta a ponta
├── .env.example
└── package.json
```

---

## APIs utilizadas

| Fonte | URL base | Auth |
|---|---|---|
| PNCP | `https://pncp.gov.br/api/consulta` | Pública |
| ComprasNet | `https://dadosabertos.compras.gov.br` | Pública |
| CATMAT/CATSER | `https://compras.dados.gov.br` | Pública |

---

## Documentos do projeto

| Arquivo | O que tem |
|---|---|
| [`PROGRESSO.md`](PROGRESSO.md) | Fases, status de cada item e o que ainda não foi iniciado |
| [`MIGRACAO.md`](MIGRACAO.md) | Runbook da migração v1.0 → v2.0, para executar contra produção |

---

## Produção

| Peça | Onde |
|---|---|
| API + workers | Railway — `api-production-1fb4.up.railway.app` |
| Frontend | Vercel — `licita-o-lac.vercel.app` |
| Banco | Railway Postgres |
| Filas | Upstash Redis |

