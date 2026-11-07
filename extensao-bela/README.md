# Bela na disputa — extensão do navegador

Extensão que trabalha **na tela que o cliente já tem aberta e logada** no portal. Faz quatro
coisas, todas sem enviar nada sozinha:

1. **Lê o melhor lance** da sala de disputa e manda para a Bela, que sugere o próximo lance
   sem passar do piso do estudo de custos (Etapa 1 do `docs/ROBO_DE_PREGAO.md`).
2. **Lê o chat do pregoeiro** e avisa (no computador, no celular e na tela Minhas sessões)
   quando a empresa é convocada, quando pedem documento ou negociação, ou quando a sessão é
   suspensa ou retomada.
3. **Preenche o lance** sugerido no campo do portal (Etapa 2): a pessoa confere e clica em
   enviar. Com o edital vedando robô, o botão fica desligado.
4. **Preenche a proposta**: na tela de cadastro da proposta, escreve o preço de cada item
   tirado do estudo de custos. A pessoa confere e envia.

**O que ela NUNCA faz:** clicar em enviar ou confirmar, fazer login, resolver CAPTCHA,
guardar senha ou certificado. O login é do cliente, na sessão dele. Todo lance preenchido
fica na auditoria da Bela.

## Instalar (modo desenvolvedor)

1. Chrome/Edge → `chrome://extensions` → ligar "Modo do desenvolvedor".
2. "Carregar sem compactação" → escolher a pasta `extensao-bela`.
3. Fixar o ícone da Bela na barra.

## Usar

1. Abrir o site da Bela logado e entrar na licitação (o Pregão, a licitação ou o estudo de
   custos). A extensão pega dali o acesso (token de sessão) e qual é a licitação — nada de senha.
2. Abrir a sessão de disputa no portal (Compras.gov.br), já logado.
3. No popup da extensão, clicar **Ativar leitura (lance e chat)**.
4. A cada novo melhor lance, o popup mostra o valor lido, a **sugestão da Bela** e o
   **próximo lance** (piso respeitado). **Preencher no portal** escreve esse valor no campo de
   lance, destacado em laranja; você confere e envia.
5. As mensagens do pregoeiro aparecem no popup, no Pregão com a Bela e em Minhas sessões.
6. Na tela de cadastro da proposta do portal, **Preencher a proposta** escreve os preços do
   estudo de custos item por item.

## Capturar a tela da disputa (para ajustar a leitura)

Ninguém da equipe vê a tela do fornecedor durante uma disputa real, então os seletores do
`config.mjs` ainda são candidatos. Para fixá-los:

1. Com a extensão instalada, abrir a **sala de disputa** de um pregão real no Compras.gov.br
   (`cnetmobile.estaleiro.serpro.gov.br`), já logado.
2. No popup, clicar **Capturar a tela da disputa**. A estrutura da página vai para a área de
   transferência.
3. Colar num chamado de suporte da Bela.

O que vai: tag, id, classes, papéis e um trecho curto do texto de cada elemento ligado à
disputa (melhor lance, cronômetro, fase, posição, campo e botão de lance). CPF, CNPJ e e-mail
saem mascarados, e o valor digitado em campo nenhum é lido (`lib/captura.mjs`).

## Ajustar os seletores (passo que fazemos juntos, vendo a tela real)

O arquivo `config.mjs` tem, por portal, candidatos genéricos para: o melhor lance
(`seletoresDoMelhorLance`), o chat (`seletoresDoChat`), o campo de lance
(`seletoresDoCampoDeLance` e `formatoDoCampoDeLance`) e as linhas da proposta
(`seletoresDaProposta`). Com a captura da tela real, o seletor certo vai para o topo de cada
lista. A leitura e o parse já estão prontos e
testada (`lib/valor.mjs`, `tests/extensaoBela.test.ts`).

## Teste

- Automatizado: `npx vitest run tests/extensaoBela.test.ts` cobre o parser de valor
  e a extração por seletor (inclui milhar/decimal, lixo, seletor inválido).
- Ponta a ponta: depende de uma sessão de disputa real logada (acesso do cliente) —
  é o passo final, feito junto. Enquanto isso, dá para abrir uma página de teste
  com um elemento de melhor lance e conferir o popup.

## Segurança

- Token de sessão do próprio cliente, lido do site da Bela; nunca senha de portal.
- Só pede permissão para os hosts do portal, do site da Bela e da API.
- Posta na rota autenticada que já existe (`POST /api/tenders/:id/pregao/lances`,
  `origem: MELHOR_LANCE`) — sem porta nova no servidor.
