# Checklist: colocar no ar para clientes pagantes (2.4)

Siga na ordem. Cada item diz **onde** mexer e **como conferir**. O que já está pronto no código
aparece em "Já feito"; o que depende de você aparece em "Fazer".

---

## 1. Avisos de erro para o administrador

**Já feito:** erro 500 na API, job de worker que falhou de vez (esgotadas as tentativas), rotina
diária que falhou, promessa rejeitada sem tratamento, teto de cadastros atingido e pedido de
exclusão de conta geram um aviso. O texto sai sem senhas nem chaves. Avisos iguais ficam em
silêncio por 15 minutos.

**Fazer (Railway → API e Workers → Variables → Deploy):**
- [ ] `ALERT_EMAIL` = e-mail que recebe os avisos (ex.: o seu). Usa o Resend já configurado.
- [ ] (opcional) `ALERT_WEBHOOK_URL` = webhook do Slack, Discord, Teams ou Google Chat, para avisos no celular.
- [ ] **Conferir:** derrube um worker de propósito ou peça para eu disparar um alerta de teste.

## 2. Monitor externo de disponibilidade (grátis, 5 min)

Os avisos acima não chegam se a API inteira cair. Um monitor de fora cobre esse caso.
- [ ] Crie uma conta em **UptimeRobot** (ou Better Stack), com um monitor HTTP para
      `https://api-production-4375e.up.railway.app/api/health/ready`, intervalo de 5 min, aviso por e-mail.
- [ ] Um segundo monitor para o site: `https://licita-es-v2-4.vercel.app`.

## 3. Segredo das sessões (JWT_SECRET)

Com um segredo curto, quem tiver qualquer token de sessão consegue adivinhá-lo por força
bruta e se passar por qualquer usuário, inclusive o admin.
- [ ] Veja o log da API logo depois do deploy. Se aparecer `[Segurança] JWT_SECRET tem menos de 32 caracteres`,
      gere um novo (PowerShell: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | % {[char]$_})`)
      e troque em **API e Workers**. Efeito: todo mundo precisa entrar de novo uma vez.

## 4. Banco de dados e backup

- [ ] **Fechar o acesso público do Postgres** (Railway → Postgres → Settings → Networking → remover o TCP Proxy público)
      e **regenerar a senha** (a URL pública já circulou). Com o `DATABASE_URL` por referência, nada cai.
      Se precisar do acesso público para o backup local, deixe-o ligado só enquanto o backup roda.
- [ ] Railway → Postgres → **Backups**: ligar o agendamento diário (se o seu plano tiver).
- [ ] Backup diário no servidor da empresa (máquina sempre ligada), apontando para a pasta da **2.4**:
  ```powershell
  schtasks /Create /SC DAILY /ST 03:00 /TN "Backup Banco Licitacoes 2.4" `
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Licitações\Licitacao-2.4\scripts\ops\backup-banco.ps1"
  ```
  (o `scripts\ops\.env.backup` precisa ter a URL do banco da 2.4. Ver `docs/DEPLOY_E_BACKUP.md` §4.)
- [ ] **Uma vez por mês: teste de restauração** num banco local (`restaurar-banco.ps1`, §5.1). Backup
      que nunca foi restaurado não é garantia de nada.

## 5. Cadastro público

**Já feito:**
- Um teste grátis por CPF/CNPJ. O dono não troca mais o documento depois de preenchido (antes
  dava para "soltar" o CPF e fazer outro teste).
- A confirmação de e-mail pede a senha do cadastro. Assim ninguém cadastra o e-mail de outra pessoa
  e fica com a conta (pré-sequestro).
- Se a pessoa se cadastra de novo com um e-mail ainda não confirmado, o cadastro antigo é substituído.
  Um CPF/CNPJ preso a um cadastro abandonado há mais de 48 h é liberado.
- E-mails temporários (mailinator, yopmail etc.) são recusados.
- Teto de cadastros não confirmados por hora (`CADASTRO_MAX_POR_HORA`, padrão 60), com aviso ao admin.
- Login limitado por IP **e por conta** (10 falhas em 15 min), contra ataque distribuído.
- O aviso "alguém tentou cadastrar seu e-mail" sai no máximo 1 vez por hora por pessoa.

**Fazer:**
- [ ] **Captcha** (recomendado antes de divulgar o site): no painel da Cloudflare → Turnstile → *Add site*,
      com o domínio `licita-es-v2-4.vercel.app` (e o domínio próprio, quando houver). Copie as duas chaves:
  - Railway (API): `TURNSTILE_SECRET_KEY`
  - Vercel (site): `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, e faça um Redeploy do site.
  - **Conferir:** a tela de cadastro mostra a caixa "Confirme que você é humano".

## 6. LGPD

**Já feito:** em *Minha conta → Seus dados*, o cliente baixa uma cópia dos dados (JSON) e o
dono da empresa pede a exclusão (com senha). O pedido entra na auditoria e gera um aviso ao admin.

**Executar um pedido de exclusão (prazo legal: 15 dias):**
1. Confira o pedido (auditoria: `EXCLUSAO_SOLICITADA`) e faça um backup.
2. Simule: `npm run excluir-empresa -- --empresa <id>` (mostra o que será apagado e não apaga nada).
3. Execute: `npm run excluir-empresa -- --empresa <id> --confirmar`.
   Apaga empresa, usuários e dados. A auditoria e o consumo de IA ficam, mas anonimizados.
4. Responda ao solicitante por e-mail.

**Fazer:**
- [ ] Advogado revisar `/termos` e `/privacidade`. A política precisa citar os operadores que recebem
      dados: Railway (hospedagem/banco), Vercel (site), Resend (e-mail), Google e Anthropic (análise do texto
      público dos editais), Cloudflare (captcha, se ligado). Também precisa do **contato do encarregado (DPO)**
      e de como pedir exportação e exclusão (agora pela própria conta).

## 7. Domínio e e-mail profissionais

- [ ] Domínio próprio no Vercel (site) e, se quiser, na API (Railway → Settings → Domains).
      Ao mudar, atualize `APP_URL` e `CORS_ORIGINS` (API) e `NEXT_PUBLIC_API_URL` (Vercel).
- [ ] Resend: verificar o domínio (SPF/DKIM) e usar `EMAIL_FROM` com ele. Sem isso, e-mails de
      confirmação caem no spam e o cliente não consegue ativar a conta.

## 8. Custos de IA

- [ ] Nos consoles da **Anthropic** e do **Google AI Studio**, configure **limite de gasto mensal** e
      alerta de consumo. É a proteção contra uma conta que dispare análises em massa.
- [ ] Preencha os preços (`AI_PRICE_*`) para o painel *Consumo de IA* mostrar o custo real em R$/US$.
- [ ] Confira os limites de análises por plano (Admin → Planos) contra o custo médio por análise.

## 9. Riscos conhecidos e aceitos por enquanto (baixa severidade)

| Risco | Por que ficou | Quando tratar |
|---|---|---|
| Convite de membro cria a conta já confirmada, com senha escolhida pelo dono | Só o dono de uma empresa paga consegue, e o membro troca a senha | Convite por link com token (junto com a cobrança) |
| Sessão de 30 dias guardada no navegador (localStorage) | Não há XSS conhecido e há CSP | Cookie httpOnly + sessão curta, se o produto crescer |
| Limites de requisição ficam na memória de uma instância da API | Hoje há 1 instância | Redis como store, se escalar para 2+ instâncias |
| `trust proxy 1` assume o site chamando a API direto (sem proxy da Vercel no meio) | É a configuração atual (`NEXT_PUBLIC_API_URL` aponta para o Railway) | Se um dia a API passar por rewrite da Vercel, revisar |
