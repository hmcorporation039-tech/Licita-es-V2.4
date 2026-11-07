# Teste da extensão "Bela na disputa" numa sessão real

Para o Márcio rodar. O objetivo é fixar a leitura na tela real do Compras.gov.br. A extensão
nunca envia lance nem proposta; quem envia é você.

## Antes do dia

- Computador com Chrome ou Edge.
- Acesso de fornecedor no Compras.gov.br: gov.br prata ou ouro e empresa no SICAF.
- Uma licitação em que a empresa enviou proposta, com sessão marcada. A sala de disputa só abre para quem participa.
- Na Bela: a licitação escolhida, com o estudo de custos feito (preços de venda e o valor final mínimo no Pregão).
- O arquivo `extensao-bela-0.6.1.zip` descompactado.

## Instalar

1. Abra `chrome://extensions`, ligue "Modo do desenvolvedor".
2. "Carregar sem compactação" e escolha a pasta `extensao-bela`.
3. Fixe o ícone da Bela na barra.

## No dia da sessão

1. Na Bela, abra a licitação e entre em **Pregão com a Bela**.
2. No Compras.gov.br, já logado, abra a **sala de disputa**.
3. Clique no ícone da Bela e em **Capturar a tela da disputa**. Faça isso duas vezes: com os lances aparecendo e com o chat do pregoeiro aberto. Cole os dois resultados para o Claude.
4. Clique em **Ativar leitura (lance e chat)**.
5. Confira:
   - o "Melhor lance lido" é igual ao da tela;
   - as mensagens do pregoeiro aparecem no popup, no Pregão com a Bela e em **Minhas sessões**;
   - com o edital sem vedação a robô, aparece "Preencher R$ X no portal". Ao clicar, o valor vai para o campo de lance, destacado em laranja. **Confira e envie você.**
6. Se der diferença (valor errado, campo não achado, mensagem que não apareceu), tire um print e mande junto com as capturas.

## Proposta (quando for cadastrar uma)

1. Abra a licitação na Bela (o estudo de custos com os preços).
2. No portal, abra a tela de cadastro da proposta.
3. Clique no ícone da Bela e em **Preencher a proposta (preços do estudo)**. Use também **Capturar a tela da disputa** nessa tela e mande a captura.
4. Confira item por item e envie você.

## O que nunca acontece

- A extensão não clica em enviar, não faz login, não passa por CAPTCHA e não guarda senha.
- Edital que proíbe robô desliga o preenchimento do lance.
- Lance automático (etapa 3) só depois do parecer jurídico.
