# Extensão "Bela na disputa" na Chrome Web Store

Tudo o que o painel da loja pede, pronto para copiar. O pacote sai com `npm run extensao:pacote`
(`dist/bela-na-disputa-<versão>.zip`): é a pasta `extensao-bela/` sem o localhost de teste, e o
script recusa gerar se algo for barrar na loja (descrição longa, arquivo faltando).

## Passo a passo (dono da conta)

1. Criar a conta de desenvolvedor em https://chrome.google.com/webstore/devconsole com a conta
   Google da empresa e pagar a taxa única (US$ 5). Verificar o e-mail de contato.
2. **Novo item** → enviar `bela-na-disputa-<versão>.zip`.
3. Preencher as abas com os textos abaixo e enviar as imagens de `docs/loja-extensao/`.
4. **Visibilidade: Não listado** no começo (só quem tem o link instala). Depois de testar com
   clientes, mudar para Público.
5. Enviar para revisão. Com as permissões de site, o Google costuma levar de 1 a 7 dias.
6. Aprovada, copiar o endereço da página da extensão e pôr na Vercel como
   `NEXT_PUBLIC_EXTENSAO_BELA_URL`. O site passa a mostrar "Instalar a extensão Bela" no lugar de
   "peça ao suporte".

Nova versão: subir o `version` no `extensao-bela/manifest.json` (isso republica o navegador da Bela e fecha
as sessões abertas: fazer fora do horário de pregão), rodar o pacote e enviar em
**Pacote → Enviar nova versão**.

## Aba "Detalhes da loja"

**Nome:** Bela na disputa – Licita Bela

**Resumo (vem do pacote):** Lê o melhor lance e o chat do pregoeiro na sessão aberta no portal
e escreve o lance sugerido para você conferir e enviar.

**Categoria:** Produtividade / Ferramentas · **Idioma:** Português (Brasil)

**Descrição:**

> A Bela na disputa é a extensão da Licita Bela (www.licitabela.com.br) para quem participa de
> pregão eletrônico. Ela trabalha ao lado do portal que você já abriu e já entrou com o seu login.
>
> O que ela faz:
> • Lê o melhor lance da sala de disputa e mostra a sugestão da Bela para o seu próximo lance,
> sem passar do piso do seu estudo de custos.
> • Lê o chat do pregoeiro e avisa no computador quando chamam a sua empresa, pedem documento
> ou suspendem a sessão.
> • Escreve o lance sugerido no campo do portal, destacado, para você conferir e enviar.
> • Na tela da proposta, escreve o preço de cada item a partir do seu estudo de custos.
>
> O que ela NUNCA faz: enviar lance ou proposta, clicar em confirmar, fazer login, resolver
> CAPTCHA ou guardar senha e certificado digital. Quando o edital proíbe robô, o preenchimento
> fica desligado. Quem decide e envia é sempre você.
>
> Portais: Compras.gov.br, Portal de Compras Públicas, Licitações-e, BLL, BNC, Licitar Digital,
> LicitaNet, BEC/SP, Compras BR e Publinexo.
>
> Precisa de uma conta na Licita Bela (teste grátis por 14 dias, sem cartão).

**Site:** https://www.licitabela.com.br · **URL de suporte:** https://www.licitabela.com.br/suporte
(a loja recusa o envio se o endereço não abrir) · **E-mail de contato da conta de desenvolvedor:**
suportelicitabela@gmail.com.

## Aba "Práticas de privacidade"

**Finalidade única:** Ajudar o fornecedor durante o pregão eletrônico no portal que ele já abriu:
ler o melhor lance e o chat do pregoeiro e escrever no campo o lance e os preços sugeridos pela
Licita Bela, para a pessoa conferir e enviar.

**Justificativa das permissões:**

| Permissão | Justificativa |
|---|---|
| `storage` | Guardar no computador a sessão de acesso à Licita Bela, a licitação aberta, o último lance lido e a sugestão, para o painel mostrar e a leitura continuar ao trocar de aba. |
| `notifications` | Avisar no computador quando o pregoeiro chama a empresa, pede documento ou suspende a sessão. |
| `sidePanel` | Mostrar o painel da Bela ao lado do portal, sem cobrir a sala de disputa. |
| Acesso aos sites (portais) | Ler o melhor lance e o chat e escrever o lance sugerido somente nos portais de compras públicas listados. Nenhum outro site. |
| Acesso aos sites (licitabela.com.br e API) | Pegar a sessão de acesso da pessoa no site da Licita Bela e enviar à conta dela o lance lido e o chat. |

**Código remoto:** Não. Todo o código está no pacote.

**Dados coletados (marcar):**
- **Informações de autenticação:** a sessão de acesso à Licita Bela (não é senha).
- **Conteúdo do site:** o melhor lance e as mensagens do chat do pregoeiro.

**Declarações (marcar as três):** não vende nem transfere dados a terceiros fora dos usos
permitidos; não usa nem transfere para fins alheios à finalidade única; não usa para avaliar
crédito ou empréstimo.

**Política de privacidade:** https://www.licitabela.com.br/privacidade#extensao

## Imagens

Em `docs/loja-extensao/` (geradas da tela real da extensão):
- `captura-1280x800.png` — captura de tela (obrigatória, ao menos 1).
- `bloco-440x280.png` — bloco promocional pequeno.
- Ícone 128×128: já vai no pacote (`extensao-bela/icone-128.png`).
