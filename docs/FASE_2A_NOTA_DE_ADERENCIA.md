# Fase 2a — Nota de aderência (versão 2.4)

Cada match passa a ter uma **nota de 0 a 100 com o motivo de cada critério**, em vez de só "score 90%".
Vem do manual de agentes (Caçador), limitada ao que o sistema consegue medir hoje.

## Como a nota é calculada

Regra pura em [src/lib/aderencia.ts](../src/lib/aderencia.ts) (16 testes). Os **portões** (UF, valor,
modalidade, órgão, UASG, raio) continuam decidindo SE há match; a nota decide o quão BOM ele é.

| Critério | Máx. | Regra |
|---|---|---|
| **Objeto** | 50 | Código CATMAT/CATSER igual = 50. Só palavra-chave = 20 a 35 (proporcional às palavras encontradas) |
| **Prazo** | 20 | ≥15 dias = 20 · 7–14 = 16 · 3–6 = 10 · 1–2 = 5 · <1 = 2 · encerrado = 0 · sem data (dispensa) = 12 |
| **Valor** | 15 | Dentro da faixa que o cliente definiu = 15 · sem faixa = 8 · valor não informado = 6 · fora = 0 |
| **Localização** | 15 | Raio: 8 na borda até 15 no mesmo lugar · UF escolhida e batendo = 12 · busca nacional = 8 |

Faixas: **alta** ≥ 80 · **boa** 60–79 · **média** 40–59 · **baixa** < 40.

Exemplos: código CATMAT, 20 dias, sem restrições = 86 (alta). Só 1 palavra de 1, mesmas condições = 71 (boa).

## O que NÃO entra (e por quê)

O manual também cita capacidade técnica, capacidade financeira, histórico do órgão e competitividade.
Esses critérios dependem do **perfil do cliente** (atestados lidos em números, índices contábeis) e do
histórico de resultados, que a plataforma ainda não tem. Não se inventa nota para o que não se mede:
a tela avisa que a nota **não avalia a capacidade do cliente**. Entram quando existir o Perfilador.

## Onde aparece

- **Meus matches:** selo com a nota; ao clicar, mostra o motivo de cada critério. Ordenação
  "Maior nota de aderência" (padrão) ou "Mais recentes".
- **Licitações (somente relacionadas):** a classificação mostra também a nota.
- API: `GET /api/matches` devolve `aderencia { nota, faixa, criterios[] }` em cada item e aceita
  `?ordem=nota|recentes`.

## Detalhes técnicos

- A nota é **ao vivo**: o critério Prazo muda a cada dia, então a API recalcula na leitura. O que fica
  gravado em `tender_matches.score` é a nota (÷100) no momento do match.
- `ordem=nota` calcula sobre os campos mínimos de até 5.000 matches do recorte e pagina em memória (o feed
  já é limitado pela janela de prazo, então na prática é muito menos).
- Migration `00000000000018_aderencia` (aditiva): coluna `matched_by_code`. Os matches antigos foram
  migrados (score = 1 significava código).
- "Correspondência exata" na lista de licitações continua sendo o match por código CATMAT/CATSER.

## Testes

- Unitários: [tests/aderencia.test.ts](../tests/aderencia.test.ts).
- Integração com banco real: [tests/integracao/aderencia.test.ts](../tests/integracao/aderencia.test.ts)
  — matcher real grava a nota, feed devolve o detalhamento, ordenação e paginação, isolamento entre empresas
  e compatibilidade com matches antigos. Uma inversão proposital da ordenação foi detectada pelo teste.

## Calibragem

Os pesos são um **ponto de partida** razoável, não uma verdade. Quando houver clientes usando, confira
se as notas altas são as que eles de fato escolhem ("Marcar como interessado") e ajuste os pesos em
`src/lib/aderencia.ts`. O manual propõe que a nota aprenda com "participei/descartei": isso fica para
depois, com dados reais.
