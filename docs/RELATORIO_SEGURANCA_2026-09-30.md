# Relatório de Segurança — Licitação 2.3 — 30/09/2026

**Sistema:** Licitação 2.3 (`C:\Licitações\Licitacao-2.3-main\Licitacao-2.3-main`) — API Express + Prisma, workers BullMQ, frontend Next.js (`web/`).

**Escopo:** só o Licitação 2.3 (versão de melhorias). Depois de validado aqui, será levado para o ambiente antigo em produção.

**O que foi feito**
1. Revisão estática completa do código.
2. `npm audit` da API e do web.
3. **Teste de penetração dinâmico com requisições reais**, em ambiente local isolado (Postgres temporário na porta 55432, banco `licitacao_test`, Redis inexistente de propósito, IA desligada). 22 testes de ataque via HTTP + 7 verificações da defesa de SSRF.
4. **Correção dos achados** e reexecução da suíte para confirmar.

**Isolamento:** nenhum dado de produção foi tocado. O Postgres de teste escutou só em 127.0.0.1 e foi apagado ao final.

**Verificação:** após as correções — `typecheck` limpo, `lint` limpo, **107 testes unitários** passando, e a suíte de penetração caiu de **8 para 2 achados residuais** (ambos documentados abaixo).

---

## 1. Resultado dos testes de penetração (antes → depois)

| # | Teste | Antes | Depois |
|---|---|---|---|
| T01 | Cabeçalhos de segurança (API) | OK | OK |
| T02 | Rota privada sem token | OK (401) | OK |
| T03 | JWT forjado `alg:none` | OK (401) | OK |
| T04 | JWT com segredo errado | OK (401) | OK |
| T05 | IDOR: ver item de outra empresa | OK (403) | OK |
| T06 | IDOR: apagar documento de outra empresa | OK (403) | OK |
| T07 | IDOR: rematch de item de outra empresa | OK (403) | OK |
| T08 | Mass assignment de `isAdmin` | OK | OK |
| T09 | Não-dono cria membro | OK (401) | OK |
| T10 | Não-admin acessa rota de admin | OK (403) | OK |
| **T11** | **Dono reativa conta desativada pelo admin** | **FALHOU (200)** | **✅ Corrigido (403)** |
| **T12** | **Enumeração: conta sem senha responde diferente** | **FALHOU (403)** | **✅ Corrigido (401 uniforme)** |
| **T13** | **Enumeração por tempo de resposta** | **FALHOU (delta 82 ms)** | **✅ Corrigido (delta −7 ms)** |
| **T14** | **E-mail não normalizado (maiúsc./minúsc.)** | **FALHOU** | **✅ Corrigido (normalizado)** |
| T15 | Convite revela e-mail de outra empresa | FALHOU (409 + msg) | ⚠️ Mitigado (msg neutra; ver nota) |
| T16 | SQL injection em `/tenders` | OK | OK |
| T17 | Política de senha | OK | OK (mín. 10) |
| **T18** | **Sem limite de tamanho em arrays** | **FALHOU (aceitou 20.000)** | **✅ Corrigido (400)** |
| T19 | `errorMsg` expõe detalhe interno | FALHOU | ⚠️ Corrigido no código; ver nota |
| T20 | CORS reflete origem arbitrária | OK (produção) | OK |
| T21 | Rate limit no login (mesmo IP) | OK (429) | OK |
| T22 | Rate limit contornável via `X-Forwarded-For` | (nota) | (nota de implantação) |

**SSRF (7 verificações, todas ✅ após a correção):** bloqueados — metadata de nuvem (`169.254.169.254`), host interno (`redis.railway.internal`), IPs privados (10.x, 172.16.x, 192.168.x, loopback, IPv4-mapeado em IPv6), `http://`, `file://` e host-sósia (`pncp.gov.br.evil.com`).

---

## 2. Correções aplicadas

### Autenticação e enumeração de contas (L-M4 — confirmado por T12/T13/T14)
- **Tempo constante no login:** `verifyPasswordConstantTime` sempre executa um `bcrypt.compare` (contra um hash fictício quando o usuário não existe ou não tem senha). O tempo de resposta deixou de revelar se o e-mail existe (delta caiu de 82 ms para ~0).
- **Resposta uniforme:** e-mail inexistente, conta sem senha e senha errada agora respondem o mesmo 401. Acabou o 403 que denunciava "conta sem senha".
- **E-mail normalizado:** `normalizeEmail` (`trim().toLowerCase()`) na criação e no login — sem contas paralelas que só diferem na caixa.
- Arquivos: `src/services/authService.ts`, `src/api/routes/auth.ts`, `admin.ts`, `company.ts`.

### Reativação indevida (L-M3 — confirmado por T11)
- Nova coluna `disabledByAdmin` (migration `00000000000012`). Quando o admin da plataforma desativa uma conta, ela fica marcada; o dono da empresa **não** consegue reativá-la (403) — só o admin. Membro novo também herda o prazo de acesso (`accessExpiresAt`) do dono, em vez de nascer sem prazo.
- Arquivos: `prisma/schema.prisma`, migration nova, `src/api/routes/admin.ts`, `company.ts`.

### SSRF no download de anexos (L-M1 — confirmado pelas 7 verificações)
- Novo `src/lib/urlGuard.ts`: allowlist de host (`pncp.gov.br`, `novacap.df.gov.br`, `sescgo.com.br`), só `https`, e bloqueio de IP privado/reservado **na abertura de cada conexão** (via `lookup` no agente https — cobre também redirects e DNS rebinding).
- `downloadPNCPDocument` agora valida a URL, usa o agente seguro, revalida o host em cada redirect e impõe teto de 30 MB (`maxContentLength`/`maxBodyLength`) — fecha o risco de OOM por arquivo gigante.
- Arquivos: `src/lib/urlGuard.ts`, `src/services/pncpDocumentsService.ts`.

### Prompt injection e análise por IA (L-M2)
- O prompt do sistema e a instrução por documento agora dizem explicitamente ao modelo para tratar o conteúdo do edital como **dado, não instrução**.
- `validarResultadoAnalise` valida a resposta do modelo (campos, tipos, severidade, tetos de tamanho) antes de gravar — no lugar do `JSON.parse ... as` cego.
- `force=true` (reanálise que sobrescreve o resultado visto por todas as empresas e gasta crédito de IA) agora é **restrito a admin**.
- Arquivos: `src/services/llm/types.ts`, `claudeAnalyzer.ts`, `geminiAnalyzer.ts`, `src/api/routes/tenders.ts`.

### Sessão e frontend (L-M5)
- Novo `POST /api/auth/logout` que incrementa o `tokenVersion` — logout de verdade, revoga no servidor todos os tokens já emitidos. O botão "Sair" passou a chamá-lo.
- CSP e cabeçalhos de segurança no `next.config.ts` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). O `script-src` usa `'self' 'unsafe-inline'` (o Next injeta scripts inline de hidratação sem nonce — CSP mais estrita quebraria o app); bloqueia o vetor principal, que é carregar script de origem externa. Uma CSP com nonce por requisição fica como evolução.
- `linkEdital` (raspado de terceiros) agora passa por `safeHttpUrl` e usa `rel="noopener noreferrer"` — bloqueia `javascript:`/`data:` no href.
- Arquivos: `src/api/routes/auth.ts`, `web/next.config.ts`, `web/src/components/Nav.tsx`, `web/src/lib/safeUrl.ts`, `web/src/app/tenders/[id]/page.tsx`.

### Endurecimentos menores
- **LB1:** senha temporária agora usa `crypto.randomInt` (CSPRNG), 16 caracteres.
- **LB2:** `RATE_LIMIT_DISABLED=true` em produção agora **aborta o boot**; novo limitador dedicado no `change-password`.
- **LB4:** política de senha única (`src/api/passwordPolicy.ts`, mín. 10 / máx. 72), aplicada em login-change, admin, empresa e `createAdmin`. `createAdmin` lê a senha de variável de ambiente (fora do histórico do shell). Admin de teste do Cypress passou a vir de `CYPRESS_ADMIN_*`.
- **LB6:** `.max()` em arrays e strings (`monitoredItems`, `companyDocuments`) e `modalidade` como `z.enum` em `/tenders` (T18: 20.000 keywords agora → 400).
- **LB7:** `errorMsg` da análise agora é genérico ao usuário; o detalhe fica só no log.
- **CI:** `permissions: contents: read` e `npm audit --omit=dev --audit-level=high` no pipeline.

---

## 3. Achados residuais (2) — decisão consciente

**T15 — status 409 no convite ainda indica que o e-mail existe.**
A mensagem foi neutralizada (não confirma mais "já existe usuário"), mas o código HTTP 409 ainda é um oráculo. Fechar isso por completo exige redesenhar o fluxo de convite. Risco baixo e aceitável: a rota exige papel de **dono**, é autenticada e tem rate limit. **Deixado como está, documentado.**

**T19 — linhas de análise antigas ainda podem exibir detalhe interno.**
O código foi corrigido: novas falhas gravam mensagem genérica e o detalhe vai só para o log (confirmado por leitura e pelo teste de SSRF). O que o teste dinâmico ainda vê é uma linha **pré-correção** (semeada). Para produção, recomendo limpar as linhas já existentes uma vez:
```sql
UPDATE tender_analyses
SET error_msg = 'Não foi possível concluir a análise deste edital.'
WHERE status = 'FAILED'
  AND error_msg ~ '(ECONNREFUSED|internal|redis|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)';
```

**T22 — `X-Forwarded-For` e `trust proxy`.**
Com conexão direta na API, `trust proxy = 1` faz o Express confiar no `X-Forwarded-For` enviado. Atrás do proxy real do Railway (exatamente 1 salto), o IP verdadeiro é o que o proxy anexa, e o cabeçalho forjado do cliente **não** contorna o limite. Ação: confirmar que não há um segundo proxy (ex.: Cloudflare) na frente; se houver, ajustar o número de saltos.

---

## 4. Dependências
`npm audit` da API e do web: **sem vulnerabilidades**. O CI agora falha se surgir uma alta/crítica em produção.

---

## 5. Itens que já estavam corretos (verificados)
- JWT: segredo obrigatório sem fallback, só HS*, `tokenVersion`/`active`/`accessExpiresAt` conferidos no banco a cada requisição; `alg:none` e segredo forjado rejeitados (T03/T04).
- Isolamento entre empresas: nenhum IDOR (T05/T06/T07).
- Mass assignment: zod descarta chaves desconhecidas; `isAdmin`/`companyId`/`userId` nunca vêm do cliente (T08).
- Autorização por papel: admin e dono barrados corretamente (T09/T10).
- SQL injection: só Prisma parametrizado (T16).
- CORS em produção: origem arbitrária não refletida (T20).
- Rate limit de login por IP: ativo (T21).
- Erros 500 genéricos; body limitado a 1 MB; regex de matching escapada (sem ReDoS).

---

## 6. Recomendações que dependem de você (fora do código)
1. **Antes de subir para produção:** rodar a migration `00000000000012_disabled_by_admin` (`npx prisma migrate deploy`).
2. Rodar uma vez o `UPDATE` do item T19 para limpar mensagens antigas.
3. Garantir que a conta `cypress-admin@example.com` **não exista** no banco de produção.
4. Confirmar a topologia de proxy (item T22).
5. Definir `CORS_ORIGINS` explícito em produção e manter `NODE_ENV=production`.
6. **Normalização de e-mail:** o login agora compara o e-mail em minúsculas. Se algum usuário em produção tiver e-mail gravado com letra maiúscula, ele não conseguiria entrar depois do deploy. Rodar uma vez, conferindo antes se não há colisão:
   ```sql
   -- conferir colisões primeiro (deve retornar zero linhas):
   SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1;
   -- se vazio, normalizar:
   UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
   ```

### Revisão do próprio código de correção
Numa segunda passada sobre as mudanças, dois pontos foram encontrados e corrigidos antes do fechamento:
- **SSRF/redirect:** o `beforeRedirect` validava o destino sempre como `https://`, então um redirect rebaixado para `http://` num host permitido escaparia do guarda de IP. Passou a validar o protocolo real do redirect (redirect para `http://` é recusado).
- **CSP do Next:** a primeira versão usava `script-src 'self'`, que quebraria a hidratação do Next em produção. Ajustado para `'unsafe-inline'` (e `'unsafe-eval'` só em desenvolvimento); confirmado com `next build`.

---

## 7. Limitações
- O caminho de análise por IA ao vivo (download + chamada ao modelo) não foi exercido de ponta a ponta, porque exige Redis e crédito de IA. A defesa de SSRF que o alimenta foi testada isoladamente (7/7). A validação da resposta e as travas de prompt foram verificadas por leitura e typecheck.
- O frontend teve os arquivos alterados checados por `tsc` sem erros novos (o único erro, `LayoutProps` em `layout.tsx`, é pré-existente e resolvido pelo `next build`, conforme o próprio CI).
- Testes feitos em ambiente local isolado, não contra produção (Railway/Vercel/Supabase).
