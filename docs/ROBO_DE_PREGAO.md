# Robô de pregão — desenho antes do código

Documento de arquitetura do item 16 (Bloco D). Escrito antes de qualquer código,
como manda a regra do projeto. Fecha o que já existe, o que falta, a arquitetura
escolhida, as etapas, as travas inegociáveis e os pontos exatos onde cada parte
pluga no código de hoje.

## 1. O que já existe (co-piloto manual, em produção)

A Bela já é um co-piloto de disputa completo e determinístico (sem IA, só
aritmética e regex):

- Lê o estudo de custos e calcula, por alvo, o **equilíbrio** (preço de custo
  sem prejuízo) e o **mínimo com margem** — `src/lib/bela/copiloto.ts`.
- A cada melhor lance informado, dá o farol (verde/amarela/vermelha), a margem e
  **sugere o próximo lance** (`avaliacao.sugestao = { valor, margemPct, ultimo }`).
- O cliente **confirma com um toque** o lance sugerido — botão "Dei este lance:
  R$X" em `web/src/app/(app)/tenders/[id]/pregao/page.tsx` → grava `MEU_LANCE`
  via `POST /api/tenders/:id/pregao/lances`.
- Respeita o `maxLances` combinado, o decremento do edital (`passoDosLances`) e o
  plano de disputa (MARGEM vs EQUILÍBRIO).
- **Já detecta cláusula de vedação a robô no edital** — `detectarVedacaoARobo`
  em `src/lib/bela/regrasDoEdital.ts`.

Hoje o cliente alimenta o melhor lance na mão (digita ou dita "o lance está em
180 mil"). A Bela reage; nada age no portal.

## 2. O que falta para ser "robô"

Só uma coisa, e é a mais delicada: **conectar na sessão do pregão para agir** —
(a) ler o melhor lance ao vivo sem o cliente digitar, e (b) preencher/enviar o
lance. Isso exige estar dentro da sessão logada do Compras.gov.br, que é onde
moram credencial, certificado, CAPTCHA e os termos de uso da plataforma.

## 3. Arquitetura: extensão no PC do cliente (nunca no servidor)

```
  PC do cliente (logado no portal, como sempre)
  ┌───────────────────────────────────────────┐
  │  Navegador do cliente                       │
  │   • sessão do Compras.gov.br (login é dele) │
  │   • Extensão "Bela na disputa" (MV3)        │
  │       - LÊ o melhor lance do DOM da página  │
  │         que o cliente já tem aberta         │
  │       - fala com nossa API com o TOKEN de   │
  │         sessão do próprio cliente           │
  └───────────────┬─────────────────────────────┘
                  │ HTTPS (token do cliente)
                  ▼
  Nossa API  →  POST melhor lance  →  Bela avalia  →  devolve sugestão
                  ▲
                  │ o cliente confirma o lance (um toque)
```

Por que extensão, e não servidor:

- **A senha e o certificado do cliente nunca saem do PC dele.** O servidor não
  guarda, não vê, não transita. Isto é regra dura (seção 5) e ficou mais
  importante ainda depois do incidente do Railway (21/10): não abrir cofre de
  identidades.
- A extensão age **na sessão que o cliente já abriu e logou**. Ela não faz login,
  não resolve CAPTCHA, não automatiza autenticação.
- Se um dia virar "servidor que loga sozinho", só com cofre cifrado (chave fora
  do banco), consentimento LGPD explícito e decisão acordada — **desligado por
  padrão**. Não é o caminho atual.

## 4. Etapas (do plano aprovado em 20/10, do mais seguro ao mais sensível)

### Etapa 1 — Ler a disputa (só leitura) — PRONTA PARA CONSTRUIR
A extensão lê o melhor lance do DOM da página de disputa que o cliente já tem
aberta e manda para a Bela, que reage sozinha. O cliente **continua dando o
lance na mão no portal**. Ganho: ele não precisa mais digitar/ditar cada melhor
lance; a Bela acompanha em tempo real.
- Risco: baixo. É leitura de uma página que o cliente já vê; nenhum lance é
  enviado; nenhuma credencial é tocada.
- Depende de: ver a estrutura real do DOM da sessão de disputa (só dá para
  fixar os seletores vendo uma sessão ao vivo — fazer juntos).

### Etapa 2 — Preencher com clique do cliente
A extensão **escreve** o valor sugerido no campo de lance do portal; o cliente
confere e **clica enviar**. Nada é enviado sem o clique dele.
- Risco: médio. Já escreve na página do portal. Precisa respeitar os termos de
  uso e a cláusula de vedação a robô do edital.

### Etapa 3 — Automático, com trava
A extensão envia o lance sozinha, **somente** dentro destas travas, todas
obrigatórias ao mesmo tempo:
- piso de preço aprovado pelo cliente para aquele pregão (nunca abaixo do
  equilíbrio);
- teto de número de lances (`maxLances`);
- edital sem vedação a robô (`detectarVedacaoARobo` precisa dar "liberado");
- confirmação prévia do cliente para ligar o automático naquela disputa;
- parecer jurídico aprovado (seção 6).
- Risco: alto. Só depois de 1 e 2 maduras e do parecer.

## 5. Regras duras (não negociáveis)

1. Senha e certificado do cliente **nunca** no servidor. Só no PC dele.
2. **Nunca** burlar CAPTCHA nem automatizar login/autenticação.
3. Todo lance que compromete dinheiro precisa de **confirmação humana** até a
   Etapa 3, e mesmo nela só liga com as travas da seção 4.
4. Respeitar a cláusula de vedação a robô do edital (já detectada no código).
5. Limites de lance aprovados pelo cliente, por pregão.
6. Respeitar os termos de uso da plataforma (Compras.gov.br e outras).
7. Nenhuma superfície nova na API sem revisão de segurança (autenticação, limite
   de requisições, CORS) — ainda mais depois do incidente do Railway.

## 6. Jurídico (antes da Etapa 3)

Robô de lance em pregão eletrônico é assunto de parecer, não de palpite. Levar ao
advogado antes de ligar o automático:
- termos de uso do Compras.gov.br e das demais plataformas (uso de automação);
- jurisprudência do TCU sobre robôs de lance;
- norma infralegal aplicável (a citação exata precisa ser conferida pelo
  advogado — não fixar aqui de memória);
- cláusula do edital (o sistema já lê; o parecer diz o que fazer quando ela
  existe).
- LGPD: consentimento do cliente para a extensão e para o tratamento dos dados da
  disputa.

## 7. Pontos de extensão exatos no código de hoje

Mapeado em 22/10 (leitura do subsistema). Onde cada peça pluga:

| Peça nova | Onde pluga |
|---|---|
| Ingestão do melhor lance vindo da extensão (Etapa 1) | Novo endpoint autenticado pela sessão do cliente; reaproveita `POST /api/tenders/:id/pregao/lances` com `origem: MELHOR_LANCE` (`src/api/routes/pregao.ts`). |
| Sugestão para a extensão/cliente | Já existe: `avaliacao.sugestao` em `montarPainel` (`src/api/routes/pregao.ts`) via `avaliarLance` (`src/lib/bela/copiloto.ts`). |
| Confirmar cada lance | Já existe: botão "Dei este lance" → `registrarMeuLance` (`web/.../pregao/page.tsx`). |
| Estado "sugerido → enviado → confirmado" (Etapas 2/3) | Novo valor em `enum OrigemDoLance` (ex.: `LANCE_AUTOMATICO`) e campo de status em `PregaoLance` (`prisma/schema.prisma`), migration aditiva escrita à mão. |
| Trava por vedação a robô | `regrasDoEdital.vedacaoARobo` (`src/lib/bela/regrasDoEdital.ts`) como guarda de qualquer envio automático. |
| Tempo real na tela (se a Etapa 1 precisar empurrar) | Não existe canal hoje (sem socket/SSE). Começar por polling do painel; SSE só se precisar. |
| Extensão (MV3) | Diretório novo e isolado, fora de `src/` e `web/`. Não é deployado no Railway/Vercel; o cliente instala no navegador dele. |

## 8. Segurança da peça nova (pós-incidente Railway)

- A extensão autentica com o **token de sessão do próprio cliente**; não há
  credencial de portal em lugar nenhum do nosso lado.
- O endpoint de ingestão entra com autenticação, limite de requisições e CORS
  restrito, e passa pela revisão de segurança (o vigia de `scripts/ops/vigia.ts`
  já cobre picos de erro e acessos anômalos).

## 9. Status e próximo passo

- **Hoje:** co-piloto manual completo (sugestão + confirmação em um toque).
- **Etapa 1 especificada**, pronta para construir **junto com o Márcio**, porque
  depende de ver o DOM de uma sessão de disputa real para fixar os seletores.
- **Etapas 2 e 3** dependem da Etapa 1 madura e do parecer jurídico.
- Nada da automação de portal foi ligado sem revisão — de propósito.
