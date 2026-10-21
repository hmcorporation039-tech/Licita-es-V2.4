# Login em duas etapas dos administradores

## Como funciona

1. **Obrigatório para administradores.** Em produção, as rotas `/api/admin/*` só respondem a quem ativou o login em duas etapas e entrou com o código. Sem ele, a API responde `403 SEGUNDO_FATOR_PENDENTE` e a tela de administração mostra o passo a passo para ativar. Clientes não usam (ainda).
2. **Ativar.** Em Minha conta (ou na própria tela de administração): senha, QR code para o Google Authenticator, Microsoft Authenticator ou Authy, e o código de 6 dígitos. Na ativação saem 8 códigos de recuperação, mostrados uma única vez. Todas as outras sessões da conta caem.
3. **Entrar.** E-mail e senha, depois o código do aplicativo (ou um código de recuperação). O primeiro passo devolve um desafio que vale 5 minutos. Errar 10 códigos em 15 minutos trava a conta por 15 minutos.
4. **Ações sensíveis pedem o código de novo** se a última confirmação tem mais de 15 minutos:
   - reembolsar, cancelar assinatura, criar ou alterar cupom;
   - criar usuário, alterar usuário (inclusive dar admin), trocar senha de usuário;
   - trocar plano ou cotas de empresa, criar ou alterar plano;
   - exportar a auditoria.

   A tela abre uma janela pedindo o código e refaz a ação sozinha.
5. **Trocar de celular** em Minha conta: senha mais um código do celular atual (ou de recuperação). O aparelho antigo para de valer quando o novo é confirmado.
6. **Auditoria.** Ficam registrados ativação, códigos errados, uso de código de recuperação, renovação dos códigos e cada confirmação. O uso de um código de recuperação também manda um alerta por e-mail para o administrador.

## Perdeu o celular e os códigos de recuperação

Outro administrador não consegue desligar pelo painel, de propósito. Desligue pelo script, com acesso ao Railway:

```
railway run -s api -- npx tsx scripts/ops/segundoFator.ts situacao <email>
railway run -s api -- npx tsx scripts/ops/segundoFator.ts desligar <email>
```

O `desligar` apaga o segredo e os códigos, derruba as sessões e registra na auditoria. No próximo login, a conta cadastra o aplicativo de novo.

## Cuidados

- O segredo do aplicativo fica cifrado (AES-256-GCM) com uma chave derivada do `JWT_SECRET`. Um backup do banco sozinho não revela os segredos. **Se o `JWT_SECRET` for trocado, todos os administradores precisam do script `desligar` e de ativar de novo.**
- Os códigos de recuperação ficam só como resumo SHA-256; ninguém consegue lê-los depois de mostrados.
- Fora de produção, `SEGUNDO_FATOR_DO_ADMIN=desligado` dispensa a exigência (usado no E2E). Em produção essa variável é ignorada.
