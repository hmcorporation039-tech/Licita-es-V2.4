# Mapa da fonte — Diários municipais (SIGPub) — verificado em 17/10/2026

Prefeituras pequenas ainda podem publicar licitação só no diário oficial, sem o PNCP, até cerca de 04/2027 (prazo de adaptação da Lei 14.133 para municípios de até 20 mil habitantes).
Boa parte desses diários fica na plataforma **SIGPub** (Vox Tecnologia), em `www.diariomunicipal.com.br`, que hospeda o diário oficial de 13 associações de municípios.

- `robots.txt` libera tudo (`Disallow:` vazio).
- Não há API nem RSS. A coleta usa só GET na página de busca e na página de cada matéria.
- Fonte no banco: `DIARIO_MUNICIPAL` (migration 33). Rótulo na web: "Diários municipais (associações)".

## Associações (ordem de coleta = prioridade pela lacuna de cobertura do PNCP)

| # | Slug | UF | Associação | Entidades | Matérias com "aviso de licitação" em 13–17/10/2026 |
|---|---|---|---|---|---|
| 1 | `famup` | PB | Federação das Associações de Municípios da Paraíba | 124 | 58 |
| 2 | `famep` | PA | Federação das Associações de Municípios do Estado do Pará | 207 | 70 |
| 3 | `amm-mt` | MT | Associação Mato-grossense dos Municípios | 168 | **0** — sem edição recente no SIGPub |
| 4 | `femurn` | RN | Federação dos Municípios do Rio Grande do Norte | 244 | > 25 |
| 5 | `appm` | PI | Associação Piauiense de Municípios | 35 | **0** — sem edição recente no SIGPub |
| 6 | `aam` | AM | Associação Amazonense de Municípios | 154 | 74 |
| 7 | `arom` | RO | Associação Rondoniense de Municípios | 56 | 83 |
| 8 | `ama` | AL | Associação dos Municípios Alagoanos | 109 | 65 |
| 9 | `aprece` | CE | Associação dos Municípios do Estado do Ceará | 110 | 71 |
| 10 | `amupe` | PE | Associação Municipalista de Pernambuco | 194 | 183 |
| 11 | `famurs` | RS | Federação das Associações de Municípios do Rio Grande do Sul | 304 | 263 |
| 12 | `amp` | PR | Associação dos Municípios do Paraná | 189 | 352 |
| 13 | `amm-mg` | MG | Associação Mineira de Municípios | 751 | 357 |

O número de entidades vem da pesquisa de 17/10 e inclui câmaras, consórcios, fundos e autarquias, não só prefeituras.
`amm-mt` e `appm` respondem, mas a busca não traz nenhuma matéria de outubro (a página inicial da AMM-MT mostra "Nenhuma edição publicada nesta data"). Elas continuam na lista: custam uma busca por coleta e voltam a ser lidas sozinhas se as publicações retornarem.

## URLs

| Item | Valor |
|---|---|
| Busca | `GET https://www.diariomunicipal.com.br/{slug}/pesquisar?busca_avancada[texto]=…&busca_avancada[dataInicio]=AAAA-MM-DD&busca_avancada[dataFim]=AAAA-MM-DD&busca_avancada[ordenacao]=recente&busca_avancada[pagina]=N` |
| Outros campos do formulário (não usados) | `busca_avancada[titulo]`, `busca_avancada[entidade]` (id interno da entidade), `busca_avancada[orgao]` |
| Matéria | `GET https://www.diariomunicipal.com.br/{slug}/materia/{CÓDIGO}` (código identificador de 8 caracteres, ex.: `3D2DAFAD`) |
| Também existem | `/{slug}/download/materia/{CÓDIGO}` (HTML) e `/{slug}/download/edicao/{CÓDIGO}` (PDF da edição) — não usados |

Detalhes que importam:

- O texto da busca **precisa ir em UTF-8**. Em Latin-1, a página volta com "Este valor não corresponde ao charset UTF-8 esperado" e sem resultados.
- 25 matérias por página. O resumo diz "Mostrando X a Y de Z matérias", e a próxima página é o link `rel="next"` da paginação.
- A busca procura as palavras no texto. "aviso de licitação" também traz "aviso de solicitação de cotação … Divisão de Licitação". O filtro de verdade é o parser.
- Não há filtro por categoria. Por isso há um filtro pelo título (abaixo).
- A data da sessão só aparece no texto livre. O cartão da busca e a página da matéria trazem só a data de circulação e a edição.

## Estrutura do HTML

**Cartão da busca** (`li.materia-card`):

- `h2.materia-card__titulo a[href=/{slug}/materia/{CÓDIGO}]` traz o título.
- `.materia-card__entidade` traz o município ou a entidade ("Município de Caaporã", "PREFEITURA MUNICIPAL DE SANTA CECÍLIA", "Consorcio …").
- `.materia-card__orgao` traz o órgão.
- `.materia-card__trecho` traz um trecho do texto.
- `dl.materia-card__dados` traz Circulação (dd/mm/aaaa), Edição e Código identificador.

**Página da matéria** (`article.documento`):

- `.documento__uf` ("ESTADO DA PARAÍBA"), `.documento__entidade` e `.documento__orgao`.
- `#materia` traz o corpo em HTML (parágrafos e `<br>`). Ele termina com "Publicado por: … Código Identificador", que é cortado.
- `footer.verificacao dl` traz Publicada em, Diário, Edição e Código identificador.

## Coleta (`workers/coletorDiarioMunicipal.ts` + `services/diarioMunicipalColeta.ts`)

1. **Janela**: os últimos 5 dias do calendário de Brasília, hoje incluído (`janelaDoDiarioMunicipal`). O aviso sai antes da sessão, então 5 dias de circulação cobrem o que ainda está aberto. A memória evita reler o que já foi lido.
2. **Termos** (`TERMOS_DE_BUSCA_SIGPUB`): "aviso de licitação", "pregão eletrônico", "pregão presencial", "dispensa eletrônica", "concorrência", "chamamento público", "credenciamento".
   - A mesma matéria achada por outro termo não é lida de novo.
   - Associação sem nenhuma matéria no primeiro termo pula os demais.
3. **Paginação**: até a página sem `rel="next"`, com teto de 20 páginas por termo (500 matérias).
4. **Filtro pelo título** (`tituloDeAviso`), sem baixar a matéria:
   - descarta homologação, adjudicação, ratificação, resultado, extrato de contrato/termo/ata, aditivo, apostilamento, ata de registro, errata, retificação, suspensão, revogação, anulação, adiamento, fracassada, deserta, cancelamento, prorrogação, impugnação, decisão de recurso, julgamento, processo seletivo, concurso, inexigibilidade, ordem de serviço, IRP, adesão, convocação e notificação;
   - descarta portaria, decreto, lei, resolução e despacho no início do título.
5. **Leitura**: o texto da matéria vai para o **mesmo parser dos diários do Querido Diário** (`parseDiarioOficial`, com origem `DIARIO_MUNICIPAL` e prefixo `DM`).
   - O parser extrai aviso, modalidade, número, objeto, sessão em hora de Brasília e órgão.
   - Ele descarta suspensão, retificação, dispensa já ratificada e aviso com id do PNCP no texto.
   - Se o corpo não tem linha "AVISO DE …" e o título traz uma modalidade, o título vira o cabeçalho do aviso.
6. **Município → IBGE** (`municipioDaEntidade`):
   - tira "Prefeitura Municipal de", "Município de", "Câmara Municipal de" e o sufixo "-UF";
   - compara pela tabela do IBGE da UF da associação (sem acento, hífen nem apóstrofo);
   - se não achar, tenta os pedaços depois de cada "de/do/da" ("Fundo Municipal de Saúde de Marabá" → Marabá);
   - depois tenta o cabeçalho da matéria;
   - consórcio, federação e afins ficam de fora (contados como "sem município").
7. **Duplicidade**, nesta ordem:
   - id do PNCP no texto, que o parser já descarta;
   - `existeNoPncp`, compartilhado com o Querido Diário: mesma UF, município e família de modalidade nos últimos 180 dias, com objeto parecido, sessão no mesmo dia ou **mesmo número/ano da compra** (`raw_json.numeroCompra`/`anoCompra`) e alguma semelhança no objeto (≥ 0,1);
   - `existeNoQueridoDiario`: o mesmo aviso já gravado pelo Querido Diário (`QD-` com o mesmo resto do `fonteId`);
   - `prepararRepublicacao`: republicação do mesmo aviso no SIGPub.
8. **Gravação**: `salvarLote` padrão (`coletorHtmlShared`), que enfileira o matcher para cada licitação nova.
9. **Educação com o servidor**:
   - requisições em sequência, com 2 s entre elas (no coletor e no `diarioMunicipalClient`);
   - timeout de 60 s, resposta de no máximo 5 MB e sem redirecionamento;
   - erro comum repete uma vez depois de 5 s;
   - **403/429**: espera 60 s e tenta mais uma vez. Se continuar, **para a coleta inteira** (o servidor é o mesmo para as 13 associações). O cliente HTTP ainda faz as próprias esperas em 429/503;
   - 5 falhas seguidas também param a coleta.
10. **Orçamento por coleta**: 45 minutos e 900 requisições (buscas + matérias). O que sobra fica para a coleta seguinte, listado no log.
11. **Memória** no Redis: sorted set `diario-municipal:materias-lidas` com membros `{slug}:{CÓDIGO}`, guardados por 20 dias.
    - A matéria só é marcada quando todos os avisos dela foram gravados.
    - Sem Redis, a coleta segue lendo tudo.
12. **Agenda**: 05:35 e 17:35 de Brasília (`coleta-diario-municipal`), além da coleta na subida do processo.

## Log

Por associação, que é o mesmo que por UF:

- buscas;
- matérias encontradas, descartadas pelo título, já lidas antes, lidas, com falha e sem município;
- avisos, novos, atualizados e inalterados;
- já no PNCP e já no Querido Diário.

O log também traz uma linha "Por UF" e o total da coleta. O `worker_logs` recebe a fonte `DIARIO_MUNICIPAL`, com status SUCCESS, PARTIAL ou FAILED.

## Amostra ao vivo (17/10/2026, só "aviso de licitação", 18 requisições por associação, sem gravar)

| Associação | Matérias lidas | Avisos | Abertos | Fora da lista "recebendo proposta" do PNCP para o município |
|---|---|---|---|---|
| famup (PB) | 17 | 12 | 12 | ~6 |
| famep (PA) | 16 | 8 | 8 | ~4 |
| femurn (RN) | 17 | 10 | 10 | ~3 |

A comparação com o PNCP foi feita à mão, pela busca pública por município (mesmo número e/ou objeto parecido). Ela é aproximada: um aviso que o PNCP ainda vai abrir para propostas também aparece como "fora".

## Limites conhecidos

- Só o texto da matéria é lido. O edital, que está no portal de compras de cada prefeitura, não é baixado. Por isso o host não está no `urlGuard.ts`, e a análise por IA não tem anexos para esta fonte.
- O objeto vem do texto livre. Modelos como "Formar Sistema de Registro de Preços objetivando contratações futuras, para: …" (PB) entram com esse prefixo.
- Aviso sem data de sessão legível entra sem `aberturaAt` e segue a regra de "aberta sem data" (≤ 30 dias da publicação).
- Matéria de consórcio ou de entidade estadual não é gravada.
- O Querido Diário também indexa parte desses diários. O SIGPub confere o Querido Diário antes de gravar, mas o coletor do Querido Diário não confere o SIGPub. Um aviso que o SIGPub gravou primeiro pode voltar pelo Querido Diário com outro `fonteId`.
- A primeira coleta é a mais pesada: cerca de 1.600 matérias com "aviso de licitação" em 5 dias, somadas as 13 associações. Ela para no orçamento e as seguintes completam com a memória.
