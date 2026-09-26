# Runbook de migração — v1.0 → v2.0

## Versão curta

Um comando só. Ele detecta em que estado o banco está e faz o certo:

```bash
DATABASE_URL="postgresql://..." npm run migrar:producao
```

Para só ver o plano, sem alterar nada:

```bash
DATABASE_URL="postgresql://..." npm run migrar:producao -- --dry
```

### Se o banco é Supabase

O painel dá duas connection strings, e elas não servem para a mesma coisa:

| Porta | Para quê |
|---|---|
| **6543** (pooler/pgbouncer) | A aplicação. Precisa de `?pgbouncer=true` na URL |
| **5432** (direta) | O Prisma Migrate. **Só ela funciona para migration** |

Pelo pooler a migration trava — o Prisma precisa de sessão real para tomar
advisory lock e rodar DDL. Pegue a direta em *Project Settings → Database →
Connection string → Direct connection* e rode:

```bash
DIRECT_URL="postgresql://...@db.xxxxx.supabase.co:5432/postgres" npm run migrar:producao
```

O script detecta sozinho se a `DATABASE_URL` é do pooler e para com essa
instrução antes de tentar qualquer coisa. A `DATABASE_URL` da aplicação
continua no pooler normalmente — isso é só para a migration.

O resto deste documento explica o que ele faz e por quê — leia se algo der errado.

---

Este documento é para ser executado **por uma pessoa, contra o banco de produção**.
Nada aqui roda sozinho no deploy.

---

## 1. Por que existe um baseline novo

A v1.0 tinha uma única migration (`20260810185709_init`) que criava **7 tabelas**,
enquanto o schema em produção já tinha **12 modelos**. Tudo o que veio depois do init
foi aplicado com `prisma db push`, que não deixa histórico:

| Faltava na migration antiga | Consequência |
|---|---|
| `users.password_hash`, `users.access_expires_at` | `migrate deploy` num banco novo gerava um schema onde **a aplicação não conseguia nem autenticar** |
| `company_documents`, `tender_checklists`, `tender_analyses`, `tender_participation_plans`, `uasgs` | Cofre de documentos, checklist, análise e plano de participação simplesmente não existiam |
| Colunas `*_norm` | Busca sem acento quebrada |
| Filtro de raio (`raio_km`, `origem_*`) | Filtro por distância quebrado |

Sem histórico não há rollback, não há staging reprodutível, e toda mudança de schema
em produção é feita no escuro. A v2.0 substitui isso por `00000000000000_baseline`,
gerado a partir do schema real.

---

## AVISO — nunca rode `prisma migrate dev` neste projeto

Os índices GIN de trigrama (`gin_trgm_ops`) não são expressáveis no schema do
Prisma, então eles vivem apenas no SQL da migration `00000000000002_busca_trigram`.

Consequência: `prisma migrate dev` enxerga esses índices como "sobrando" no banco
e gera uma migration que os **APAGA**. Isso derruba o desempenho da busca de volta
ao sequential scan, silenciosamente.

Em produção use sempre `migrate deploy` (é o que o `migrar:producao` faz).

---

## 2. Aplicar em produção (uma vez)

O banco de produção **já tem** as tabelas do baseline — ele só nunca soube disso.
Então o baseline é marcado como aplicado, sem rodar:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

Depois disso, as migrations seguintes rodam normalmente:

```bash
npx prisma migrate deploy
```

> **Não** rode `migrate deploy` antes do `migrate resolve` — ele tentaria criar
> tabelas que já existem e falharia.

Em um banco **vazio** (staging novo), pule o `resolve` e rode só o `deploy`.

---

## 3. Colunas novas da v2.0

`00000000000002_*` em diante adicionam, todas nulas ou com default — nenhuma
exige parada:

| Coluna | Para quê |
|---|---|
| `tenders.content_hash` | Detectar republicação sem reescrever a tabela a cada ciclo |
| `tenders.situacao_checked_at` | Rodízio da varredura de situação |
| `tender_items.descricao_norm` | Pré-filtro de palavra-chave no banco |
| `users.token_version` | Revogação imediata de sessão |
| `worker_logs.total_updated` | Observabilidade da coleta |

---

## 4. Extensão `pg_trgm`

A migration `00000000000001_busca_trigram` roda `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
No Railway e no Supabase o papel padrão costuma ter permissão. Se der erro de permissão,
rode **só a linha da extensão** como superusuário e reaplique:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Os índices GIN são criados sem `CONCURRENTLY` (Prisma roda migration em transação),
então a tabela fica bloqueada por alguns segundos. Faça em janela de baixo movimento
se a base já for grande.

---

## 5. Backfill das colunas normalizadas

Licitações e itens já coletados ficam com `descricao_norm` nula até rodar:

```bash
npm run tenders:backfill-norm
```

Sem isso, o pré-filtro do rematch não encontra palavra-chave que só apareça na
descrição de item antigo. O script é idempotente e pode rodar mais de uma vez.

---

## 6. Variáveis de ambiente novas

| Variável | Obrigatória | Padrão | Para quê |
|---|---|---|---|
| `CORS_ORIGINS` | **sim em produção** | vazio | Lista separada por vírgula das origens do frontend. Vazio em produção = nenhum navegador é aceito |
| `AI_ANALYSIS_ENABLED` | não | `false` | Interruptor geral da análise por IA. **Com `false`, nenhuma chamada à API é feita e nenhum crédito é gasto** |
| `SITUACAO_MAX_POR_EXECUCAO` | não | `500` | Teto de licitações reconsultadas por varredura |
| `RATE_LIMIT_DISABLED` | não | `false` | Só para a suíte E2E. **Nunca ligar em produção** |

---

## 7. Limpeza no Redis

O agendador repetível antigo, com a janela de datas congelada, vive no Redis e
sobrevive ao redeploy. O worker agora o remove sozinho no boot (`scheduleColetorJobs`),
mas confirme no primeiro deploy que apareceu no log:

```
[Queue] N agendador(es) legado(s) removido(s) de coletor-pncp.
```

---

## 8. Verificar que funcionou

Depois do deploy, na tabela `worker_logs`:

```sql
SELECT worker, started_at, total_fetched, total_new, total_updated, total_dupes
FROM worker_logs ORDER BY started_at DESC LIMIT 10;
```

O que esperar:

- `total_new` **volta a ser maior que zero** entre ciclos — era o sintoma do P0-01
  (antes caía a zero e só `total_dupes` crescia).
- `total_updated` passa a aparecer preenchido: é o P0-02 funcionando, detectando
  licitação que o órgão republicou.
