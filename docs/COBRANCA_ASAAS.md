# Cobrança pelo Asaas

## Como funciona

1. **Assinar.** O dono da empresa escolhe o plano em Minha conta (ou na tela de acesso encerrado). A API cria o cliente e a assinatura no Asaas, que gera a primeira fatura com vencimento no mesmo dia. O cliente vai para a página da fatura do Asaas e paga por Pix, boleto ou cartão. O número do cartão nunca passa pela Licita Bela.
2. **Liberar.** O Asaas avisa o pagamento pelo webhook `POST /api/cobranca/webhook`. A API não confia no conteúdo do aviso: ela busca a cobrança direto no Asaas e só então aplica o efeito:
   - troca o `plan_code` da empresa;
   - grava `pago_ate` (o próximo vencimento);
   - estende `access_expires_at` de todos os usuários da empresa (menos administradores) até `pago_ate` + 5 dias.
3. **Atrasar.** A fatura vencida gera um e-mail com a data-limite. Sem pagamento, o acesso acaba sozinho 5 dias depois do vencimento, pelo mesmo mecanismo de prazo de acesso que já existia. Quando o cliente paga, o acesso volta.
4. **Cancelar.** O dono cancela em Minha conta. A assinatura sai do Asaas e o acesso vai até `pago_ate`, sem os 5 dias de tolerância.
5. **Reembolso de 7 dias.** O botão fica em Admin > Cobrança e vale só para o primeiro pagamento da empresa. Ele estorna no Asaas, cancela a assinatura e encerra o acesso na hora. O Asaas só estorna Pix e cartão; boleto se devolve por transferência no painel do Asaas, e depois é só usar "Cancelar".
6. **Cupom (Plano Fundador).** Crie o cupom em Admin > Cobrança > Cupons, por exemplo `FUNDADOR-ACME` com 35% por 12 meses e 1 vaga. No 13º mês, quando o Asaas gera a fatura, a API volta a assinatura ao preço cheio antes de mandar o e-mail.
7. **Avisos.** Só por e-mail, pelo Resend: nova fatura, fatura vencida e pagamento confirmado. As notificações do próprio Asaas ficam desligadas no cliente (`notificationDisabled`), sem SMS e sem custo extra.
8. **Multa e juros** de 2% e 1% ao mês, cobrados pelo Asaas no atraso.

Se um aviso falhar, ele fica em `eventos_de_cobranca` com o motivo, e o administrador recebe um alerta. O botão "Sincronizar" em Admin > Cobrança relê todas as faturas da assinatura no Asaas.

## Ligar em produção

Faça os passos na ordem. Nenhuma chave passa pelo chat.

1. **Chave de produção.** No Asaas (conta real), vá em Integrações > Chaves de API > Gerar chave. **Desmarque a permissão de saque.**
2. **Variáveis no Railway, serviço `api`:**
   - `ASAAS_API_KEY` = a chave (começa com `$aact_prod_`). Colar só no painel do Railway.
   - `ASAAS_AMBIENTE` = `producao`.
   - `ASAAS_WEBHOOK_TOKEN` = um texto aleatório de 64 caracteres. A sessão do Claude Code gera e grava sem mostrar.

   A API recusa uma chave que não combine com o ambiente: de teste em produção, ou o contrário.
3. **Webhook.** Numa pasta ligada ao projeto no Railway:

   ```
   railway run -s api -- npx tsx scripts/ops/webhookDoAsaas.ts criar https://api-production-4375e.up.railway.app/api/cobranca/webhook suporte@licitabela.com.br
   ```

   O script cadastra os 15 eventos de cobrança e de assinatura, com envio em ordem. `listar` mostra a situação; um webhook "pausado" quer dizer que o Asaas desistiu de entregar e é preciso reativar no painel. `apagar` remove.
4. **Teste com dinheiro de verdade.** Assine o Essencial com uma conta de teste e pague R$ 149 por Pix. Confira em Admin > Cobrança que ficou "Ativa". Depois use "Reembolsar" para receber o valor de volta.

## Testar no sandbox (PC local)

- O `.env` local tem a chave de teste (`$aact_hmlg_...`) com `ASAAS_AMBIENTE=sandbox`.
- A configuração `api-cobranca` do `.claude/launch.json` sobe a API com um `ASAAS_WEBHOOK_TOKEN` local.
- O Asaas não alcança o `localhost`. Para simular um pagamento:
  1. use `POST /v3/payments/{id}/receiveInCash` no sandbox;
  2. mande o aviso à API local com o token:

     ```
     {"id":"evt_x","event":"PAYMENT_RECEIVED","payment":{"id":"pay_..."}}
     ```

## Limites desta versão

- **Cartão sem cobrança automática.** O cliente paga cada fatura pela página do Asaas, escolhendo Pix, boleto ou cartão. A cobrança automática no cartão e o Pix Automático ficam para depois, pelo Checkout do Asaas.
- **Troca de plano pelo suporte.** Com assinatura ativa, a troca é feita pelo suporte. Antes do primeiro pagamento, o próprio cliente troca.
- **Nota fiscal por fora.** A NFS-e não sai pelo Asaas por enquanto.
