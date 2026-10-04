# Fase 2b — Semáforo da habilitação e alertas legais (versão 2.4)

Dois recursos do manual de agentes (o "Fiscal" e o alerta do "Leitor"), nova aba **Habilitação** na licitação.
Endpoint: `GET /api/tenders/:id/habilitacao`.

## 1. Semáforo da habilitação

Cruza **o que o edital pede** com **o cofre da empresa**, olhando a validade **na data da sessão**
(antes comparava com "hoje", só no navegador). Regra pura em [src/lib/habilitacao.ts](../src/lib/habilitacao.ts).

| Cor | Significado |
|---|---|
| 🟢 verde | Tem o documento e ele cobre a data da sessão |
| 🟡 amarelo | Tem, mas **vence antes da sessão**: renovar a tempo |
| 🔴 vermelho | Exigido e **não está no cofre**, ou **já venceu** |
| ⚪ cinza | Não dá para saber só pelo cofre: conferir no edital |

**O que conta como "exigido":**
- **Padrão da Lei 14.133** (contrato social, RG/CPF, cartão CNPJ, certidões federal/FGTS/trabalhista/estadual/municipal,
  falência, balanço): vale em quase toda licitação, então ausência = vermelho.
- **Específico do edital** (atestados, registro em conselho, ART/RRT, índices contábeis...): só é exigido se a
  análise por IA o citar. Sem análise, ficam em cinza ("rode a análise"), para **não gerar falso alarme**.
- **Declarações e peças da proposta** (planilha de custos, cronograma, garantia de proposta...) são feitas a cada
  licitação: sem documento no cofre não é pendência, é trabalho a fazer (cinza).
- Exigência do edital que não casa com nenhum tipo do cofre vira um item **"específico do edital"** para conferência manual.

Sem data de sessão, a validade é conferida contra hoje e a tela avisa.

## 2. Alertas legais fixos

Regras em código ([src/lib/alertasLegais.ts](../src/lib/alertasLegais.ts)) aplicadas ao texto que a IA extraiu do
edital. A IA lê; **quem decide se passa do limite é a conta**, que é previsível e testável.

| Alerta | Regra | Base |
|---|---|---|
| Garantia de proposta | acima de 1% do valor estimado | Lei 14.133, art. 58, §1º |
| Garantia contratual | acima de 5% (média: exige justificativa); acima de 10% (alta) | art. 98 (obras e serviços de engenharia) |
| Patrimônio líquido / capital mínimo | acima de 10% do valor estimado | art. 69, §4º |
| Visita técnica | obrigatória **sem** alternativa de declaração | art. 63, §2º |

- Lê percentuais ("1%", "1,5 %", "5 (cinco) por cento", "um por cento") e valores em reais ("R$ 30.000,00"),
  convertendo para % do valor estimado (o da licitação ou, na falta, o que a IA leu).
- "Não exigida", "dispensada" e "não especificado" não geram alerta; sem valor estimado e sem percentual, **não adivinha**.
- Cada alerta mostra o **trecho do edital**, o fundamento e o prazo de impugnação em dias úteis.
- O texto sempre diz "parece": é **indício para análise jurídica**, nunca conclusão.

**Os artigos e limites devem ser validados por advogado** antes de virarem promessa comercial. A tela diz isso.

## O que mudou na IA

O schema e o prompt da análise ganharam 4 campos: `garantiaProposta`, `garantiaContratual`,
`patrimonioLiquidoMinimo` e `visitaTecnica` (o trecho do edital, com o número como está escrito).

**Limitações importantes:**
- Valem só para análises feitas **depois** do deploy. Análises antigas mostram "peça uma nova análise" (a reanálise
  forçada é do administrador, porque gasta crédito).
- A análise por IA está **desligada** na 2.4 (`AI_ANALYSIS_ENABLED=false`): os alertas só aparecem quando ela for ligada.
- **O prompt novo ainda não foi testado contra um modelo real** (o `npm run analise:smoke` gasta crédito e precisa de
  chave). Rode-o uma vez antes de ligar a análise para confirmar que a IA preenche os campos como esperado.

## Testes

- Unitários: [habilitacao](../tests/habilitacao.test.ts), [alertasLegais](../tests/alertasLegais.test.ts) e
  [validação da análise](../tests/analiseValidacao.test.ts) (36 + 4 casos). Um erro real foi achado e corrigido
  (`R$ 1500` era lido como 150).
- Integração com banco real: [tests/integracao/fiscal.test.ts](../tests/integracao/fiscal.test.ts) (12 casos): cofre ×
  data da sessão, análise citando exigências, isolamento entre empresas (B não vê o cofre de A), análise antiga,
  sem análise, sem data de sessão e valor estimado vindo da IA. Ignorar a data da sessão de propósito foi detectado.

## Fora desta fase

- Atestado com quantitativo acima de 50% do previsto e "marca específica sem justificativa": exigem estruturar números
  e juízo que não são confiáveis só com texto livre. Ficam para quando houver o Perfilador (atestados lidos em números).
- Matriz de exigências com arquivo/página/item (próxima fase).
