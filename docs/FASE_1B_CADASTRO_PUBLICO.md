# Fase 1b — Cadastro público (versão 2.4)

Qualquer pessoa pode criar uma conta de teste: cadastro, confirmação de e-mail, recuperação de
senha e um período gratuito **uma única vez por CPF/CNPJ**. A cobrança continua fora (Fase 1c).

## Fluxo

1. `/cadastro` → `POST /api/auth/register` (sempre responde **202**, igual para qualquer situação).
2. O sistema cria a empresa (plano **Teste**) e o usuário dono, com prazo de acesso de **14 dias**
   (`TRIAL_DIAS`), e envia o e-mail de confirmação (link válido por 48 h, uso único).
3. A tela de cadastro passa a pedir o **código de 6 dígitos** enviado ao e-mail → `POST /api/auth/verify-email` `{ email, codigo }`. Só depois disso o login é liberado (a conta entra sozinha).
4. `/esqueci-senha` → `POST /api/auth/forgot-password`; `/redefinir-senha?token=…` →
   `POST /api/auth/reset-password` (link válido por 1 h, uso único).
5. Teste vencido: o login responde 403 com `code: "ACESSO_EXPIRADO"` até o administrador estender
   (`Admin → Usuários → +30 dias`) ou mudar o plano.

Também novos: página inicial pública com os planos (`GET /api/public/plans`), `/termos` e
`/privacidade` (**minutas**), e o botão **confirmar e-mail** do administrador (para clientes que não
recebem a mensagem, ou enquanto o envio não está configurado).

## Para ligar o envio de e-mail (você)

O código está pronto; falta a conta no provedor. Sem `RESEND_API_KEY` nada é enviado (o motivo vai para
o log) e as contas novas ficam esperando confirmação, que o administrador pode fazer à mão.

1. Crie uma conta em https://resend.com e **verifique o domínio** de envio (registros DNS).
2. No Railway, nos serviços **API** e **Workers** da 2.4, defina:
   - `RESEND_API_KEY` = a chave criada no Resend
   - `EMAIL_FROM` = `Monitor de Licitações <noreply@SEU-DOMINIO>` (domínio verificado)
   - `APP_URL` = `https://licita-es-v2-4.vercel.app` (ou o domínio final)
3. Redeploy dos dois serviços. Teste criando uma conta e olhando a caixa de entrada (e o spam).

## Garantias (e como são testadas)

Teste de integração com banco real: [tests/integracao/cadastro.test.ts](../tests/integracao/cadastro.test.ts).

| Garantia | Como |
|---|---|
| Não revela se e-mail/documento já têm conta | Mesma resposta (byte a byte) e custo de bcrypt sempre pago; o dono do e-mail recebe um aviso |
| Um teste por CPF/CNPJ | Documento validado (dígitos) e único; a máscara não é brecha |
| Login só após confirmar o e-mail | `403 EMAIL_NAO_VERIFICADO` com a senha certa; contas antigas são migradas como confirmadas |
| Link de uso único e com validade | Só o hash fica no banco; consumo atômico; um novo pedido invalida o anterior |
| Recuperar a senha derruba as sessões | `tokenVersion` incrementado; a senha antiga para de valer |
| Sem spam de e-mail | Intervalo de 1 min por conta/tipo + limite por IP |
| Anti-robô básico | Campo-isca invisível + limite por IP/hora |
| Auditoria | `CADASTRO_CRIADO/RECUSADO`, `EMAIL_VERIFICADO`, `RECUPERACAO_SOLICITADA`, `SENHA_REDEFINIDA_POR_EMAIL` — sem e-mail nem documento digitado nos casos recusados |

## Limites conhecidos (decisões para depois)

- **Anti-robô forte:** o campo-isca e o limite por IP barram o básico. Se aparecer abuso real, o passo
  seguinte é um CAPTCHA (ex.: Cloudflare Turnstile) no formulário.
- **Um teste por documento, não por pessoa:** quem usar outro CPF/CNPJ ganha outro teste. É o limite
  natural dessa regra; a defesa extra seria validar o CNPJ na Receita.
- **Termos e Privacidade são minutas** (versão `2026-10-minuta-1`, gravada no aceite de cada usuário).
  Precisam de advogado antes do lançamento comercial; os campos entre colchetes (foro, razão social,
  DPO, prazos de retenção) estão em aberto.
- Convidados pelo dono da empresa e contas criadas pelo admin **não** passam pela confirmação de e-mail.

## Confirmação por código (substitui o link)
- O e-mail traz **só** o código e a frase "Digite o código na tela de cadastro e confirme o seu acesso." (sem link, botão, nome ou marca).
- Código de 6 dígitos, vale **15 min**, uso único, **5 tentativas** erradas e ele é queimado (é preciso pedir outro; reenvio a cada 60 s).
- No banco (`auth_tokens`) fica só o **HMAC-SHA256** do código (segredo do servidor + id da conta) e o número de tentativas — nunca o código em claro.
  Isso dá auditoria sem guardar uma credencial: a trilha registra `CODIGO_ENVIADO`, `CODIGO_INCORRETO` (com nº da tentativa), `CODIGO_BLOQUEADO` e `EMAIL_VERIFICADO`, com IP e data.
- Limites: por IP e **por conta** (12 tentativas/15 min). Respostas iguais para e-mail desconhecido, conta já confirmada e código errado (não revela quem é cliente).
- Pré-sequestro: quem cadastra o e-mail de outra pessoa não recebe o código, então não ativa a conta. Cadastro pendente é substituído por um novo.
- Redefinição de senha continua por link (o e-mail traz o botão), com validade de 1 h.
- Migration `00000000000021_codigo_de_confirmacao` (coluna `attempts`).

## E-mail que já tem conta: a tela avisa (decisão de produto)
Quem tenta cadastrar um e-mail **já cadastrado** recebe `409 EMAIL_JA_CADASTRADO` e a tela mostra um aviso com os caminhos
"Entrar" e "Recuperar o acesso (esqueci minha senha)". O dono do e-mail também recebe o aviso por e-mail (no máximo 1 por hora).
- Antes a tela respondia sempre igual e ficava esperando um código que nunca chegava (confuso para quem já era cliente).
- **Custo conhecido:** essa resposta permite descobrir se um e-mail tem conta. Mitigações: limite por IP (10 cadastros/h), captcha
  opcional (Turnstile), teto global por hora e bloqueio de e-mails temporários.
- **CPF/CNPJ já usado NÃO é revelado:** continua a resposta neutra (202), por ser mais sensível (expõe que uma empresa é cliente).
- E-mail com cadastro **ainda não confirmado** não conta como "já cadastrado": o novo cadastro substitui o pendente e envia um novo código.

## CNPJ/CPF que já tem cadastro: a tela avisa (decisão de produto, substitui a resposta neutra)
Quem tenta cadastrar o CNPJ/CPF de uma empresa já cadastrada, com **outro e-mail**, recebe `409` e a tela explica:
- `DOCUMENTO_JA_CADASTRADO`: "Já existe um cadastro para este CNPJ" — opções: entrar, recuperar o acesso, ou pedir ao responsável
  que convide a pessoa (Empresa → Membros).
- `DOCUMENTO_PENDENTE`: o cadastro existente ainda não foi confirmado — a pessoa deve digitar o código enviado ao e-mail usado nele
  (cadastro pendente há mais de 48 h é liberado e substituído).
- O **e-mail do cadastro existente não é mostrado**. O dono da conta recebe um e-mail "Tentativa de cadastro com o CNPJ da sua empresa"
  (no máximo 1 por hora por destinatário). Nenhuma conta nova é criada e nenhum teste grátis extra é concedido.
- **Custo conhecido:** a resposta permite descobrir se um CNPJ/CPF é cliente. Mitigações: limite por IP, captcha opcional, teto global por hora.
