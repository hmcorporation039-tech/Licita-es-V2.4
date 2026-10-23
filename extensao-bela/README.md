# Bela na disputa — extensão (Etapa 1 do robô)

Extensão de navegador que **lê** o melhor lance da sessão de pregão que o cliente
**já tem aberta e logada** e manda para a Bela sugerir o próximo lance. É a Etapa 1
do `docs/ROBO_DE_PREGAO.md`.

**O que ela faz:** só leitura. Observa o valor do melhor lance na página e envia
esse número para a API da Bela (a mesma rota que o site já usa), que devolve a
sugestão. Mostra tudo no popup.

**O que ela NÃO faz:** não envia lance, não preenche campo no portal, não faz
login, não resolve CAPTCHA e **não guarda senha nem certificado**. O login é do
cliente, na sessão dele.

## Instalar (modo desenvolvedor)

1. Chrome/Edge → `chrome://extensions` → ligar "Modo do desenvolvedor".
2. "Carregar sem compactação" → escolher a pasta `extensao-bela`.
3. Fixar o ícone da Bela na barra.

## Usar

1. Abrir o site da Bela logado e entrar na página do pregão (`/tenders/<id>/pregao`).
   A extensão pega dali o acesso (token de sessão) e o id do pregão — nada de senha.
2. Abrir a sessão de disputa no portal (Compras.gov.br), já logado.
3. No popup da extensão, clicar **Ativar leitura**.
4. A cada novo melhor lance, o popup mostra o valor lido e a **sugestão da Bela**.
   O cliente dá o lance no portal (Etapa 1 não envia nada).

## Ajustar os seletores (passo que fazemos juntos, vendo a tela real)

O arquivo `config.mjs` tem `PORTAIS[].seletoresDoMelhorLance` com candidatos
genéricos. Numa sessão de disputa real, inspecionar o elemento que mostra o melhor
lance e colocar o seletor certo no topo da lista. A leitura e o parse já estão prontos e
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
