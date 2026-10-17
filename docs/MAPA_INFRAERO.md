# Mapa da fonte — Infraero — verificado em 17/10/2026

A Infraero (empresa pública federal, Lei 13.303/2016) **não publica no PNCP**. O portal próprio é um sistema Java/JSP antigo, em ISO-8859-1, atrás de F5 BigIP, sem login e com `robots.txt` vazio.
Coleta só por GET da página de detalhe; nenhum formulário é enviado.

## Como lê

| Item | Valor |
|---|---|
| Detalhe | `GET https://licitacao.infraero.gov.br/portal_licitacao/servlet/DetalheLicitacao?idLicitacao=N` |
| Não existe | página com "O objeto procurado não foi encontrado!" (HTTP 200) |
| Anexos | `https://licitacao.infraero.gov.br/arquivos_licitacao/...` (host na allow-list do `urlGuard.ts`) |
| Ids | sequenciais com buracos; ~150 a 200 por mês somando todos os tipos de processo |
| Pesquisa (não usada) | `POST /portal_licitacao/servlet/PesquisaLicitacao` — 1.576 registros "Em Andamento" em 17/10/2026, desde 2020: o portal quase nunca atualiza a situação |

## Coleta (`workers/coletorInfraero.ts` + `services/infraeroVarredura.ts`)

1. **Cursor**: maior id já gravado (`coletaCursorService.maiorIdColetado`) menos 20; sem nada gravado, começa em 177900.
2. **Varredura**: GET id a id, em sequência, 1,5 s entre requisições (`infraeroClient`), timeout de 30 s, até 3 tentativas com espera de 5 s e 10 s em erro de rede/5xx/429.
3. **Parada**: depois de 60 "não encontrado" seguidos, uma sonda 100 ids à frente; se ela também não existir, para. Se existir, atravessa o buraco.
4. **Tetos**: 250 requisições de varredura + 60 revisitas por coleta; 3 falhas seguidas encerram a coleta.
5. **Revisita**: licitações já gravadas como ABERTA (com sessão há no máximo 7 dias) ou SUSPENSA, as menos conferidas primeiro (`situacaoCheckedAt`), para atualizar situação e datas. Reabertura de suspensa reenfileira o matcher.
6. **Agenda**: 09:50 e 16:50 de Brasília.

## O que entra

| Campo do portal | Campo nosso |
|---|---|
| Processo | `modalidade` (Licitação → CONCORRENCIA; Pregão → PREGAO_*; Dispensa Eletrônica → DISPENSA_COM_DISPUTA; Dispensa/Licitação Dispensada → DISPENSA_SEM_DISPUTA; Inexigibilidade → INEXIGIBILIDADE; Leilão, RDC, Chamamento, Convocação, Consulta de Preços, Termo de Cessão de Uso → OUTROS) |
| Número `128/ADLI-2/SBRJ/2026` | `numeroControle`; o 3º pedaço é o código do aeroporto (ICAO) ou `SEDE` |
| Código do aeroporto | `uf`, `municipio`, IBGE e coordenadas pela tabela `AEROPORTOS_INFRAERO`; código fora da tabela → município citado no objeto ("AEROPORTO DE X/UF"); `SEDE` → DF sem município |
| UF | só usado quando não há aeroporto (o portal mostra a UF do responsável, quase sempre DF) |
| Data/Hora de Abertura | `aberturaAt` = sessão (mesma regra de FIEG/SESC/Sistema S em `licitacaoAberta.ts` e `dataDaSessao.ts`) |
| Situação | Em Andamento → ABERTA; Adiada sine die/Suspensa → SUSPENSA; Homologada; Encerrada/Deserta/Fracassada → ENCERRADA; Cancelada; Anulada; Revogada |
| Tabela de arquivos | `rawJson.anexos` (análise por IA); a data mais antiga vira `publicadoAt` |
| Local de abertura / observação | `rawJson.numeroNoLicitacoesE` (id no licitacoes-e do Banco do Brasil) |
| — | `linkEdital` = página de detalhe; `orgao` = Infraero, CNPJ 00.352.294/0001-10; sem valor estimado |

## O que fica de fora

- Processos sem disputa: Comunicado, Fato Relevante, Audiência/Consulta Pública, Intenção de Registro de Preço (o prazo é para outros órgãos; a licitação sai depois com id novo), Adesão a Ata, acordos, convênios, contratos, Relação de Compras, Inaplicabilidade.
- Registro sem "Data/Hora de Abertura" (contratação direta já decidida, como inexigibilidade de hangaragem).
- Novo registro com sessão já passada ou situação final.

## Aeroportos confirmados nos dados

SBRJ Santos Dumont (Rio de Janeiro/RJ), SWNS Anápolis/GO, SWUZ Luziânia/GO, SWFN Flores (Manaus/AM), SBIP Vale do Aço (Ipatinga/MG), SBMS Mossoró/RN, SBSO Sorriso/MT.
Os demais regionais (Divinópolis, Governador Valadares, Torres, Canela, Olímpia, Ariquemes, Itaperuna, Paranavaí) entram pelo município citado no objeto até o código aparecer numa licitação real e ser incluído na tabela.
