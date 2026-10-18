# Relatório de Segurança: Monitor de Licitações 2.4, 18/10/2026

**Sistema:** API Express + Prisma (Railway), workers BullMQ e frontend Next.js 16 (Vercel).
**Versão analisada:** `main` em `dbe78bc` (PRs #36 a #67, tudo o que entrou depois do relatório de 15/10).
**Branch das correções:** `relatorio-seguranca-2026-10-18`.

## Resumo

| Item | Resultado |
|---|---|
| Achados críticos | 0 |
| Achados altos | 0 |
| Achados médios | 3, **corrigidos** nesta branch (um deles com parte pendente, ver item 3) |
| Achados baixos | 3 corrigidos; 3 pendentes e registrados (seção 4) |
| Isolamento entre empresas (teste real com duas empresas) | **0 vazamentos** em 25 tentativas |
| Dependências de produção (`npm audit --omit=dev`) | **0 vulnerabilidades** (API e web) |
| Segredos no histórico do git (gitleaks, 130 commits) | **0 reais** (8 alertas, todos senhas e tokens fictícios de teste) |
| OWASP ZAP (baseline e full scan, só local) | **0 falhas** no site (137 regras OK) e na API (139 regras OK); só avisos baixos, triados na seção 5 |
| Semgrep (OWASP Top 10, TS, Node, React, JWT, segredos) | 28 alertas, **0 confirmados** após triagem |
| Testes | 994 unitários e 168 de integração passando (8 novos) |

## 1. O que foi feito

1. **Auditoria de código white-box** de tudo o que mudou desde 15/10: rotas públicas (vitrine e estatísticas), cadastro com `origem`/`interesse` e criação do primeiro item na confirmação do e-mail, itens monitorados (palavras de exclusão, plural, regex), rotas de admin (`/cobertura-municipal`), documentos da licitação (`/previa`, `/recalcular`, `/arquivo`), anexar documento pendente da habilitação, pregão com a Bela, `interpretar` da Bela, lista de licitações com várias UFs, coletores novos (Infraero, Querido Diário ampliado, varredura do PNCP, Sistema S) e a allowlist de SSRF.
2. **Teste dinâmico local**, com a API (porta 3370) e o site (porta 3070) rodando nesta máquina, Postgres e Redis descartáveis em Docker e **50 mil licitações sintéticas** (volume parecido com o de produção). Duas empresas de teste criadas pelo cadastro real (código de confirmação lido do log de desenvolvimento).
3. **Fuzzing dos parsers** fora da API: Querido Diário com textos de 8 MB, Infraero com HTML aninhado, Bela com 20 mil frases aleatórias e o matcher com 200 palavras-chave de 120 caracteres.
4. **Ferramentas (Docker):** Semgrep, OWASP ZAP (baseline e full scan, só contra o ambiente local), gitleaks no histórico inteiro e `npm audit`.
5. **Produção, só passivo:** uma leitura da página inicial, de `/api/health/ready` e de `/api/public/estatisticas` (esta com `Origin` estrangeiro para checar a CORS). Nenhuma varredura, fuzzing ou requisição autenticada contra produção.
6. Todo ataque confirmado foi refeito depois da correção, contra a mesma API local.

## 2. Achados e correções

| # | Gravidade | Achado | Status |
|---|---|---|---|
| 1 | **Média** | Documento da licitação travava a API para todos | **Corrigido** |
| 2 | **Média** | Rematch com mais de 32.767 oportunidades dava erro 500 | **Corrigido** |
| 3 | **Média** | Palavra-chave só com "de" casava com a base inteira | **Corrigido** (parte pendente) |
| 4 | Baixa | `%` e `_` funcionavam como curinga na busca pública | **Corrigido** (parte pendente) |
| 5 | Baixa | Parser da Infraero quadrático com HTML aninhado | **Corrigido** (parte pendente) |
| 6 | Baixa | Site anunciava `X-Powered-By: Next.js` | **Corrigido** |

### 2.1 Documento da licitação travava a API (Média)

- **Onde:** `POST /api/tenders/:id/documentos/arquivo` (`src/api/routes/documentosDaLicitacao.ts:250`); o schema em `src/lib/documentosDaLicitacao/modelo.ts`.
- **Problema:** o teto de 15/10 limitava blocos (200), linhas por tabela (500), quebras (40) e caracteres (200 mil), mas não o total de linhas. Linhas com célula vazia não contam caractere. O PDF e o DOCX são montados de forma síncrona, então o processo inteiro para enquanto o arquivo é gerado.
- **Prova (local, conta de teste comum):** corpo de ~600 KB com 200 tabelas de 500 linhas de uma letra.

  | Formato | Resultado | Tempo | `/api/health` no mesmo processo |
  |---|---|---|---|
  | PDF | 200, 2.867 páginas, 3,8 MB | 4,8 s | esperou até 4,6 s |
  | DOCX | 200 | 13,7 s | esperou até 12,4 s |

  Com o limite de 30 arquivos por 15 min, **uma conta de teste deixava a API parada cerca de 40% do tempo**, e várias contas somam.
- **Correção:** no máximo **1.000 linhas e 4.000 células de tabela por documento**. A proposta comercial real (6 colunas, até 500 itens, ou 3.000 células) continua passando.
- **Depois:** o mesmo ataque recebe **400 em 2 ms**. No teto de células (500 linhas × 8 colunas, 96 mil caracteres), o documento leva cerca de 1,3 s (PDF) e 1,4 s (DOCX).
- **Teste:** `tests/documentosDaLicitacao.test.ts`, "recusa tabelas que somam linhas demais mesmo com células vazias".

### 2.2 Rematch com mais de 32.767 oportunidades dava erro 500 (Média)

- **Onde:** `src/services/rematchService.ts:51`, chamado por `POST /api/monitored-items/:id/rematch` e pela confirmação de e-mail (`src/api/routes/auth.ts:173`).
- **Problema:** a lista de ids das candidatas ia inteira num `IN (...)`. Acima de 32.767 ids, o Postgres recusa (`P2035: too many bind variables`).
- **Prova:** item com `servicos` e `aquisicao` (37.500 candidatas na base local) recebe **500 "Erro interno"** em 4,7 s. Na confirmação do e-mail o erro é engolido e o primeiro item do cadastro fica **sem nenhuma oportunidade**, sem aviso.
- **Por que importa já:** produção tem hoje 24.354 licitações abertas, 74% do limite. Com a varredura do PNCP e o Querido Diário ampliado, um termo genérico passa do limite em pouco tempo.
- **Correção:** os matches existentes são lidos pelo item, sem lista de ids. A contagem vem do `createMany`. Só as 20 primeiras novas são buscadas, para o e-mail.
- **Depois:** 200 com `matchesFound: 37500`; o segundo rematch devolve 0.
- **Teste:** `tests/integracao/rematchGrande.test.ts`, com 33.000 licitações.

### 2.3 Palavra-chave só com "de" casava com a base inteira (Média)

- **Onde:** schema de `src/api/routes/monitoredItems.ts` e `interesseSchema` (`src/lib/origemDoCadastro.ts`).
- **Problema:** palavra-chave e interesse do cadastro aceitavam termos como `de`, `para` ou `com` (2 caracteres já bastavam). Com a correção 2.2, o rematch não falha mais, e o efeito aparece por inteiro.
- **Prova:** item com `de` grava **50.000 matches em 57 s** numa única requisição. Numa conta de teste:
  - 3 itens dão 150 mil linhas;
  - o worker continua somando um match por licitação nova;
  - pelo cadastro, `interesse.termo = "de"` dispara tudo isso já na confirmação do e-mail.

  O event loop não trava (o `/api/health` ficou abaixo de 31 ms), mas a carga cai no banco e no armazenamento.
- **Correção:** termo feito só de palavras de ligação é recusado com mensagem clara, tanto no item quanto no interesse do cadastro (`temPalavraSignificativa`, `src/lib/matching.ts:29`). Itens já gravados não mudam.
- **Pendente (decisão de produto):** termo genérico legítimo ainda custa caro. `servicos` + `aquisicao` grava 37.500 matches em cerca de 32 s. Recomendação:
  1. levar o rematch (inclusive o da confirmação do e-mail) para a fila BullMQ, que já existe, em vez de rodá-lo dentro da requisição;
  2. definir um teto de matches por item (por exemplo, 5.000 mais recentes) ou sugerir afinar o termo quando passar disso.

### 2.4 Curingas do LIKE na busca pública (Baixa)

- **Onde:** `GET /api/public/vitrine` (`src/api/routes/public.ts:99`), `GET /api/tenders` (`q`, `orgao`, `municipio`, `numero`) e o pré-filtro do rematch (`src/services/matcherService.ts:240`).
- **Problema:** o `contains` do Prisma não escapa `%` nem `_`.
- **Prova:**
  - sem login, `?q=%25%25%25` devolve `total: 50000` (a base inteira);
  - `?q=___` devolve 18.625 resultados, o que contorna a regra de busca literal com no mínimo 3 letras.

  Os dados são públicos, e padrões como `%a%a%a…` não causaram lentidão (até 90 ms), por isso a gravidade é baixa.
- **Correção:** `literalNoLike` (`src/lib/buscaLiteral.ts`) escapa `\`, `%` e `_` antes do `contains` nesses pontos.
- **Depois:** `%%%` e `___` devolvem 0; busca normal sem mudança.
- **Testes:** `tests/buscaLiteral.test.ts` e um caso novo em `tests/integracao/vitrine.test.ts`.
- **Pendente:** o mesmo padrão existe em rotas que exigem login e não mudaram neste ciclo (`uasg.ts:31-33`, `catalog.ts:34`, `radar.ts:42,49`, busca do admin). Aplicar o mesmo helper numa manutenção.

### 2.5 Parser da Infraero quadrático com HTML aninhado (Baixa)

- **Onde:** `parseInfraeroDetalhe` (`src/services/infraeroParser.ts`), no worker.
- **Problema:** o cheerio (htmlparser2) leva tempo quadrático com aninhamento profundo e estoura a pilha no `.text()`. A medição isolada:

  | Entrada | Tempo |
  |---|---|
  | 4.000 `<div>` aninhados | 0,4 s |
  | 8.000 `<div>` aninhados | 5,6 s |
  | 160 KB de `<table><tr><td>` aninhados | 5,1 s, mais estouro de pilha |

  Uma página de 512 KB não terminou em 5 minutos. Até 50 MB eram aceitos. A fonte é o site oficial (https e allowlist), então só seria explorável com a fonte comprometida.
- **Correção:**
  - página acima de 1 MB ou com mais de 5.000 etiquetas é recusada antes do cheerio. As páginas reais têm 6 a 17 KB e até 382 etiquetas;
  - `infraeroClient` limitado a 2 MB.
- **Depois:** 50.000 `<div>` são recusados em menos de 1 s.
- **Teste:** `tests/infraeroParser.test.ts`.
- **Pendente:** os outros coletores HTML (Novacap, FIEG, SESC, Sistema S) usam o mesmo cheerio, com teto de 20 a 50 MB. Recomendação: a mesma guarda de tamanho e de etiquetas num ponto comum (por exemplo, `decodificarHtml`).

### 2.6 `X-Powered-By: Next.js` (Baixa)

O cabeçalho aparecia em produção e foi apontado pelo ZAP. Corrigido com `poweredByHeader: false` em `web/next.config.ts`.

## 3. Verificado e seguro

### Acesso entre empresas

Teste real com as empresas A e B, por HTTP, contra a API local. B tentou ler, alterar ou apagar:

- o item monitorado de A (GET, PATCH, DELETE e rematch): **403**;
- o documento e o arquivo de A (GET, PUT, PATCH e DELETE): **403**. Na listagem, B não vê o documento de A;
- o lance de A: **404**;
- o resultado do pregão de A: **409** sem plano próprio.

A também não conseguiu alterar o match de B (**403**). Com as duas empresas em "Vou participar" na **mesma licitação**:

- o estudo de B veio vazio (o de A tinha impostos de 7,77%);
- o pregão de B veio sem os lances de A;
- B não apagou o lance de A (**404**);
- a proposta readequada de B não usou os lances de A (**409**).

No fim, A conferiu que nada dela mudou.

### Rotas de admin e autenticação

- `/api/admin/cobertura-municipal` e `/api/admin/companies` devolvem **403** para usuário comum e **401** sem token. Os dois routers aplicam `requireAuth` e `requireAdmin` no topo.
- `/api/bela/interpretar` devolve **401** sem token.

### Mass assignment

`companyId`, `userId` e `active` enviados na criação de item e de documento são descartados pelo zod. O registro fica com a empresa do token.

### Tetos de entrada (todos 400 ou 413)

- Item monitorado: 201 palavras-chave, palavra de 121 caracteres, 51 exclusões e exclusão de 61 caracteres.
- Vitrine: `q` com 61 caracteres, `uf` com 3 letras e `q` em formato de lista.
- Lista de licitações: `uf=DF,XX` e `uf` com 121 caracteres. UFs repetidas são deduplicadas.
- Bela: texto com 501 caracteres e `contexto` inválido.
- Pregão: lance negativo, lance de 1e20, alvo de outra licitação e `maxLances` 999.
- Documentos: prévia com 21 alertas, 11 perguntas e declaração inexistente (`../../etc/passwd`).
- Corpo: JSON de 1,1 MB (413) e JSON mal formado (400).

### Cadastro

- UTM acima de 200 caracteres descarta a origem inteira, e o cadastro segue normalmente.
- `<script>` na UTM fica gravado como texto, e o admin mostra pelo React, que escapa.
- O interesse vira um único item, só se a empresa ainda não tiver nenhum. A cota do plano é respeitada.
- O termo refletido em `/cadastro?q=` sai escapado no HTML e no payload do React. É o alerta 10031 do ZAP, um falso positivo.

### Anexar documento pendente

O fluxo usa as rotas de upload que já existiam:

- HTML ou SVG declarados como PDF ou PNG: **415**, porque o tipo é detectado pelos bytes;
- arquivo vazio: **400**;
- 10 MB + 1 byte: **413**;
- nome com `../` e CRLF é saneado (`.. .. etc passwd Set-Cookie a b.pdf`);
- `X-Nome-Arquivo` mal codificado cai em `documento.pdf`;
- o download sai como anexo, com `nosniff`.

### ReDoS e custo dos parsers

- **Matcher:** 200 palavras-chave de 120 caracteres com variantes de plural, contra um objeto de 20 KB mais 300 itens de 2 KB, levam 0,7 s no pior caso. 100 mil espaços entre as palavras: 1 ms. Frase repetida 33 mil vezes: 8 ms. Não há backtracking catastrófico: as variantes são literais escapados, unidos por `\s+`.
- **Bela:** pior caso de 33 ms em 20 mil textos aleatórios de 500 caracteres.
- **Querido Diário:** linear, de 0,7 s a 16 s para 8 MB (o teto de download). Roda só no worker.
- **Alertas legais:** 59 ms com 100 KB por campo.

### SSRF

- Os 18 hosts novos da allowlist são todos `https` e das fontes reais.
- O Querido Diário só baixa de `data.queridodiario.ok.org.br`, sem redirect.
- A próxima página do Portal da Indústria precisa ser do mesmo host e de `/api/licitacoes`.
- Os redirects do Sistema S não podem trocar de host nem cair para http.
- O guarda de IP privado continua valendo em cada salto.

### Produção (passivo)

- **Site:** CSP com `frame-ancestors 'none'`, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` e `Permissions-Policy` com microfone só para o próprio site.
- **API:** HSTS com `preload`, CSP do helmet, `nosniff`, COOP e CORP `same-origin`.
- **CORS:** com `Origin: https://atacante.example`, a resposta **não traz `Access-Control-Allow-Origin`**.
- **Prontidão:** `/api/health/ready` só devolve `{"ok":true}`, sem detalhes internos.
- **Vitrine:** o limite de 60 consultas por 15 minutos está ativo (`ratelimit-policy: 60;w=900`).

## 4. Riscos aceitos e próximos passos

| Item | Por que ficou | Recomendação |
|---|---|---|
| Rematch de termo genérico (37,5 mil matches, cerca de 32 s na requisição) | Teto de matches é decisão de produto | Rematch na fila BullMQ e teto ou aviso de termo amplo (2.3) |
| Curingas do LIKE em uasg, catálogo, radar e admin | Rotas com login, fora deste ciclo | Aplicar `literalNoLike` (2.4) |
| Outros coletores HTML sem guarda de aninhamento | Fontes oficiais, só no worker | Guarda comum de tamanho e de etiquetas (2.5) |
| Worker recompila as regex de cada item a cada licitação (20 ms por item com 200 palavras; `orgaoMatches` compila a cada chamada) | Custo de CPU, não é falha | Compilar uma vez por item, por lote |
| `/documentos/previa` consulta o PNCP a cada chamada, só com o limite global | O identificador é validado (sem SSRF) | Cache curto por licitação ou o mesmo limite do `/recalcular` |
| Itens de 15/10 continuam valendo: CSP com `unsafe-inline` e token em `localStorage`, corrida nas cotas, teto global de cadastros, Actions por tag, `vitest`/`cypress` (o `npm audit` completo aponta `braces`, `extract-zip`, `qs` e `source-map-js`, todos só em desenvolvimento) e `exportarSqlBruto.ts` | Sem mudança | Ver o relatório de 15/10 |

## 5. Resultado das ferramentas

### Semgrep

28 alertas e 21 avisos de arquivo que a ferramenta não conseguiu analisar. **Nenhum confirmado.**

| Regra | Qtd. | Triagem |
|---|---|---|
| `regex_dos` | 18 | Regex constantes sobre texto curto ou já limitado. Os caminhos de risco real (matcher, Bela, Querido Diário e Infraero) foram medidos na seção 3, e o da Infraero virou o achado 2.5. |
| `regex_injection_dos` (`bela/interpretar.ts:259`) | 1 | O `RegExp` é montado com o trecho escapado de um texto de até 500 caracteres. |
| `express_xss` (3) e `direct-response-write` (2) | 5 | `res.send` de PDF, DOCX ou arquivo com `Content-Type` explícito, como anexo e com `nosniff`. |
| `helmet_header_hsts` | 1 | HSTS configurado com `preload`. |
| `node_sha1` (`matrizExigencias.ts:44`) | 1 | Hash usado como chave de agrupamento, não para segurança. |
| `node_username` (`web/src/lib/session.ts:6`) | 1 | Nome de variável, sem credencial. |
| `bypass-tls-verification` (`scripts/exportarSqlBruto.ts:35`) | 1 | Risco já aceito em 15/10. |

### gitleaks

130 commits, 8 alertas. Todos são valores fictícios de teste:

- senhas de login em `tests/integracao/*`;
- um JWT de exemplo em `tests/prontidaoComercial.test.ts`, usado para testar a máscara de segredos.

### npm audit

`--omit=dev`: **0 vulnerabilidades** na API e no web.

### OWASP ZAP (local)

| Varredura | Alvo | Falhas | Regras OK | Avisos |
|---|---|---|---|---|
| Baseline | site (3070) | 0 | 62 | 5 |
| Full scan (spider + ataque ativo) | site (3070) | 0 | 137 | 5 |
| Full scan | API (3370), a partir da vitrine | 0 | 139 | 3 |

Triagem dos avisos:

- **`X-Powered-By`:** corrigido (2.6).
- **`script-src 'unsafe-inline'`:** risco já aceito (seção 4).
- **`Cross-Origin-Resource-Policy` e `Cross-Origin-Embedder-Policy` ausentes no site:** o site não serve recurso sensível a outra origem, e o COEP exigiria que o captcha da Cloudflare declarasse CORP. Fica como está.
- **Atributo HTML controlado pelo usuário (10031), só no baseline:** `?q=` e `uf` aparecem escapados no HTML (conferido à mão com `"><script>` e `onerror=`). Falso positivo; o full scan passou essa regra e a de XSS refletido, persistente e DOM.
- **Source Code Disclosure - File Inclusion (43):** o otimizador de imagem do Next responde 400 "não é uma imagem válida" para `url=/image`. Não devolve código. URL externa (`https://169.254.169.254/...`) também recebe 400, então não há SSRF pelo `/_next/image`. Falso positivo.
- **"HTTP Only Site":** é o ambiente local sem TLS; em produção há HSTS.
- **CSP sem diretiva e Permissions-Policy na API:** a API só responde JSON; o CSP do helmet já tem `default-src 'self'`.

**Ressalva:** o full scan da API rodou com o limite de requisições ligado, então o ataque ativo esgotou a cota da vitrine e passou a receber 429 (conferido logo depois: `/vitrine` e `/estatisticas` respondiam 429). Os tetos de entrada e o isolamento entre empresas foram verificados à mão (seção 3), com cobertura maior que a do ZAP, que não se autentica.

## 6. Ambiente e limpeza

- Postgres 16 e Redis 7 descartáveis em Docker, nas portas 55471 e 56471. Segredos de teste foram passados direto na linha de comando; nenhum `.env` foi lido.
- API em 3370 e site em 3070, os dois locais.
- Contêineres, servidores e bancos de teste foram apagados ao final. Nenhum dado de produção foi tocado.
