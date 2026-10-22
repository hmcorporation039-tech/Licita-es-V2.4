# Adaptador do Compras.gov.br — modelo da sala de disputa

Este documento é o levantamento feito a partir do **material público** do Compras.gov.br
para adiantar o adaptador de automação do pregão (ver `src/services/portais/comprasGovBr.ts`).
Ele separa o que já é **certo pelo manual oficial** do que só pode ser **confirmado numa
sessão de disputa real** (seletores de tela do fornecedor). O vocabulário de fases e os
tempos dos modos de disputa estão codificados em `src/lib/bela/disputaComprasGovBr.ts`.

> **Regra que não muda:** o login é pelo gov.br com **CAPTCHA**, que não é automatizável.
> O robô **nunca loga sozinho**. A pessoa loga no navegador e o robô atua dentro da sessão
> já autenticada. Onde o edital **veda robô**, não há automação (a Bela só sugere).

## 1. Como o fornecedor chega na disputa

1. `comprasnet.gov.br/seguro/loginPortal.asp` → perfil **Fornecedor Brasileiro** → **Entrar com Gov.br**.
2. Login único gov.br (CPF → senha → CAPTCHA/2FA) — **manual, da pessoa**.
3. Área de Trabalho do Fornecedor → menu **Compras → Licitação e Dispensa (novo)**, que
   redireciona para o sistema novo em `cnetmobile.estaleiro.serpro.gov.br` (Comprasnet 4.0).
4. Dentro do pregão em que a empresa tem proposta, a **sala de disputa** do item/grupo.

A sala de disputa só existe quando o pregão está com a **sessão pública aberta** e o item em
fase de lances. Antes disso não há tela de lance para mapear.

## 2. Modelo de dados que o robô precisa (por item/grupo)

O adaptador precisa **ler** e **agir** sobre cada alvo em disputa:

| Campo | Para que serve | Fonte |
|---|---|---|
| `melhorLance` | melhor (menor) lance atual do item/grupo | alimenta `motorDeLance.decidirLance` |
| `meuMenorLance` | meu melhor lance já dado | evita cobrir a si mesmo |
| `minhaPosicao` | classificação atual | contexto para a pessoa |
| `fase` | aguardando / em disputa / prorrogação / encerrado… | decide se **aceita lance** agora |
| `tempoRestanteSeg` | cronômetro do item | timing do lance (iminência, prorrogação) |
| `intervaloMinimoReais` | intervalo mínimo entre lances do item | já tratado no `motorDeLance`/`copiloto` |

Ação única de escrita: **enviar um lance** (valor + confirmação). O `piso` vem do nosso
`valorFinalMinimo` por alvo — o robô **nunca** envia abaixo dele.

Isso encaixa direto na interface que já existe em `src/services/portais/tipos.ts`
(`lerMelhorLance` → `SituacaoDaDisputa`, `darLance`).

## 3. Fases do item (vocabulário oficial)

Do *Manual da Nova Sala de Disputa* (Comprasnet 4.0). Codificado em `FASES_DO_ITEM`:

- **Aguardando disputa** — ainda não abriu; não aceita lance.
- **Em disputa / Etapa aberta** — fase de lances; **aceita lance**.
- **Etapa aberta prorrogação** — houve lance nos 2 min finais; **aceita lance**.
- **Aguardando decisão sobre Reinício** — não aceita lance.
- **Encerrado** — fim da fase competitiva.
- **Deserto / Fracassado / Cancelado** — sem disputa útil.

O fornecedor pode ver, por item: **Propostas iniciais**, **Melhores valores por fornecedor**
e **Todos os lances**.

## 4. Modos de disputa (regras de tempo)

Codificado em `MODOS_DE_DISPUTA`. Base: IN SEGES/ME nº 73/2022.

- **Aberto:** lances públicos e sucessivos por **10 min**; o sistema **prorroga 2 min**
  sempre que houver lance nos 2 min finais. (É o caso em que o robô mais atua.)
- **Aberto e fechado:** etapa aberta de **15 min**, **aviso de iminência**, encerramento;
  depois **lance final fechado (sigiloso)** do 1º colocado e dos que ficaram até 10% acima.
- **Fechado e aberto:** propostas fechadas e, depois, etapa aberta entre os classificados.

Implicação para o robô: no **aberto**, dar lance respeitando o intervalo configurado e o
piso; perto do fim, atenção à prorrogação. No **aberto e fechado**, o robô de etapa aberta
atua na fase aberta; o **lance final fechado** é uma decisão única (um valor só) e deve
sempre passar por **confirmação da pessoa**.

## 5. Item × Grupo × Lote

- **Item:** disputa isolada de um produto/serviço.
- **Grupo (lote):** vários itens disputados em conjunto; o lance é no grupo. Grupos
  priorizados abrem antes. O nosso `criterio` (UNITARIO / TOTAL_DO_ITEM) e os alvos do
  pregão já contemplam isso; o adaptador precisa saber se o alvo da tela é item ou grupo.

## 6. O que FALTA — captura na sessão de disputa real

Só isto depende de ver a tela do **fornecedor** logada numa disputa aberta (o manual
público cobre a visão do pregoeiro, não os seletores da tela de lance do fornecedor):

- [ ] Seletor do **melhor lance atual** por item/grupo.
- [ ] Seletor do **meu lance** / **minha posição**.
- [ ] Seletor do **status/fase** do item (texto a casar com `classificarFase`).
- [ ] Seletor do **cronômetro / tempo restante**.
- [ ] **Campo do valor do lance** e **botão de enviar** (nome exato) + tela de confirmação.
- [ ] Como a tela distingue **item** de **grupo**.
- [ ] URL/rota real da sala de disputa no `cnetmobile.estaleiro.serpro.gov.br`.
- [ ] Como a sessão autenticada é mantida (cookies/headers) para o robô dirigir o navegador.

Com esses pontos preenchidos, o `comprasGovBrAdapter` sai de `SESSAO_REAL_PENDENTE` para
implementação real, reaproveitando `motorDeLance`, `roboDeDisputa` e este vocabulário.

## Fontes

- Manual da **Nova Sala de Disputa (Visão Governo)**, Comprasnet 4.0 — gov.br/compras
  (fases dos itens, prorrogação de 2 min, visões por item, item/grupo).
- IN SEGES/ME nº 73/2022, art. 24 (modos de disputa) e art. 19 (valor final mínimo).
- Páginas de apoio sobre a fase de lances do pregão eletrônico (fluxo do fornecedor:
  acompanhar preço, posição, lances registrados, mensagens do pregoeiro e tempo restante).
