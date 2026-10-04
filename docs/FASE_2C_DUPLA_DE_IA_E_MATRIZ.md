# Fase 2c — Análise em dupla (Gemini analisa, Claude revisa) e matriz de exigências

## 1. Análise em dupla

```
edital ──► ANALISTA (Gemini) ──► rascunho ──► REVISOR (Claude) ──► versão final
                                                   │
                                  corrige o que está errado, remove o que foi inventado,
                                  completa o que faltou e justifica cada mudança
                                                   │
                               conferência por CÓDIGO: cada exigência está mesmo no edital?
```

- O **revisor recebe o mesmo edital** mais o rascunho e o confere campo a campo. Ele devolve a análise final completa
  e um relatório (veredito: aprovada, corrigida ou reprovada; resumo; justificativas).
- **As alterações mostradas ao usuário são calculadas por código** (rascunho × final, em
  [src/lib/revisaoDaAnalise.ts](../src/lib/revisaoDaAnalise.ts)): o que aparece como "corrigido" é exatamente o que mudou.
  O revisor só explica o motivo.
- **Como a análise fica guardada:** `resultado` = versão final; `rascunho` = saída do Gemini (só o administrador vê, para auditar);
  `revisao` = relatório; `pipeline` = `dupla` | `gemini` | `claude`.

### Se algo falhar (degradação deliberada)

| Situação | O que acontece |
|---|---|
| Revisor erra, recusa ou corta a resposta | **Vale a análise do Gemini, marcada "NÃO revisada"** na tela. Os tokens gastos entram na medição |
| Analista falha | A análise falha (não há o que revisar). Mensagem genérica ao usuário |
| Só uma chave de IA | Análise simples, dita como "sem revisão" |
| Nenhuma chave | Falha clara: "não está configurada nesta instalação" |

O detalhe técnico de erros (host, código HTTP) **só o administrador** vê; o usuário recebe uma mensagem genérica.

### Modelos e configuração

- **Revisor:** `claude-opus-5-5` (`CLAUDE_REVIEW_MODEL` troca), raciocínio adaptativo e **esforço `high` definido de propósito**
  (o padrão desse modelo é `medium`, pouco para conferir um edital inteiro), em streaming, até 64 mil tokens de saída.
- **Analista:** Gemini (`GEMINI_MODEL`). Resposta cortada por limite agora dá erro claro, não "recusa".
- **Modo:** automático (duas chaves = dupla). `AI_PIPELINE=dupla|gemini|claude` força.
- **Fallback de recusa da Claude** (parâmetro `fallbacks`): **não ligado**. O pipeline já trata recusa do revisor mantendo a
  análise do Gemini como "não revisada"; ligar o fallback exigiria o endpoint beta e é decisão separada.

### Custo e cota

- **A revisão é custo da plataforma, não do cliente:** a cota mensal conta só a etapa `analise` (uma análise = uma unidade,
  mesmo com duas chamadas de IA). O consumo das duas etapas é medido por modelo.
- **A revisão sozinha custa mais que a análise**, porque a Claude relê o edital inteiro (entrada) e reescreve a análise
  (saída) num modelo mais caro. Veja em **Admin → Consumo de IA → Por etapa e modelo**. Para estimar em dólar, preencha
  `AI_PRICE_GEMINI_*` e `AI_PRICE_CLAUDE_*` (preço por milhão de tokens, conferido no site de cada provedor).

## 2. Matriz de exigências

Nova aba **Exigências** na licitação, e `GET /api/tenders/:id/matriz`. Cada linha:

| Campo | O que é |
|---|---|
| Texto | Transcrição **literal** da exigência (até 200 caracteres) |
| Documento · página · item | De onde veio (ex.: Edital.pdf · pág. 12 · item 10.3.2). A IA recebe o texto com marcadores `[[PÁGINA n]]` |
| Categoria | jurídica, fiscal, econômico-financeira, técnica, proposta, outra |
| Responsável | fiscal (documentos), calculista (preços), redator (proposta) |
| **Conferência** | **o sistema verifica por código se o texto está mesmo no documento** |
| Atendida + nota | Cada empresa marca o que já cumpriu (não vaza entre empresas; fica na auditoria) |

**Conferência por código** ([src/lib/matrizExigencias.ts](../src/lib/matrizExigencias.ts)): IA pode inventar ou parafrasear,
então o sistema confere sozinho, sem IA:

- ✅ **confirmado**: o texto está no documento (e diz a página real, mesmo que a IA tenha errado a página);
- 🟡 **parcial**: boa parte do texto está, mas não igual (paráfrase ou número alterado): conferir;
- 🔴 **não localizado**: não achou no edital, pode ser invenção;
- ⚪ **não verificável**: documento escaneado (sem texto) ou trecho curto demais.

Ignora acento, caixa, pontuação, espaços e **ligaturas perdidas na extração do PDF**. Um edital real de 63 páginas
mostrou que o extrator perde o "ti" (`administra vo`, `compa vel`); isso era um falso "não localizado" e foi corrigido.
Nesse mesmo edital, as páginas confirmadas bateram com as reais (5, 20, 40) e a conferência leva milissegundos.

Exportação em CSV (com proteção contra injeção de fórmula em planilha).

## 3. Visibilidade do administrador

- Na análise, o admin vê o **rascunho do analista** (aba Análise → "Admin: rascunho").
- `GET /api/admin/analyses/:tenderId`: análise completa, rascunho, relatório com detalhe técnico e o consumo de cada etapa.
- Painel de consumo: nova tabela **por etapa e modelo**.

## 4. Testes

- Unitários: conferência de literalidade (20 casos, incluindo ligaturas), diff da revisão (10), pipeline e configuração (20).
- Integração com banco real e modelos de mentira ([tests/integracao/dupla.test.ts](../tests/integracao/dupla.test.ts), 16 casos):
  fluxo completo, revisor falhando, só um provedor, analista falhando, sem chave, cota que ignora a revisão, usuário comum que
  não vê o rascunho nem o detalhe técnico, matriz com progresso isolado entre empresas, análise antiga sem matriz.
  Vazar o rascunho e contar a revisão na cota foram quebrados de propósito e detectados.

## 5. O que AINDA não foi testado (importante)

**Nenhum modelo real foi chamado.** Todos os testes usam modelos de mentira, porque isso exige chaves de IA e gasta crédito.
Antes de ligar para clientes, rode **uma vez** o roteiro com chaves reais:

```powershell
# .env com GEMINI_API_KEY e ANTHROPIC_API_KEY (e, para ver o custo, os AI_PRICE_*)
npm run analise:smoke -- <cnpj> <ano> <sequencial>
```

Ele baixa o edital, roda a dupla e mostra: o que o revisor corrigiu, a conferência da matriz e o consumo de cada etapa.
Confira principalmente: (1) o Gemini preenche os campos novos e a matriz sem cortar a resposta; (2) o esquema JSON é aceito
pela API da Claude; (3) o custo por análise fica compatível com os seus planos.
Use `--dry` para só baixar o edital e ver como cada documento será enviado, sem gastar nada.
