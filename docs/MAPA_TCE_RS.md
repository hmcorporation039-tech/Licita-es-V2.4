# Mapa da fonte — TCE-RS (LicitaCon, dados abertos) — verificado em 18/10/2026

O Tribunal de Contas do Estado do Rio Grande do Sul publica no CKAN `https://dados.tce.rs.gov.br` tudo o que os jurisdicionados cadastram no **LicitaCon**: as 497 prefeituras, as câmaras, autarquias, fundações, consórcios, estatais e os órgãos do Estado. Sem login, sem CAPTCHA, só GET.
A maioria dos municípios gaúchos também publica no PNCP, então a duplicidade com o PNCP é conferida antes de gravar.

## O arquivo

| Item | Valor (18/10/2026) |
|---|---|
| Conjunto | `licitacoes-consolidado-2026` (`/api/3/action/package_show?id=licitacoes-consolidado-2026`), 1 recurso |
| Arquivo | `GET https://dados.tce.rs.gov.br/dados/licitacon/licitacao/ano/2026.csv.zip` — 257.680.030 bytes, `Last-Modified: 18/10/2026 06:35 GMT` (03:35 de Brasília), atualizado todo dia; anos anteriores, toda semana |
| Trechos | o servidor aceita `Range` (`206 Partial Content`, `Accept-Ranges: bytes`); a listagem de diretório `/dados/licitacon/licitacao/` dá 403 |
| Conteúdo | 14 CSVs (UTF-8 com BOM, vírgula, aspas, campos com quebra de linha). Usados: `licitacao.csv` (21,4 MB comprimido / 77,6 MB), `evento_lic.csv` (4,6 / 27,0 MB) e `documento_lic.csv` (42,2 / 191,5 MB). Os demais (itens, propostas, licitantes, pessoas...) não são baixados |
| Por órgão | também existem arquivos `.../orgao/{CD_ORGAO}.csv.zip`, mas seriam centenas de downloads por dia |
| Dicionário | o leiaute (`eValidador_LicitaCon_Manual_Leiaute_1.4.pdf`) citado no CKAN dá 404; os códigos abaixo foram conferidos nos próprios dados |
| Editais | `ARQUIVO_URL_DOWNLOAD` de `documento_lic.csv` → `https://portal.tce.rs.gov.br/app/silicon-download/documento_licitacao/{id}`, PDF público sem CAPTCHA. O host entrou no `urlGuard.ts` e os documentos vão em `rawJson.anexos` para a análise por IA |
| Página da licitação | `LINK_LICITACON_CIDADAO` (LicitaCon Cidadão, pública) → `linkEdital` |

## Coleta (`workers/coletorTceRs.ts` + `services/tceRsColeta.ts`)

1. **Diretório do ZIP**: `Range: bytes=-65536` traz a cauda do arquivo; o diretório central diz onde começa e quanto mede cada CSV.
2. **Só os trechos necessários**: `licitacao.csv` e `evento_lic.csv` (~26 MB por coleta); `documento_lic.csv` (42 MB) só quando há licitação nova para gravar. Cada trecho é descompactado e lido em fluxo (inflate + leitor de CSV incremental), sem carregar o arquivo inteiro em memória. Em vez de 257 MB, ~26 a 68 MB por dia.
3. **Tetos**: 80 MB comprimido para licitações, 40 MB para eventos, 160 MB para documentos, 800 MB descompactado por arquivo, 10 min por arquivo; acima disso a coleta para com falha e nada é baixado. ZIP64 e compressão diferente de deflate/sem compressão são recusados.
4. **Erros**: 5xx, erro de rede e download cortado → até 3 tentativas (espera de 5 s e 10 s), recomeçando o trecho. 403/429 → para tudo na hora (o `httpClient` já esperou e repetiu o 429 antes). Servidor que ignora o `Range` (HTTP 200) → o corpo é descartado na hora, sem baixar os 257 MB. Cliente `tceRsClient`: 3 s entre requisições, 60 s de timeout, sem redirecionamento.
5. **Ano**: o do relógio de Brasília; de janeiro a março também o ano anterior (edital de dezembro com sessão em janeiro fica no arquivo do ano em que foi publicado). Arquivo do ano anterior ausente não é falha.
6. **Oportunidade aberta**: fase atual `EPU` (edital publicado), `DT_ABERTURA` de hoje em diante, `TP_RESULTADO_GLOBAL` vazio e modalidade com disputa. `PUB` não serve: é a fase das dispensas/inexigibilidades/adesões já publicadas (em 18/10, só 8 `PUB` tinham data futura, todas dispensas).
7. **Situação** (pelo último evento decisivo, por `SQ_EVENTO`): `SUO`/`SUM`/`SDJ` → SUSPENSA, `REI` → ABERTA, `REO` → REVOGADA, `ANO` → ANULADA; resultado `R` → REVOGADA, `N` → ANULADA, `D`/`F` → ENCERRADA; fase `HAP` → ENCERRADA (sessão feita), `ADH` → HOMOLOGADA. Nova só é gravada se ABERTA.
8. **Publicadas ontem ou hoje** (`PUE` mais antigo) ficam para a coleta seguinte: o PNCP ainda pode trazê-las.
9. **Duplicidade com o PNCP** (`tceRsDuplicidade.ts`), em ordem:
   - **link declarado**: evento de publicação com `https://pncp.gov.br/(app/)editais/{cnpj}/{ano}/{seq}` → `fonteId` do PNCP `{cnpj}-1-{seq:6}/{ano}`; existe no banco → descarta;
   - **regra comum** (a mesma do TCE-CE, com o predicado estrito `conflitoComOPncp`);
   - **regra do RS**, porque no RS o número do LicitaCon muitas vezes não é o do PNCP, a data da sessão às vezes só foi atualizada de um lado, e o nome do órgão vem escrito de outro jeito ("CM DE ESTEIO" × "ESTEIO CAMARA DE VEREADORES", "SES" × "SECRETARIA DA SAUDE"). Mesma família de modalidade, mesma entidade (câmara só com câmara, prefeitura nunca com câmara nem com o Estado) e: mesmo número + mesmo dia + similaridade ≥ 0,4; ou mesmo número + similaridade ≥ 0,75; ou, **só quando não há número para comparar**, mesmo dia + similaridade ≥ 0,95. A SES abre dezenas de pregões com o texto idêntico na mesma data ("AQUISIÇÃO DE BENS DA(S) FAMÍLIA(S): 0884-MEDICAMENTOS..."): com número diferente, não é a mesma.

   O PNCP que chega depois esconde a do TCE-RS pela revisão de sempre (`FONTES_QUE_REPETEM_O_PNCP`, `duplicata_de`).
10. **Registros já gravados** (`fonteId` `TCE-RS-{CD_ORGAO}-{ANO}-{MODALIDADE}-{NR_LICITACAO}`): os ABERTOS/SUSPENSOS são relidos todo dia (dados por `saveTender`, com os anexos que já tinham); mudança de situação grava direto (`situacao`, `situacaoCheckedAt`) e a volta para ABERTA reenfileira o matcher. Os que saíram do arquivo só são contados (`sumidas`).
11. **Agenda**: todo dia às 06:20 de Brasília (`coleta-tce-rs`), depois da varredura do PNCP (00:30) e da coleta das 03:00, com o arquivo do dia já gerado. Não dispara na subida do processo (cada deploy baixaria ~26 MB).
12. **Log**: linhas lidas, abertas e em quantos municípios, novas fora do PNCP, já no PNCP (link, objeto, número, sessão), declaradas no PNCP e ausentes no banco, aguardando o PNCP, suspensas/revogadas, sem município, novos, atualizados, revisitadas, situações alteradas, sumidas e as 10 cidades com mais novas.

## Município e órgão

| Órgão no LicitaCon | Resultado |
|---|---|
| `PM DE X` / `CM DE X` | Prefeitura/Câmara Municipal de X; nome do IBGE com acento; `SANTANA DO LIVRAMENTO` → Sant'Ana do Livramento (as 497 prefeituras resolvem) |
| Autarquia com código abaixo de 88000 (`54907` DMAE, `57102` DAE) | o município da prefeitura de mesmo prefixo (`54900`, `57100`), lido no próprio arquivo |
| Código 88xxx (municípios novos e entidades recentes) | nome do município no fim do nome ("... DE NOVO HAMBURGO", "... - TRÊS PASSOS"), menos "VALE DO", "REGIÃO" etc. |
| Consórcio (`CONS.`, `CI`, `CONSÓRCIO`) | sem município (`rawJson.esfera = regional`) |
| Demais (SES, TJRS, Banrisul, Central de Licitações...) | Porto Alegre, sede do governo (`rawJson.esfera = estadual`) |

## O que entra

| Campo do LicitaCon | Campo nosso |
|---|---|
| `CD_TIPO_MODALIDADE` | `PCE` → PREGAO_ELETRONICO; `PCP` → PREGAO_PRESENCIAL; `CCE`/`CCP` → CONCORRENCIA; `PDE` → DISPENSA_COM_DISPUTA; `CPC` → CREDENCIAMENTO; `CNS` → CONCURSO; `TMP` → TOMADA_DE_PRECOS; `LEE`/`LEI` (leilão), `CPP` (chamada pública da agricultura familiar), `ESE`/`EST` (estatais), `RIN`, `RDE` → OUTROS. Fora: `PRD`, `PRI`, `RPO` (adesão) e `CHP` (chamamento de OSC) |
| `DT_ABERTURA` | `aberturaAt` = dia da sessão à meia-noite de Brasília (sem hora no LicitaCon; a tela mostra só o dia) |
| primeiro evento `PUE` | `publicadoAt` |
| `VL_LICITACAO` | `valorEstimado` (vazio com `BL_ORCAMENTO_SIGILOSO = S`) |
| `NR_LICITACAO/ANO_LICITACAO` | `numeroControle`; `NR_PROCESSO/ANO_PROCESSO` em `rawJson.processoAdministrativo` |
| `DS_OBJETO` | `objeto`; `srp` quando o objeto fala em registro de preços |
| `documento_lic.csv` | `rawJson.anexos` (até 10: edital, projeto/termo, ETP, orçamento, BDI, cronograma, encargos, outros; o mais recente primeiro) |
| eventos | `rawJson.publicacoes` (até 10), `rawJson.controlePncp`, `rawJson.publicadoNoPncp` (veículo `P` ou texto "PNCP") |

Nenhum dado de pessoa entra: as colunas de fornecedor, vencedor, autor de impugnação e observação são ignoradas (e foram apagadas da fixture `tests/fixtures/tce-rs/`).

## Coleta real de 18/10/2026 (banco descartável com o backup das 14:56 de 18/10)

| Medida | Valor |
|---|---|
| Linhas em `licitacao.csv` | 128.107 (PUB 93.281, ADH 25.211, EPU 6.014, HAP 3.601) |
| Edital publicado com sessão de hoje em diante | **1.618, em 364 municípios** (+ consórcios) |
| Antecedência (publicação do edital → sessão) | mediana 19 dias, 10% com 14 dias ou menos, mínimo 3 — tudo chega antes da sessão |
| Suspensas/revogadas/anuladas pelo último evento | 30 |
| Já no PNCP | **1.245 (77%)** — 312 pelo link declarado, 867 pela regra comum, 61 pelo número, 5 pela sessão |
| **Fora do PNCP, gravadas** | **343**: 332 em **133 municípios** + 11 de consórcios sem município — 177 pregões eletrônicos, 67 concorrências, 51 outros (leilões, chamadas públicas, estatais), 35 pregões presenciais, 9 credenciamentos, 4 dispensas eletrônicas; R$ 410 mi estimados, sem contar o registro de preços de R$ 2,2 bi do consórcio Granpal |
| Em municípios sem nenhuma licitação do PNCP no banco | 108, em 46 municípios |
| Com edital (PDF) para a análise por IA | 343/343 |
| Tempo | ~6 min pela rede real (3 trechos do ZIP, ~68 MB), quase tudo nas 1.600 consultas de duplicidade; status SUCCESS |

## Riscos conhecidos

- **Repetições que sobram**: das 343, 23 têm no PNCP uma licitação do mesmo município com objeto parecido (≥ 0,5) que as regras estritas não juntam. Algumas são a mesma (sessão adiada só de um lado e sem número para comparar: Garibaldi, Caçapava do Sul, Ponte Preta), outras são diferentes (Erechim tem várias com textos parecidos e números diferentes). Ficou do lado de mostrar duas vezes, não de esconder uma oportunidade.
- **84 das 343 dizem ter publicado no PNCP** (veículo `P`), e 8 trazem o link, mas a licitação não está no banco: se o coletor do PNCP trouxer depois, a revisão comum esconde a do TCE-RS quando o predicado estrito confirmar.
- **Códigos inferidos**: sem o leiaute oficial, fase/evento/resultado foram lidos pela correlação nos próprios dados (`REO` com resultado `R`, `ANO` com `N`, documentos "revogação", "anulação", "SUS-..."). Se o TCE mudar um código, a fase `EPU` com data futura continua sendo o filtro principal.
- **Sessão sem hora**: o LicitaCon só tem o dia; a licitação conta como aberta até o fim desse dia.
- **Órgão estadual em Porto Alegre**: Brigada Militar, Polícia Penal etc. podem comprar para unidades do interior; o município mostrado é a sede.
- **Arquivo anual**: se o TCE parar de aceitar `Range`, a coleta falha de propósito (não baixa 257 MB); a alternativa são os arquivos por órgão.
