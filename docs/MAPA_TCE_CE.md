# Mapa da fonte — TCE-CE (municípios do Ceará) — verificado em 17/10/2026

O Tribunal de Contas do Estado do Ceará mantém o **Portal de Licitações dos Municípios**: os 184 municípios (prefeituras, câmaras, fundos, autarquias) são obrigados a cadastrar ali cada licitação, com o aviso, antes da sessão.
Segundo o próprio TCE, ~90% dos municípios usam plataformas privadas de disputa (BLL, M2A, Compras.gov.br, Licitações-e, BNC...), e a maior parte delas espelha no PNCP — por isso a duplicidade com o PNCP é conferida antes de gravar.
Sistema PHP/Symfony antigo, UTF-8, sem login para consulta, sem CAPTCHA na listagem nem no detalhe. A API de dados abertos (`api-dados-abertos.tce.ce.gov.br`) não respondeu em 17/10/2026.
Coleta só por GET; nenhum formulário é enviado.

## Como lê

| Item | Valor |
|---|---|
| Lista "Licitações Abertas" | `GET https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/abertas/page/N/mun/000` (todos os municípios) |
| Colunas da lista | Licitação (número + link do detalhe), Município, Objeto, Data de Publicação, Data de Abertura, Reabertura, Valor Estimado (R$) |
| Ordem | data de abertura, da mais distante para a mais antiga; ~46 a 50 linhas por página; 113 páginas em 17/10/2026 |
| Página depois da última | HTTP 200 com a tabela vazia |
| Detalhe | `GET /index.php/licitacao/detalhes/proc/{idProcesso}/licit/{idLicitacao}` |
| Detalhe inexistente | HTTP 500 com corpo vazio |
| Anexos | `/index.php/licitacao/baixarArquivo/...` exige CAPTCHA — **não são baixados** (por isso o host não entra no `urlGuard.ts` e a análise por IA não tem documento desta fonte) |
| Abas não usadas | Licitações Fechadas, Dispensas/Inexigibilidades, Adesões a Ata, Procedimentos Auxiliares |

A aba "Abertas" mantém milhares de registros com abertura já passada (o município raramente fecha o registro): só as linhas com sessão de hoje em diante viram candidatas. A reabertura conta como sessão — uma licitação com abertura em 09/10 e reabertura em 27/10 fica lá atrás na lista, mas ainda está aberta.

## Coleta (`workers/coletorTceCe.ts` + `services/tceCeColeta.ts`)

1. **Lista**: página a página, em sequência, 1,5 s entre requisições (`tceCeClient`), até a página vazia ou a última anunciada (~3 min para as 113 páginas); só para antes depois de 80 páginas seguidas sem nenhuma sessão futura (em 17/10/2026 havia reabertura futura na página 66). Teto de 200 páginas por coleta.
2. **Erros**: 5xx e erro de rede → até 3 tentativas na página (espera de 5 s e 10 s); 3 páginas seguidas com falha encerram a lista. 403/429 → para tudo na hora (o `httpClient` já esperou e repetiu o 429 antes). Página fora do formato conta como falha, sem repetir.
3. **Duplicidade com o PNCP, antes do detalhe**: cada linha nova (município + objeto + número + dia da sessão) é comparada com o PNCP já gravado no banco, do mesmo município e de qualquer modalidade (`tceCeDuplicidade.ts`). É a mesma licitação quando:
   - similaridade de trigramas do objeto ≥ 0,8; ou
   - regra do Querido Diário (≥ 0,45, ou ≥ 0,2 no mesmo dia da sessão) **e** pelo menos metade das palavras distintivas em comum — sem o texto de praxe ("contratação de empresa especializada", "registro de preços para futuras e eventuais", "secretaria", nome do município...). Sem esse filtro, a regra do Querido Diário juntava "locação de decoração natalina" com "locação de software" (0,46) em Novo Oriente; ou
   - o mesmo número do processo/compra (sem o ano e os zeros), similaridade ≥ 0,25 e ≥ 1/3 das palavras distintivas em comum.

   Achou → descarta sem gastar requisição.
4. **Detalhe**: só das candidatas que sobraram, das sessões mais próximas para as mais distantes, até 400 por coleta (2 tentativas em 5xx). Depois do detalhe, a duplicidade é conferida de novo, agora com a modalidade.
5. **Publicadas hoje** ficam para a coleta seguinte: o PNCP ainda pode trazê-las e a duplicidade ficaria sem par.
6. **Registros já gravados** (fonteId `TCE-CE-{idLicitacao}`): relidos quando a linha da lista muda (número, objeto, datas, valor — `rawJson.assinaturaDaLista`) ou depois de 3 dias sem conferência. Mudança de situação grava direto (`situacao`, `situacaoCheckedAt`); reabertura de suspensa reenfileira o matcher.
7. **Sumidas**: com a lista lida por inteiro, uma ABERTA/SUSPENSA com sessão futura que não aparece mais na lista tem o detalhe conferido e a situação do portal gravada (Cancelada, Deserta, Suspensa...). Lista incompleta → ninguém é tratado como sumido.
8. **Gravação**: `salvarLote` (o mesmo dos coletores de HTML) → `saveTender` + matcher para as novas.
9. **Agenda**: 10:30 e 17:30 de Brasília (`coleta-tce-ce`), depois das duas coletas do PNCP.
10. **Log por coleta**: páginas lidas/última, registros na lista, com sessão futura e em quantos municípios, detalhes lidos, novas fora do PNCP, já no PNCP (por objeto e por número), publicadas hoje, novos, atualizados, revisitadas, sumidas, situações alteradas, adiadas pelo teto, bloqueio e falhas.

## Coleta real de 17/10/2026 (banco descartável com as propostas abertas do PNCP no CE: 1.353)

| Medida | Valor |
|---|---|
| Páginas lidas | 113/113, sem falha, ~4 min com os detalhes |
| Registros na aba "Abertas" | 4.977 |
| Com sessão (abertura ou reabertura) de hoje em diante | 280, em 115 municípios; 9 delas reabertas, a mais funda na página 66 |
| Já no PNCP | 251 (250 pelo objeto, 1 pelo número) — 90%, como o TCE diz |
| **Fora do PNCP, gravadas** | **29, em 22 municípios, R$ 39,6 mi estimados** — 21 pregões eletrônicos, 8 concorrências; plataformas BLL (12), M2A (11), portais próprios das prefeituras (4), BNC (1) |
| Requisições ao TCE | 142 (113 de lista + 29 de detalhe) |

Só 2 das 29 citam o PNCP na forma de publicação — sinal de que a comparação não está deixando passar duplicadas em massa.

## O que entra

| Campo do portal | Campo nosso |
|---|---|
| Modalidade | `modalidade`: Pregão → PREGAO_ELETRONICO, ou PREGAO_PRESENCIAL quando o nome diz "presencial" ou o Local é endereço físico sem plataforma; Concorrência; Tomada de Preços; Convite; Concurso; Diálogo Competitivo; Credenciamento; Leilão/Chamada Pública → OUTROS |
| Data + Hora da Abertura / da Reabertura | `aberturaAt` = sessão (reabertura, quando houver) no relógio de Brasília (`horaDeBrasilia`); sem hora → meia-noite de Brasília (dia sem hora). Mesma regra de FIEG/SESC/Infraero em `licitacaoAberta.ts` e `dataDaSessao.ts` |
| Data da Publicação do Aviso | `publicadoAt` (meia-noite de Brasília) |
| Situação | Aberta → ABERTA; Suspensa/Adiada → SUSPENSA; Cancelada; Revogada; Anulada; Homologada/Adjudicada; Deserta/Fracassada/Encerrada/Concluída → ENCERRADA |
| Município (cabeçalho "FORTALEZA \| Prefeitura Municipal") | `uf` CE, `municipio` com o nome oficial do IBGE (com acento, `tceCeMunicipios.ts`), `municipioIbge`, coordenadas; `orgao` = "Prefeitura Municipal de Fortaleza" |
| Órgãos | `unidade` (secretarias/fundos, até 250 caracteres) |
| Valor Estimado (lista) | `valorEstimado` |
| Registro de Preço: Sim / objeto com "registro de preço" | `srp` |
| Número da lista | `numeroControle` |
| Local | `rawJson.local`, `rawJson.plataforma` (BLL, M2A, Compras.gov.br, Licitações-e, BNC... ou o host do endereço), `rawJson.disputaEletronica` |
| Forma de Publicação | `rawJson.publicacoes`; `rawJson.publicadoNoPncp` quando um dos meios cita o PNCP (informativo — a duplicidade é decidida pela comparação com o banco) |
| Outros | `rawJson`: processo administrativo, critério de julgamento, regime, abertura original, reaberta, títulos dos arquivos |
| — | `linkEdital` = página de detalhe no TCE |

Os 184 municípios do filtro do portal resolvem para os 184 códigos IBGE do Ceará (teste em `tests/tceCeParser.test.ts`).

## O que fica de fora

- Linha com sessão (abertura/reabertura) anterior a hoje.
- Nova cujo detalhe já mostra situação final ou sessão passada; situação que o parser não reconhece.
- O que já está no PNCP (ver passo 3).
- Anexos (CAPTCHA).

## Riscos conhecidos

- **PNCP que chega depois**: se o município publicar no PNCP só depois da nossa coleta do TCE-CE, a licitação aparece duas vezes (mesmo risco do Querido Diário). A espera de um dia para as publicadas hoje e o horário depois do PNCP reduzem, não eliminam.
- O portal ordena por abertura; reabertura de licitação muito antiga (mais de 20 páginas sem sessão futura) não é vista. A sumida correspondente só tem a situação conferida, sem perder dado.
- Sem anexos, a análise por IA devolve "sem documentos" para esta fonte.
