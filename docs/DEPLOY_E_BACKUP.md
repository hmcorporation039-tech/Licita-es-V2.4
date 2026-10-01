# Deploy, migrations e backup — guia de operação

Este guia nasceu de um incidente real (01/10/2026): o login ficou fora do ar depois de um
comando de migration. Cada regra abaixo existe por causa de um passo desse incidente.

## 1. Regras de ouro

1. **Migration só nos serviços de CÓDIGO (API e workers). NUNCA no serviço do Postgres.**
   O serviço do Postgres usa uma imagem sem `npm`. Um *Custom Start Command* ou *Pre-deploy
   Command* com `npm run ...` nele faz o contêiner do banco cair em loop
   (`failed to exec pid1: No such file or directory`) e o sistema inteiro fica fora do ar.
2. **Backup antes de qualquer migration** (seção 4). É barato: o banco tem ~134 MB.
3. **Nunca clique em *Regenerate* (senha) nem em *Convert to a highly available cluster*** na
   tela do Postgres sem planejar: o primeiro derruba as conexões; o segundo troca a imagem do banco.
4. **Migrations são aditivas.** Por isso voltar o código para uma versão antiga é seguro
   (o banco à frente do código não quebra nada).

## 2. Configuração no Railway (uma vez)

| Serviço | Onde | Valor |
|---|---|---|
| **API** | Settings → Deploy → **Pre-deploy Command** | `npm run db:migrate:deploy` |
| **API** | Settings → Deploy → **Healthcheck Path** | `/api/health/ready` |
| **Workers** | Settings → Deploy → **Pre-deploy Command** | `npm run db:migrate:deploy` |
| **Postgres** | Settings → Deploy → *Custom Start Command* / *Pre-deploy* | **vazios** |

- O **Pre-deploy** aplica as migrations pendentes antes de a versão nova subir. Se falhar,
  o deploy é cancelado e a versão antiga continua no ar. Rodar nos dois serviços é seguro:
  o Prisma usa um bloqueio no banco e o segundo só vê que não há nada a aplicar.
- O **Healthcheck `/api/health/ready`** só responde 200 quando o banco responde **e** tem
  todas as migrations que o código conhece. Se a versão nova subir antes da migration (ou
  o banco estiver fora do ar), responde 503 e o Railway **não coloca a versão nova no ar**.
  Sem isso, a API ficava "saudável" e, ao mesmo tempo, dava 500 no login.
  - `/api/health` continua existindo, mas só diz que o processo está vivo (não toca no banco).
  - Resposta do `/ready`: `{"ok":true}` ou `{"ok":false,"motivo":"migrations-pendentes","pendentes":1}`
    (outros motivos: `banco-indisponivel`, `sem-historico-de-migrations`).
- O `DATABASE_URL` dos serviços de código deve ser uma **referência** ao Postgres
  (`${{Postgres.DATABASE_URL}}`), e não um texto com a senha digitada. Assim, trocar a senha
  do banco não derruba a API.

## 3. Como publicar uma versão nova

1. `npm run verify` (tipos, lint, testes) — local ou no CI.
2. **Backup** (seção 4).
3. Merge na `main` (ou apontar o serviço para a branch). O Railway roda o Pre-deploy
   (migrations), sobe a versão nova e só a promove se `/api/health/ready` responder 200.
4. Conferir: `GET /api/health/ready` → `{"ok":true}`; entrar no site; olhar o log de
   `[Importação]` (UASG/catálogo se populam sozinhos na API em produção).

Primeira vez em um banco **criado por `prisma db push`** (sem histórico `_prisma_migrations`):
`migrate deploy` direto falha com **P3005**. Use `npm run migrar:producao` (ver `MIGRACAO.md`)
uma única vez. O banco de produção atual **já tem** o histórico, então isso não se aplica.

## 4. Backup

### 4.1 Antes de cada deploy com migration (manual, 30 s)
Crie `scripts\ops\.env.backup` (ignorado pelo git) com a URL **pública** do banco
(Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`):

```
BACKUP_DATABASE_URL=postgresql://postgres:SENHA@host.proxy.rlwy.net:PORTA/railway
```

e rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ops\backup-banco.ps1 -Rotulo antes-do-deploy
```

O script só **lê** o banco, grava em `C:\Licitações\Backups-Banco`, confere que o arquivo
abre (`pg_restore -l`), recusa backups suspeitos (vazios/pequenos) e mantém os 14 mais recentes.
O arquivo contém hashes de senha e dados de clientes: **guarde em pasta protegida e nunca no git**.

### 4.2 Diário, automático
No Agendador de Tarefas do Windows (a máquina precisa estar ligada na hora):

```powershell
schtasks /Create /SC DAILY /ST 03:00 /TN "Backup Banco Licitacoes" `
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Licitações\Licitacao-2.3-main\Licitacao-2.3-main\scripts\ops\backup-banco.ps1"
```

### 4.3 Backup nativo do Railway
Em Postgres → **Backups** (se o seu plano oferecer), ative o agendamento (diário/semanal).
É a segunda camada, independente do seu computador. Não substitui os backups dos itens 4.1/4.2:
o ideal é ter os dois.

## 5. Restaurar

**Primeiro descubra o que quebrou — a maioria dos casos NÃO precisa restaurar dados.**

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Login com "Erro interno", `/api/health` OK | Código novo + banco sem a migration; ou banco fora do ar | `GET /api/health/ready` diz qual. Aplique a migration ou volte o código |
| Banco recusa conexão, log do Postgres com `failed to exec pid1` | Comando `npm` no serviço do Postgres | Esvazie *Custom Start Command*/*Pre-deploy* do **Postgres** e faça Redeploy |
| Versão nova com defeito (dados OK) | Bug de código | Railway → API → Deployments → deploy anterior → **Redeploy** (seguro: migrations são aditivas) |
| Dados apagados/corrompidos | Erro humano ou bug | Restaurar backup (abaixo) |

### 5.1 Conferir um backup (sem risco)
Restaura num banco **local** descartável e mostra as contagens:

```powershell
scripts\ops\restaurar-banco.ps1 -Arquivo C:\Licitações\Backups-Banco\railway_AAAA-MM-DD_HHMM.dump `
  -DestinoUrl postgresql://postgres@127.0.0.1:5432/teste_restauracao
```

### 5.2 Restaurar a PRODUÇÃO (só em emergência)
O script **recusa** destino remoto sem `-Producao` e a frase exata de confirmação; antes de
restaurar, ele tira sozinho um backup do destino (`antes-da-restauracao`), para a própria
restauração ter volta. Usa uma única transação: se algo falhar, nada é alterado.

```powershell
scripts\ops\restaurar-banco.ps1 -Arquivo <backup.dump> -DestinoUrl <URL do banco> `
  -Substituir -Producao -Confirmacao 'RESTAURAR PRODUCAO'
```

Depois: `GET /api/health/ready`, entrar no site e conferir os números. **Pare a coleta (workers)
durante a restauração** para não gravar dados novos no meio.

## 6. Senhas
Se a senha do banco aparecer em conversa, ticket ou arquivo, troque-a (Postgres → Variables →
*Regenerate*). Com o `DATABASE_URL` por referência (seção 2), nenhum serviço perde a conexão.
Atualize também o `scripts\ops\.env.backup`.

## 7. Histórico do incidente (01/10/2026)
- O comando `npm run db:migrate:deploy` foi colocado no campo de comando de início do serviço
  **Postgres**. A imagem do banco não tem `npm`; o contêiner caiu em loop e o banco ficou
  inacessível. A API, que continuava de pé, respondia 500 "Erro interno" a qualquer login.
- Correção: esvaziar o campo no serviço do Postgres e fazer Redeploy. Nenhum dado foi perdido
  (30.146 licitações, 2 usuários) — conferido contra o backup.
- Prevenção: este guia, o healthcheck `/api/health/ready`, o Pre-deploy só nos serviços de código
  e os scripts de backup/restauração testados.
