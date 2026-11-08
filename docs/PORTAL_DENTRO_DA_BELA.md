# Portal dentro da Bela

O portal da licitação abre **dentro da página "Pregão com a Bela"**, ao lado do painel da Bela. O portal não fica numa aba separada.

Funciona com **todos os portais de Meus Portais**: Compras.gov.br, Portal de Compras Públicas, Licitações-e, BLL, BNC, Licitar Digital, LicitaNet, BEC/SP, Compras BR e Publinexo. A Bela escolhe o portal pelo link do processo ou pelo nome da plataforma no PNCP, e a pessoa pode trocar antes de abrir.

Por trás, um navegador (Chromium) roda num serviço da Bela. A tela dele é transmitida para a página, e o mouse e o teclado da pessoa são repassados para ele.

## Regras que não mudam

- **Quem entra no portal é a pessoa.** Ela resolve o CAPTCHA (e o 2FA do gov.br) e clica em **Entrar**. A Bela não burla CAPTCHA.
- **Login salvo em Meus Portais:** na tela de login, o botão **Preencher meu login** escreve o usuário e a senha salvos (como um gerenciador de senhas) e não envia o formulário.
  - A senha vai da API direto para o serviço navegador, protegida por `NAVEGADOR_SEGREDO`. Ela nunca passa pela página da Bela nem pela tela do site.
  - Cada preenchimento é registrado na auditoria (`PORTAL_NA_BELA_LOGIN_PREENCHIDO`).
  - No gov.br (Compras.gov.br), o login vem em duas telas: clique em Preencher na tela do CPF e de novo na tela da senha.
- **A Bela nunca envia lance.**
  - Ela só lê o melhor lance e o chat do pregoeiro.
  - Quando a pessoa clica em **Preencher**, ela escreve no campo o lance sugerido pelo painel. Esse valor já respeita o piso, o limite de lances e a vedação de robô do edital.
  - Quem confere e clica em **Enviar** no portal é a pessoa.
- **O navegador não se disfarça.** Ele não esconde que é automatizado e não troca o user-agent.
- **Nada é guardado.**
  - Cada sessão usa um contexto novo do Chromium. Ao fechar, cookies e login são apagados.
  - Não há gravação da tela.
  - O token da pessoa fica só na memória da sessão.
- **Só portais de compras.** A página principal só navega para `https://*.gov.br` e para os domínios dos portais de Meus Portais. Imagens, scripts e o CAPTCHA de outros domínios carregam normalmente.
- **Liberado só nos planos pagos**, e só na licitação marcada como "Vou participar".

## Limites

| O quê | Valor |
|---|---|
| Sessões ao mesmo tempo | `NAVEGADOR_MAX_SESSOES` (padrão 3). Cada uma usa ~300–500 MB de RAM |
| Sessão sem a página da Bela aberta | fecha em 2 minutos |
| Sessão parada (sem mouse/teclado) | fecha em 30 minutos |
| Duração máxima | 6 horas |
| Upload para o portal | até 20 MB por envio |
| Download do portal | até 25 MB por arquivo |

Uma pessoa tem no máximo **uma** sessão. Se ela recarregar a página, volta para a mesma sessão.

Certificado digital em **token (A3)** não funciona no navegador remoto. Para esse caso, use a extensão "Bela na disputa".

## Como ligar (Railway + Vercel)

1. **Railway → New Service → GitHub Repo** (este repositório).
   - **Settings → Variables**:
     - `RAILWAY_DOCKERFILE_PATH` = `navegador.Dockerfile`
     - `API_URL` = URL pública da API (ex.: `https://api-production-4375e.up.railway.app`)
     - `NAVEGADOR_ORIGENS` = `https://licita-es-v2-4.vercel.app,https://licitabela.com.br`
     - `NAVEGADOR_MAX_SESSOES` = `3` (aumente junto com a memória do serviço)
     - `NAVEGADOR_SEGREDO` = `${{secret(48)}}` (o Railway gera um valor aleatório)
   - **Settings → Networking → Generate Domain**: anote a URL (ex.: `https://bela-navegador-production.up.railway.app`).
   - **Memória:** reserve pelo menos 2 GB para 3 sessões.
2. **Serviço da API** (Railway), em Variables:
   - `NAVEGADOR_URL` = a URL do passo 1.
   - `NAVEGADOR_SEGREDO` = `${{bela-navegador.NAVEGADOR_SEGREDO}}` (referência ao valor do passo 1; troque `bela-navegador` pelo nome do serviço).
   - Sem esse segredo, o portal abre normalmente, mas o botão "Preencher meu login" avisa que ainda não foi ativado.
3. **Vercel** (site), em Settings → Environment Variables: `NAVEGADOR_URL` = a mesma URL. Depois faça um redeploy, porque a política de segurança (CSP) do site precisa liberar a conexão com o navegador.
4. Confira: `GET https://<navegador>/saude` deve responder `{"ok":true,...}`. No site, abra uma licitação escolhida, depois **Pregão com a Bela → escolha o portal → Abrir … aqui**.

Sem `NAVEGADOR_URL`, a tela mostra "ainda não foi ativado", e a extensão continua funcionando normalmente.

## Arquitetura

```
página Pregão com a Bela ──WebSocket──► serviço navegador (src/navegador) ──► Chromium ──► Compras.gov.br / gov.br
       ▲  quadros JPEG da tela                     │
       └───────────────────────────────────────────┘
                                                   └──► API da Bela (token da pessoa): autoriza a sessão,
                                                        registra melhor lance, chat e preenchimento
```

- `src/navegador/server.ts`: HTTP (`/saude`) e WebSocket (`/sessao`). Confere a origem, recebe `entrar` com o token e chama `POST /api/portal-na-bela/sessao`.
- `src/navegador/sessao.ts`: contexto do Chromium, screencast via CDP, mouse e teclado, uploads, downloads e diálogos, limites de tempo, leitura e preenchimento.
- A leitura do melhor lance e do chat, por enquanto, só existe no Compras.gov.br (os seletores dos outros portais ainda não foram capturados). Nos outros portais, o portal abre, o login é preenchido e a pessoa usa normalmente.
- `src/navegador/leitor.ts`: injeta nas páginas as **mesmas funções da extensão** (`extensao-bela/lib` e `config.mjs`). Ao ajustar os seletores na extensão, o navegador já usa os novos.
- `src/navegador/protocolo.ts`: mensagens validadas (zod), a regra de navegação e o mapeamento de teclas.
- `src/api/routes/portalNaBela.ts`: `GET /config` (ligado? URL? plano) e `POST /sessao` (plano pago, "Vou participar", auditoria `PORTAL_NA_BELA_ABERTO`).
- `web/src/components/PortalNaBela.tsx`: a tela (canvas), a barra de navegação, o botão Preencher, os arquivos e os diálogos.

## Riscos conhecidos

- O gov.br pode pedir CAPTCHA com mais frequência ou recusar o acesso vindo de um servidor (datacenter). A pessoa resolve o CAPTCHA na tela. Se o portal recusar, use a extensão.
- **Responsabilidade:** a sessão logada da empresa existe no servidor da Bela enquanto o portal está aberto. Por isso as sessões são isoladas, curtas e descartadas ao fechar.
