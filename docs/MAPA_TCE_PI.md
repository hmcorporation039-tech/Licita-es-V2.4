# Mapa da fonte — TCE-PI (municípios do Piauí) — verificado em 18/10/2026

O Tribunal de Contas do Estado do Piauí mantém o **Mural de Licitações** (`https://sistemas.tce.pi.gov.br/muralic/`). Pela IN TCE-PI nº 06/2017, todo jurisdicionado (prefeituras, câmaras, fundos, autarquias e órgãos do Estado) cadastra ali o aviso em até 1 dia útil — é o caminho para cobrir os municípios pequenos do Piauí que não publicam no PNCP (a associação do SIGPub no PI, APPM, está inativa).
Aplicação JSF/PrimeFaces 10 (ViewState + cookie `JSESSIONID`), sem login e sem CAPTCHA na lista, no detalhe e nos painéis. Não há API pública. `robots.txt` só proíbe `/licitacoesweb/`; o mural não é afetado.
A coleta envia apenas os formulários de pesquisa, paginação, exportação e abertura de painel — os mesmos que o navegador envia ao clicar; nada é gravado no portal.

## Como lê

| Item | Valor |
|---|---|
| Página inicial | `GET /muralic/` → formulário de filtros, tabela `formListaLic:listaLic`, ViewState, cookie da sessão. Os ids `j_idtNN` são lidos da página a cada coleta (não ficam fixos no código) |
| Pesquisa | `POST /muralic/index.xhtml` ajax (`Faces-Request: partial/ajax`) com Status = "Divulgada (abertura futura)" (valor 2) nos dois campos de status (filtro padrão e avançado) → `partial-response` com a tabela e o total (`rowCount`: 313 em 18/10/2026) |
| Páginas | paginação ajax da DataTable (`_pagination`, `_first`, `_rows` = 100) → só as linhas `<tr>`; 4 páginas para 313 |
| Planilha (reserva) | link "exportar para planilha excel" → `PrimeFaces.download('data:…xlsx;base64,…')` com as 313 linhas e 20 colunas numa resposta (~97 KB). Lida com `fflate` (já no projeto, sem dependência nova). Não traz o processo administrativo, por isso a tabela é o caminho principal e a planilha entra quando uma página falha ou passa do teto |
| Colunas | Órgão, Esfera (MUNICIPAL/ESTADUAL), Nº proc. TCE (`LW-010651/26`), Nº Procedimento ("Concorrência nº 11/2026"; o `title` traz o processo administrativo), Regime Jurídico, Modalidade, Forma Realização (Eletrônica/Presencial/Sem sessão pública), Critério, Tipo Objeto, Objeto, Dt Abert/Julg (`dd/mm/aaaa HH:MM`), Valor, Status, Dt Últ. Public., Dt Adjudicação/Homologação/Finalização, Dt Cadastro, Dt Últ. Atualização, caminho do detalhe (`detalhelicitacao.xhtml?id=N`) |
| Detalhe | `GET /muralic/detalhelicitacao.xhtml?id=N` → status, datas, valor, regime, modo de disputa. Os painéis (Publicações, Arquivos, Responsáveis…) carregam sob demanda (`POST` ajax `_contentLoad` no acordeão) |
| Publicações | painel com data, tipo e meio: DOU, DOE, Diário Oficial dos Municípios, **"PNCP (Portal Nacional de Contratações Públicas)"** |
| Arquivos | download por postback — **não são baixados** |
| Outros status | "Aberta" (464) são credenciamentos em andamento com a abertura já passada; "Suspensa" (781), "Cancelada", "Finalizada"… não são listados — servem só na conferência das sumidas |

O status "Divulgada" ainda guarda 49 linhas com abertura passada (a mais antiga de 2020): só a sessão de hoje em diante vira candidata.

## Coleta (`workers/coletorTcePi.ts` + `services/tcePiColeta.ts`)

1. **Lista**: página inicial, pesquisa e páginas de 100, em sequência, 2 s entre requisições (`tcePiClient`), ViewState renovado a cada resposta e cookie da sessão em todas. Página que falha → planilha exportada. Teto de 30 páginas e de 160 requisições por coleta.
2. **Erros**: 5xx e erro de rede → até 3 tentativas (espera de 5 s e 10 s); 403/429 → para tudo na hora (o `httpClient` já esperou e repetiu o 429 antes); resposta do JSF com erro (`ViewExpiredException`) ou redirecionamento → falha, sem insistir; 3 consultas seguidas com falha encerram as consultas da coleta.
3. **Duplicidade com o PNCP pela regra estrita** (`podeEsconderComoRepeticao`, a mesma das outras fontes): PNCP do banco no mesmo município, modalidade equivalente, sem conflito de número (procedimento e processo administrativo), de dia da sessão nem de órgão; objeto ≥ 0,7, ou ≥ 0,4 com o mesmo número ou o mesmo dia. Achou → descarta sem requisição.
4. **Sinal firme do próprio TCE** para o que sobrou: o painel de Publicações é consultado (2 requisições; até 40 por coleta, das sessões mais próximas para as mais distantes; o resto fica para a coleta seguinte).
   - O TCE informa publicação no PNCP **e** há no banco PNCP do mesmo município, de qualquer modalidade, com objeto ≥ 0,7 e número que não conflita → é a mesma licitação: fica gravada **oculta** (`motivoOculta = PUBLICADA_NO_PNCP`), não conta como aberta, não vai ao matcher e não é consultada de novo. Cobre o que a regra estrita deixa passar por grafia do órgão ("ESTADO DO PIAUI" × "SECRETARIA DE ESTADO DA EDUCACAO", "MUNICIPIO DE ALTOS-CAMARA MUNICIPAL" × Câmara Municipal de Altos) ou pela sessão um dia depois do fim das propostas no PNCP.
   - Informa o PNCP, mas ainda sem par no banco: cadastrada há até 3 dias → espera a coleta seguinte (o PNCP ainda pode chegar); mais antiga → grava (`rawJson.publicadoNoPncp = true`).
   - Não informa o PNCP → grava (`publicadoNoPncp = false`). Painel fora do formato → grava sem o sinal (`null`), para não perder a licitação.
5. **Registros já gravados** (fonteId `TCE-PI-{id do mural}`): regravados quando a linha muda (procedimento, objeto, modalidade, forma, data, valor, status, data de atualização — `rawJson.assinaturaDaLista`). Voltou a "Divulgada" → SUSPENSA vira ABERTA e o matcher é reenfileirado.
6. **Sumidas**: com a lista lida por inteiro, uma ABERTA/SUSPENSA visível com sessão futura que saiu da lista tem o status do detalhe conferido (até 40 por coleta): Suspensa, Cancelada, Revogada, Anulada, Finalizada/Em homologação → ENCERRADA. Lista incompleta → ninguém é tratado como sumido.
7. **Gravação**: `salvarLote` (o mesmo dos coletores de HTML) → `saveTender` + matcher para as novas; as ocultas por `saveTender` + `motivoOculta`, sem matcher.
8. **PNCP que chega depois**: `TCE_PI` entra em `FONTES_QUE_REPETEM_O_PNCP`; a coleta do PNCP esconde a do TCE-PI (`duplicataDe`) pela regra estrita, comparando o número do procedimento e do processo administrativo.
9. **Agenda**: 10:40 e 17:40 de Brasília (`coleta-tce-pi`).
10. **Log por coleta**: requisições, origem da lista (tabela/planilha), páginas, divulgadas lidas/total, com sessão futura e em quantos municípios, já no PNCP (regra estrita e sinal do TCE), novas fora do PNCP, informadas no PNCP sem par, aguardando o PNCP, publicações consultadas, novos, atualizados, revisitadas, sumidas, situações alteradas, ignoradas, adiadas pelo teto, bloqueio e falhas. `worker_logs` com fonte `TCE_PI` (SUCCESS, PARTIAL ou FAILED).

## Coleta real de 18/10/2026 (banco descartável restaurado do backup de 18/10 14:56 — no PI, 541 licitações do PNCP, 521 abertas, 134 municípios)

| Medida | Valor |
|---|---|
| Divulgadas no mural | 313 (273 municipais, 40 estaduais), lidas pela tabela em 4 páginas, sem falha |
| Com sessão de hoje em diante | **264, em 112 municípios** (os órgãos estaduais contam em Teresina) |
| Já no PNCP pela regra estrita | 173 (66%) |
| Sem par pela regra estrita | 91 — 77 gravadas e 14 adiadas pelo teto de consultas da medição (5) |
| Gravadas | 77, em 39 municípios, R$ 104,0 mi estimados: 34 pregões eletrônicos e 1 presencial, 19 concorrências, 10 dispensas, 5 credenciamentos, 1 concurso, 7 outras; 67 eletrônicas, 9 presenciais, 1 sem sessão pública |
| Publicações consultadas | 5 — nenhuma cita o PNCP, e nenhuma tem par no banco (objeto ≤ 0,50): o sinal do TCE bate com os dados |
| Efeito estimado do sinal firme (passo 4) | das 77, 29 têm par no PNCP do banco (objeto ≥ 0,7, número compatível) e saem como ocultas quando o TCE confirmar a publicação no PNCP; ficam **~48 fora do PNCP do banco** (36 municipais, 12 estaduais) |
| Municípios sem nenhuma licitação do PNCP no banco | 7 — Água Branca, Belém do Piauí, Ipiranga do Piauí, Lagoa do Barro do Piauí, Monsenhor Hipólito, Pio IX e São João do Arraial (11 licitações) |
| Requisições ao TCE | 16 na coleta medida; 13 na exploração |

A medição foi feita antes do passo 4 valer para todas as candidatas (na versão medida, só as cadastradas nos últimos 3 dias tinham as publicações consultadas); o efeito do passo 4 está estimado sobre o banco, sem novas requisições ao portal.

## O que entra

| Campo do mural | Campo nosso |
|---|---|
| Modalidade + Forma Realização | `modalidade`: Pregão → PREGAO_ELETRONICO, ou PREGAO_PRESENCIAL quando a forma é presencial; Aviso de Dispensa → DISPENSA_COM_DISPUTA (eletrônica) ou DISPENSA_SEM_DISPUTA; Concorrência; Tomada de preço; Convite; Concurso; Diálogo competitivo; Credenciamento; Leilão, Chamada pública, Manifestação de interesse, RDC, Estatais e demais → OUTROS |
| Dt Abert/Julg | `aberturaAt` = sessão, no relógio de Brasília (`parseDataBr`/`horaDeBrasilia`). Mesma regra de FIEG/SESC/Infraero/TCE-CE em `licitacaoAberta.ts` e `dataDaSessao.ts` |
| Dt Últ. Public. (ou Dt Cadastro) | `publicadoAt` (meia-noite de Brasília) |
| Status | Divulgada → ABERTA (no detalhe: Suspensa, Cancelada, Revogada, Anulada, Finalizada/Em homologação → ENCERRADA; "Não finalizada" não muda nada) |
| Órgão municipal ("P. M. DE PAU DARCO DO PIAUI", "CAMARA DE ALTOS", "FUNDAÇÃO MUNICIPAL DE SAUDE DE TERESINA") | `uf` PI, `municipio` com o nome oficial do IBGE (com acento, `tcePiMunicipios.ts`, 224 municípios), `municipioIbge`, coordenadas — pelo fim mais longo do nome que é município, aceitando a grafia sem apóstrofo e com ou sem "do Piauí"; `orgao` = "Prefeitura Municipal de Pau D'Arco do Piauí" / "Câmara Municipal de Altos"; os demais ficam como no mural |
| Órgão estadual | município da sede (Teresina) — `rawJson.municipioPelaSede = true`; `orgao` e `unidade` com o nome do mural |
| Valor | `valorEstimado` (zero vira vazio) |
| Objeto com "registro de preço" | `srp` |
| Nº Procedimento | `numeroControle` = número ("11/2026", "PE 155/2026") |
| — | `linkEdital` = detalhe no mural (`https://sistemas.tce.pi.gov.br/muralic/detalhelicitacao.xhtml?id=N`) |
| Outros | `rawJson`: id do mural, controle TCE, procedimento, processo administrativo, esfera, órgão original, regime jurídico, modalidade/forma/critério/tipo de objeto/status originais, datas de publicação, cadastro e atualização, publicações e `publicadoNoPncp` |

Os 313 órgãos da lista de 18/10/2026 resolvem para um município do Piauí (124 municípios distintos entre os municipais; teste em `tests/tcePiParser.test.ts`).

## O que fica de fora

- Status diferente de "Divulgada" na lista (credenciamentos "Aberta" com abertura passada, suspensas, finalizadas).
- Linha com sessão anterior a hoje.
- O que já está no PNCP (passos 3 e 4).
- Arquivos do edital (download por postback).

## Riscos conhecidos

- **Duplicada visível**: quando o PNCP tem a licitação, a regra estrita não a reconhece e o jurisdicionado não informou a publicação no PNCP ao TCE. Na medição, as 5 consultadas sem PNCP informado também não tinham par — sinal de que é raro.
- **Primeira coleta**: ~90 candidatas para 40 consultas por coleta → 2 a 3 coletas (1 a 2 dias) até zerar; enquanto isso a coleta fica PARTIAL (adiadas pelo teto). As sessões mais próximas vão primeiro.
- **Órgãos estaduais na sede**: uma obra do Estado no interior aparece em Teresina; o filtro por raio pode esconder ou mostrar demais. O objeto costuma citar o local.
- **Mudança de layout do JSF**: os ids são lidos da página, mas uma troca de estrutura derruba a lista (FAILED, alerta de coletor parado). A planilha é a reserva da paginação, não da página inicial.
- O `httpClient` compartilhado repete o 429 (com espera) antes de o coletor parar.
- Sem anexos, a análise por IA devolve "sem documentos" para esta fonte.
