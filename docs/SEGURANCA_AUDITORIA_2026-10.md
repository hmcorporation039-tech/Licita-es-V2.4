# Auditoria de segurança (outubro/2026)

Três revisões independentes (cadastro/autenticação; isolamento entre empresas e permissões das rotas; configuração,
front-end e dependências). `npm audit` (API e site): **0 vulnerabilidades**. Nenhum achado de severidade alta no isolamento
entre empresas: não há IDOR nem rota sem autenticação.

## Corrigido
| Achado | Correção |
|---|---|
| **Alta:** a cota de IA só contava análises *concluídas*; dava para disparar dezenas ao mesmo tempo (e repetir as que falham) e estourar o custo | A cota agora conta as análises **em andamento** (janela de 30 min) e há teto de **10 pedidos/hora por empresa**, mesmo que falhem (`quotaService.ts`) |
| Duas tentativas de login erradas de um terceiro podiam trancar a conta de outra pessoa | Limite por conta subiu de 10 para 40 falhas/15 min (barra adivinhação distribuída sem permitir trancar a conta alheia com poucos chutes) |
| `rawJson` (payload bruto dos coletores) ia ao cliente em 7 respostas | Removido de lista de licitações, detalhe, matches, dashboard e escolhidas (`lib/tenderPublico.ts`) |
| `GET /api/company` devolvia a linha inteira (inclui ajustes comerciais) | Campos explícitos |
| Qualquer membro apagava todos os matches da empresa | Só o dono, e fica na auditoria (`MATCHES_APAGADOS`) |
| `rematch` e rotas do estudo sem limite próprio; e-mails em enxurrada | Limites por usuário; teto de 20 e-mails por rematch |
| Sem teto de documentos por empresa / arrays sem `.max()` / `uasg/by-codes` sem limite | 300 documentos, 300 itens de checklist, 2000 caracteres e 50 códigos |
| `urlGuard` não via IPv4 embutido em IPv6 hexadecimal (`::ffff:a00:1`), NAT64 etc. | Reescrito com análise dos bytes; mais faixas IPv4 reservadas; 5 grupos de teste |
| URL do PNCP montada com identificadores sem validar | Só dígitos (CNPJ de 14, ano de 4, sequencial) |
| Coletores sem teto de resposta nem de redirecionamentos | 50 MB e 3 redirecionamentos (exceção documentada: SEST SENAT, 800 MB) |
| Leitura de PDF sem limite de tempo | 90 s e erro claro |
| Sessão de 30 dias com token no navegador | **7 dias** por padrão (`SESSION_DAYS`, 1 a 30); a sessão continua sendo revogada na hora ao trocar a senha |
| `trust proxy` fixo em 1 | `TRUST_PROXY_HOPS` (padrão 1) — aumente se entrar outro proxy na frente (ex.: Cloudflare) |
| Faltavam HSTS e `rel="noopener"` | Incluídos |
| Bug do Radar: `replace(/D/g, ...)` em vez de `/\D/g` | Corrigido |

## Não feito (e por quê)
| Item | Motivo / próximo passo |
|---|---|
| Token de sessão em cookie `HttpOnly` | O site (vercel.app) e a API (railway.app) são domínios diferentes; cookie entre eles é de terceiros e bloqueado por Safari/Chrome. Fica viável com **domínio próprio** (ex.: `app.suaempresa.com.br` e `api.suaempresa.com.br`) — aí migro para cookie `HttpOnly; Secure; SameSite=Lax` |
| CSP sem `'unsafe-inline'` (nonce) | O Next injeta scripts de hidratação sem nonce; exige middleware e modo dinâmico. Não há XSS conhecido nem `dangerouslySetInnerHTML` no site |
| Contadores de limite de requisição no Redis | Hoje ficam na memória (1 instância). **Não enviei porque não consegui testar contra um Redis real** e uma falha silenciaria os limites. Fazer junto com a 2ª réplica, com teste num Redis de verdade |
| Convite de membro cria a conta já confirmada, com senha do dono | Trocar por convite com link (token) por e-mail; junto com a fase de cobrança |
| Índice `pg_trgm` para os filtros `contains` da lista de licitações | Otimização; avaliar quando a base crescer |
| Limite de páginas no parser de PDF | O limite de tempo cobre o caso grave; avaliar um teto de páginas |
