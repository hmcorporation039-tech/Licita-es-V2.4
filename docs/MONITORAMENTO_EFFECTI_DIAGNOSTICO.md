# Módulo 6 — Monitoramento estilo Effecti: diagnóstico (o que já existe × o que falta)

Referência pedida: o modelo Effecti (o cliente ajusta filtros pelo que a empresa
vende, a IA lê o edital e destaca prazos, exigências e cláusulas; o cliente só
decide). O pedido manda **primeiro levantar o que a Licita Bela já faz**. Este é
esse levantamento.

**Conclusão em uma linha:** a maior parte do Módulo 6 **já está construída**. As
lacunas são pontuais (CNAE, validade da proposta, um perfil unificado da empresa)
— não é um módulo novo, é acabamento.

## 1. Filtros salvos pelo perfil da empresa

**Já existe — `MonitoredItem` (Itens monitorados).** Cada item é uma busca salva e
nomeada, com: `keywords`, `palavrasDeExclusao`, `catmatCodes`/`catserCodes`, `ufs`,
`valorMin`/`valorMax`, filtro por órgão, `uasgCodes`, e raio de distância
(`raioKm` + `origemMunicipio`/`origemUf`). O matcher cruza isso com as licitações
coletadas e gera matches.

**Alerta automático de licitação nova — já existe (`src/workers/notificador.ts`):**
e-mail, aviso no sistema, aviso no celular/WhatsApp e resumo diário.

**Lacuna:** não há **CNAE** no perfil nem no match (o casamento é por
palavra-chave/CATMAT, não por CNAE). Também não há uma tela única de "perfil da
empresa (produtos/serviços/CNAE)" — hoje o perfil é a soma dos itens monitorados.

## 2. Resumo do edital no mesmo padrão

**Já existe — análise de IA (`TenderAnalysis.resultado`, `src/services/llm/`).** O
`EditalAnalysisResult` extrai, de forma padronizada:

- **Dados gerais:** `resumo`, `valorEstimado`, `criterioJulgamento`,
  `registroPrecos`/`adesaoAta`, `local`, `pagamento`. Órgão, objeto, modalidade e
  número vêm do próprio `Tender`.
- **Prazos:** `dataSessao`, `prazoEntrega`, `prazoImpugnacao`,
  `prazoEsclarecimento`. (Validade da proposta — ver lacuna.)
- **Exigências:** `exigenciasTecnicas`, `documentosExigidos` e a
  **`matrizExigencias`** — cada exigência rastreável até documento, página, item e
  responsável (`src/lib/matrizExigencias.ts`).
- **Cláusulas e riscos:** `garantiaProposta`, `garantiaContratual`,
  `patrimonioLiquidoMinimo`, `visitaTecnica`, e `riscos` com severidade
  (alta/média/baixa). Mais os **alertas legais fixos** (`src/lib/alertasLegais.ts`),
  ex.: exclusividade ME/EPP, percentuais acima do que a lei admite.

**Cruzamento com "Meus Documentos" — já existe (`src/lib/habilitacao.ts`,
PainelDoFiscal).** Cada documento exigido recebe status na data da sessão:

- verde = tem e cobre a data; amarelo = tem, mas vence antes (renovar a tempo);
  vermelho = exigido e não está no cofre, ou já vencido. É exatamente o "mostrar o
  que falta".

**Conclusão Participar/Descartar — já existe (`TenderParticipationPlan`,
VOU_PARTICIPAR/AVALIANDO) + a tela "Escolhidas".** (Confirmar na UI se os botões
aparecem como CTA direto na tela da análise.)

**Lacuna:** **validade da proposta** não está entre os campos extraídos.

## 3. Velocidade

**Já existe.** A análise fica salva em `TenderAnalysis` (único por `tender_id`),
então reabrir o mesmo edital **não reprocessa**. A análise em dupla
(`analiseEmDupla.ts`) e a revisão (`claudeReviewer.ts`) já rodam no pipeline. O que
falta é só garantir **feedback de progresso** claro na tela enquanto processa (a
primeira vez).

## 4. Lacunas reais (a construir) e prioridade

| # | Lacuna | Tamanho | Nota |
|---|---|---|---|
| A | **Validade da proposta** no resumo do edital | 🟢 Pequeno | Novo campo no `EditalAnalysisResult` + schema + prompt dos analisadores. Aditivo. |
| B | **CNAE** no perfil da empresa (campo opcional) + usar como sinal no match/relevância | 🟡 Médio | Campo em `Company` (migração aditiva) + tela de perfil; casar CNAE↔CATMAT/objeto é heurístico. |
| C | **Tela de perfil da empresa** (produtos/serviços/CNAE) que **sugere itens monitorados** | 🟡 Médio | Unifica o "o que a empresa vende"; reusa o que já existe de itens. |
| D | **CTA "Participar/Descartar" proeminente** na tela da análise | 🟢 Pequeno | Só se a verificação de UI mostrar que hoje está escondido. |
| E | **Progresso visível** na primeira análise de um edital | 🟢 Pequeno | Estado de carregamento com etapas; o resultado já é cacheado. |

## Recomendação de ordem

1. **A + E** (pequenos, alto valor, sem risco): validade da proposta no resumo e
   progresso visível. Um PR.
2. **D** depois da verificação de UI (talvez já esteja bom).
3. **B + C** (CNAE + perfil unificado) como um segundo PR, com migração aditiva.

Nada aqui é "módulo novo": é completar um monitoramento que já cobre busca salva,
alerta, resumo padronizado, cruzamento com documentos e decisão do cliente.

## Fontes no código

- `prisma/schema.prisma`: `MonitoredItem`, `TenderAnalysis`, `TenderParticipationPlan`, `Company`.
- `src/services/llm/types.ts` (`EditalAnalysisResult`), `geminiAnalyzer.ts`, `claudeReviewer.ts`, `analiseEmDupla.ts`.
- `src/lib/matrizExigencias.ts`, `src/lib/alertasLegais.ts`, `src/lib/habilitacao.ts` (PainelDoFiscal).
- `src/workers/notificador.ts` (alertas), `src/workers/matcher.ts` (casamento).
