# Fase 1a — Base comercial (versão 2.4)

Prepara a plataforma para ser vendida **sem ligar a cobrança** (a integração com o
gateway fica para a Fase 1c). O administrador `marcio@hemengetecnologia.com.br` enxerga e
audita tudo.

## O que entrou

| Item | Onde |
|---|---|
| Planos e limites (editáveis pelo painel) | tabela `plans`, [src/lib/planos.ts](../src/lib/planos.ts), `/admin/planos` |
| Cotas por plano (itens monitorados, usuários, análises de IA/mês) | [src/services/quotaService.ts](../src/services/quotaService.ts) |
| Medição de IA por empresa (tokens e custo estimado) | tabela `ai_usage`, [src/services/aiUsageService.ts](../src/services/aiUsageService.ts) |
| Trilha de auditoria | tabela `audit_logs`, [src/services/auditService.ts](../src/services/auditService.ts) |
| Painel do administrador | `/admin` (visão geral, empresas, usuários, auditoria, consumo de IA, planos) |
| Prazos em dias úteis (art. 164) | [src/lib/diasUteis.ts](../src/lib/diasUteis.ts), `GET /api/tenders/:id/prazos` |
| Teste de isolamento entre empresas | [tests/integracao/api.test.ts](../tests/integracao/api.test.ts) |

Migration: `00000000000016_base_comercial` (apenas aditiva; a 2.3 continua funcionando com este banco).

## Planos iniciais (pontos de partida, sem preço)

| Plano | Itens monitorados | Usuários | Análises de IA / mês |
|---|---|---|---|
| Teste | 3 | 1 | 3 |
| Essencial | 10 | 1 | 10 |
| Profissional | 100 | 5 | 40 |
| Empresarial | ilimitado | ilimitado | 150 |

Ajuste em **Admin → Planos**. Para um cliente específico, use **Admin → Empresas → (empresa) → Ajuste**
(vale só para ele e vence o plano). Novas contas criadas pelo administrador nascem no plano **Teste**,
a menos que outro seja escolhido.

## Regras de cota

- Estourou o limite: a API responde **402** com `{ code: "COTA_EXCEDIDA", recurso, limite, usado }` e o evento fica na auditoria.
- **Administradores da plataforma nunca são limitados.**
- A análise de edital é **compartilhada** entre empresas: só gasta cota de quem de fato dispara uma análise nova.
  Pedir uma análise que já existe é de graça.
- Itens monitorados contam todos (ativos ou não); usuários contam só os ativos.
- Tentativas de IA que falharam (status `ERRO`) não gastam a cota do cliente, mas entram no consumo medido.
- Sob requisições simultâneas a checagem é aproximada: o pior caso é passar do limite em uma unidade.

## Custo de IA

Tokens são medidos com precisão (Claude e Gemini, inclusive nas falhas). O custo em dólar é uma **estimativa** e só
aparece se estas variáveis estiverem no serviço da API e dos Workers (preço por milhão de tokens, em USD):

```
AI_PRICE_INPUT_PER_MTOK=...
AI_PRICE_OUTPUT_PER_MTOK=...
```

Confira os valores no site do provedor antes de preencher: o código não presume nenhum preço.

## Auditoria

Registra: login (ok e falha), logout, troca/redefinição de senha, usuários e membros, dados da empresa, itens
monitorados, documentos, solicitação de análise de IA, decisão de participar (de → para), mudança de plano e de
limite, estouro de cota, e **toda consulta do administrador aos dados de uma empresa** (e a exportação da própria auditoria).

- Nunca grava senha, token ou hash. Falha de login com e-mail inexistente **não** grava o e-mail digitado (muita gente cola a senha no campo errado).
- Não há chave estrangeira: o histórico sobrevive à exclusão de usuário ou empresa.
- Exportação em CSV pelo painel (`/admin/auditoria`), com proteção contra injeção de fórmula em planilha.

## Prazos em dias úteis

`GET /api/tenders/:id/prazos` devolve o limite de esclarecimento/impugnação (3 dias úteis antes da abertura, art. 164 da
Lei 14.133) e quantos dias úteis faltam. Considera só **feriados nacionais** (carnaval e corpus christi são ponto
facultativo e ficam de fora); feriados estaduais e municipais não são conhecidos. O prazo oficial é sempre o do edital.
**As regras legais devem ser validadas por advogado antes de virarem promessa comercial.**

## Como testar

```powershell
npm run verify                       # tipos, lint e testes unitários

# teste de integração (precisa de um Postgres descartável com as migrations aplicadas)
$env:DATABASE_URL      = "postgresql://.../teste"
npx prisma migrate deploy
$env:TEST_DATABASE_URL = "postgresql://.../teste"
npm run test:integracao
```

O CI já sobe um Postgres, aplica as migrations do zero e roda o teste de integração em todo PR.

## Ainda NÃO existe (próximas fases)

- Cadastro público, verificação de e-mail e "esqueci a senha" (Fase 1b).
- Cobrança, webhook e suspensão por inadimplência (Fase 1c — gateway a definir).
- Termos de uso, política de privacidade e LGPD (dependem de advogado).
