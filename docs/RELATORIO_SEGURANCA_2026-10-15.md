# Relatório de Segurança: Monitor de Licitações 2.4, 15/10/2026

**Sistema:** API Express + Prisma (Railway), workers BullMQ e frontend Next.js 16 (Vercel).
**Versão analisada:** `main` depois dos PRs #32 (documentos da licitação) e #33 a #35.

## Resumo

| Item | Resultado |
|---|---|
| Achados críticos | 0 |
| Achados altos | 1, **corrigido no mesmo dia** (#33) |
| Achados médios | 2, **corrigidos** (#33, #34) |
| Achados baixos | 4 corrigidos; 4 aceitos e registrados (seção 4) |
| Dependências de produção (`npm audit --omit=dev`) | **0 vulnerabilidades** (API e web) |
| Segredos no histórico do git (gitleaks, 85 commits) | **0 reais** (5 alertas, todos valores fictícios de teste) |
| Varredura dinâmica OWASP ZAP (full scan, local) | **0 falhas**, 137 regras OK, 5 avisos baixos |
| Análise estática Semgrep (OWASP Top 10, TS, Node, React, JWT, segredos) | 18 alertas, **0 confirmados** após triagem |

## 1. O que foi feito

1. **Auditoria de código white-box**, no estilo teste de invasão. Foram lidos o encadeamento de middlewares (`server.ts`), as rotas, os serviços e as bibliotecas usadas nos caminhos críticos. Prioridades: acesso entre empresas (IDOR), autenticação, injeção, upload, SSRF, XSS, negação de serviço, segredos e abuso de regra de negócio.
2. **Prova de conceito local** de cada achado alto antes de corrigir, e o mesmo ataque refeito depois da correção.
3. **Ferramentas:**
   - **Semgrep** (Docker), com os conjuntos `p/owasp-top-ten`, `p/typescript`, `p/nodejsscan`, `p/react`, `p/jwt` e `p/secrets`;
   - **OWASP ZAP** `zap-full-scan` (spider e ataque ativo) contra o site rodando localmente;
   - **gitleaks** em todo o histórico;
   - `npm audit` na API e no web.
4. **Cabeçalhos de produção:** verificação **passiva** (só leitura da resposta, sem ataque).
5. **Isolamento:** nenhum teste invasivo rodou contra produção. Os testes de integração rodaram em Postgres descartável (Docker), apagado ao final.

## 2. Achados e correções

| # | Gravidade | Achado | Status |
|---|---|---|---|
| 1 | **Alta** | Um PNG de 70 bytes enviado como logomarca derrubava o processo da API para todas as empresas: o erro estourava num callback assíncrono do `png-js`, fora de `try/catch`. Variantes: PNG que declara 60000×60000 (estouro de memória) e filtro de linha inválido. Qualquer conta de teste conseguia. | **Corrigido (#33).** O PNG é validado por inteiro e de forma síncrona antes do pdfkit: assinatura, IHDR, até 4000 px e 12 MP, descompressão com teto e byte de filtro de cada linha. O processo registra e reinicia de forma controlada em `uncaughtException`. Os 3 ataques foram refeitos e recusados. |
| 2 | Média | Geração de PDF reembutia a logo (até 2 MB) em cada página. Com 200 quebras de página, uma requisição de poucos KB ocupava centenas de MB. | **Corrigido (#33).** A logo é aberta uma vez por PDF, com teto de 40 quebras e 200 mil caracteres por documento. |
| 3 | Média | O dono da empresa criava membro já "verificado" com e-mail de terceiro: impedia o dono real de se cadastrar e permitia usar o domínio da plataforma para enviar e-mails a terceiros. | **Corrigido (#34).** O membro confirma o próprio e-mail com código no primeiro acesso. |
| 4 | Baixa | 40 falhas de login contra um e-mail trancavam a vítima, mesmo com a senha certa. | **Corrigido (#34).** Limite por conta + IP, com teto global por conta (300) contra ataque distribuído. |
| 5 | Baixa | `PATCH /api/company` devolvia a linha inteira (ajustes comerciais internos). | **Corrigido (#34).** Mesmo `select` explícito do GET. |
| 6 | Baixa | Checklist e plano de participação sem teto de tamanho (abuso de armazenamento). | **Corrigido (#34).** `.max()` em listas e textos. |
| 7 | Baixa | Cabeçalho `x-nome-arquivo` mal codificado gerava erro 500 e alerta falso. | **Corrigido (#33).** |
| 8 | Baixa | A busca de empresas do admin pegava os dígitos de qualquer texto e comparava com o CNPJ (resultados errados). | **Corrigido (#35).** |

## 3. Verificado e seguro

- **Acesso entre empresas:** todas as rotas com `:id` filtram por `companyId` (`assertOwnership` ou chave composta empresa+licitação). Rotas de admin exigem `requireAuth` + `requireAdmin` no router.
- **Mass assignment:** os schemas `zod` não aceitam `role`, `companyId`, `plan` nem `isAdmin`. CPF e CNPJ ficam travados depois de preenchidos.
- **Autenticação:**
  - JWT HS256 com algoritmo fixo e revogação por `tokenVersion` (logout, troca de senha, desativação);
  - bcrypt com comparação em tempo constante;
  - token de redefinição de 256 bits, guardado só como hash, de uso único e válido por 1 h;
  - código de confirmação com HMAC, tentativas limitadas e validade de 15 min.
- **SQL:** só `$queryRaw` em template tagueado, sem `Unsafe`.
- **SSRF:** `urlGuard` com allowlist https, bloqueio de IP privado na resolução de DNS (inclusive redirect e rebinding) e revalidação a cada salto.
- **Uploads:**
  - tipo detectado pelos bytes, e não pela extensão;
  - download como anexo com `nosniff`;
  - nome sanitizado;
  - cota por empresa;
  - ZIP montado só com nomes seguros.
- **Frontend:** sem `dangerouslySetInnerHTML`; links externos passam por `safeHttpUrl`; sem open redirect.
- **E-mails:** HTML escapado; link de redefinição montado a partir de `APP_URL`, e não do cabeçalho Host.
- **Cabeçalhos em produção:** HSTS (API com `preload`), CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`. A CORS não reflete origem desconhecida.
- **Microfone (Bela):** `Permissions-Policy: microphone=(self)`, liberado só para o próprio site; câmera e localização continuam bloqueadas.
- **Pregão com a Bela:**
  - lances isolados por empresa (outra empresa recebe 404);
  - valores e textos com teto;
  - no máximo 2.000 lances por pregão e limite de requisições por usuário;
  - **a Bela não guarda login do portal nem dá lance**.

## 4. Riscos aceitos e próximos passos

| Item | Por que ficou | Recomendação |
|---|---|---|
| CSP com `script-src 'unsafe-inline'` e token de sessão em `localStorage` | Hoje não há ponto de XSS no código, mas se um surgir no futuro a sessão de 7 dias pode ser roubada. | Migrar para CSP com nonce (middleware do Next) e avaliar cookie `HttpOnly`. |
| Condição de corrida nas cotas do plano | Requisições paralelas conseguem passar 1 ou 2 itens do limite. Impacto comercial pequeno. | Contar e criar na mesma transação. |
| Teto global de 60 cadastros não confirmados por hora | Poucos IPs conseguem travar cadastros novos por 1 h; o captcha encarece o ataque e o admin é alertado. | Monitorar o alerta; ajustar `CADASTRO_MAX_POR_HORA` se precisar. |
| GitHub Actions por tag (`@v4`) | O token do `gh` desta máquina não tem o escopo `workflow` para alterar o arquivo. | Rodar `gh auth refresh -s workflow` e fixar por commit (11d5960… / 49933ea…). |
| `vitest` e `cypress` com vulnerabilidades | Só ferramentas de desenvolvimento, fora do servidor. | Atualizar numa manutenção. |
| Script `scripts/exportarSqlBruto.ts` com `rejectUnauthorized: false` | Script de operação manual, roda na máquina do dono. | Usar o certificado do Railway se for usado com frequência. |

## 5. Backups

| Arquivo | Quando | Verificação |
|---|---|---|
| `railway_2026-10-15_0722_antes-do-deploy-documentos.dump` (66 MB) | Antes da migration 24 | **Restaurado** num banco descartável: 7 usuários, 6 empresas, 49.310 licitações |
| `railway_2026-10-15_1549_antes-da-bela.dump` (67 MB) | Antes da migration 25 | Índice conferido (`pg_restore -l`, 23 tabelas com dados) |

Os dois ficam em `C:\Licitações\Backups-Banco`. **Contêm dados de clientes e hashes de senha:** guardar em pasta protegida e nunca no git.

## 6. Antes do lançamento

Repetir este roteiro completo depois da cobrança (Asaas): auditoria de código, Semgrep, ZAP, gitleaks e `npm audit`. Incluir ainda:
- teste das rotas de webhook de pagamento: assinatura, repetição e valores adulterados;
- revisão de que nenhum dado de cartão passa pelo servidor.
