# Mapa da fonte — FAMEM (Diário Oficial dos Municípios do Maranhão) — verificado em 18/10/2026

A Federação dos Municípios do Estado do Maranhão publica em `https://diariooficial.famem.org.br` o diário oficial das prefeituras que aderiram a ele. A plataforma é o **SIGA** da Siganet (PHP/CodeIgniter), não o SIGPub: cada publicação é uma matéria com categoria, entidade e texto em HTML.
Prefeituras pequenas do Maranhão ainda publicam aviso de licitação só no diário, sem o PNCP (prazo de adaptação da Lei 14.133 até ~04/2027). Os avisos saem do texto da matéria pelo mesmo leitor do Querido Diário e do SIGPub (`parseDiarioOficial`).

- `robots.txt` não existe (404, sem regra). O site não tem página de termos de uso; as páginas "Normas de envio" e "O que publicar" tratam só de quem publica.
- Sem login, sem CAPTCHA, sem WAF visto. Só GET.
- Fonte no banco: `FAMEM` (migration 45). Rótulo na web: "FAMEM (municípios do Maranhão)". Marca na faixa de fontes: "FAMEM".

## Por que uma fonte própria, e não mais uma associação em `DIARIO_MUNICIPAL`

- O coletor do SIGPub é da plataforma SIGPub: busca por termo em HTML, cartões, código de 8 caracteres e bloqueio que para as 13 associações juntas (mesmo servidor). A FAMEM é outra plataforma, com outro protocolo (lista JSON com cookie de sessão), outro servidor e outro bloqueio. Pôr as duas no mesmo coletor exigiria abstrair as duas plataformas: mais código e mais risco do que um coletor pequeno.
- A saúde dos coletores (`saudeDosColetores.ts`) é por fonte. Com a mesma fonte, a FAMEM parada ficaria escondida atrás do SIGPub funcionando.
- O que é de diário continua compartilhado: o leitor de avisos (`parseDiarioOficial`), o filtro de título do SIGPub (`tituloDeAviso`, `TITULO_COM_MODALIDADE`), o município pela entidade (`municipioDaEntidade`), a republicação (`prepararRepublicacao`), a conferência com o Querido Diário (`existeNoQueridoDiario`, prefixo `FAMEM-` → `QD-`), a memória no Redis e o `salvarLote`. A FAMEM entra em `FONTES_DE_DIARIO` (aviso sem objeto é escondido) e em `FONTES_QUE_REPETEM_O_PNCP`.

## URLs

| Item | Valor |
|---|---|
| Página que abre a sessão | `GET /dom/dom/todasPublicacoes` — devolve `Set-Cookie: ci_session=…` (30 min) |
| Lista de publicações | `GET /dom/dom/pesquisaPublicacoes/` com o cookie `ci_session` (e `X-Requested-With: XMLHttpRequest`, como o DataTables do site). Sem o cookie volta **200 com a lista vazia** (`recordsTotal: 0`) |
| Matéria | `GET /dom/dom/publicacoesDetalhes/{TDC_ID}` — HTML, não precisa do cookie. Identificador inexistente volta 200 com a página vazia (sem entidade nem código identificador) |
| Edição em PDF | `painel.siganet.net.br/upload/0000000002/cms/publicacoes/diario/…-edicao-{N}-assinado.pdf` — não usada |
| Filtro por data | o formulário (`POST /dom/dom/todasPublicacoes/` com `caxDtInicio`/`caxDtFim`) grava o filtro na sessão e a lista seguinte vem só do período (454 publicações de 13 a 18/10). **Não usado**: a lista inteira já cobre a janela e o coletor fica só com GET |

## A lista (JSON do DataTables)

`{ draw, recordsTotal, recordsFiltered, data: [...] }`. Em 18/10/2026: **2.000 publicações** (o teto do servidor), de 21/09 a 16/10/2026, **19 edições** (uma por dia útil, às 05:00), **65 entidades** (todas prefeituras), ~846 KB.

| Campo | Uso |
|---|---|
| `TDC_ID` | identificador da publicação (numérico, crescente) — memória e URL da matéria |
| `TDO_DT_GERACAO` | data da edição (`AAAA-MM-DD hh:mm:ss`) — janela |
| `TDO_EDICAO` | número da edição |
| `TDCT_DESCRICAO` | categoria ("AVISO DE LICITAÇÃO", "AVISO DE PREGÃO", "AVISO DE CONCORRÊNCIA", "EDITAL", "AVISO DE CHAMADA PÚBLICA", "PORTARIA", "EXTRATO DE CONTRATO"…) |
| `TDC_TITULO` | título da matéria |
| `PUBLICACAO_DONO` | entidade ("Prefeitura Municipal de Feira Nova Do Maranhão") |

Categorias em 4 semanas: 380 portarias, ~820 extratos, aditivos e atas de registro de preço, 103 decretos, 71 "AVISO DE LICITAÇÃO", 28 "AVISO DE PREGÃO", 26 "EDITAL", 15 "AVISO DE CONCORRÊNCIA", 11 "EDITAL DE CHAMAMENTO PÚBLICO", 26 dispensas/contratações diretas.

## A matéria (HTML)

Dentro de `#sidebar .tabela-resultados`:

- `.alert` com a entidade (ícone `glyphicon-map-marker`), "ANO XX Nº 3959" (ícone `glyphicon-info-sign`), `<time>` com a data por extenso e o **código identificador** (hash de 32 caracteres, ícone `glyphicon-barcode`);
- `h4` com o título;
- o corpo em parágrafos logo abaixo. Quase sempre **uma matéria = um aviso**; às vezes a mesma prefeitura junta vários avisos numa matéria.

A entidade da página é conferida com a da lista; se não bater (ou a página vier vazia), a leitura conta como falha e a publicação não é marcada como lida.

## Coleta (`workers/coletorFamem.ts` + `services/famemColeta.ts` + `services/famemParser.ts` + `services/famemService.ts`)

1. **Sessão**: `GET` da página de publicações e leitura do `ci_session` do `Set-Cookie` (valor validado, só letras/números).
2. **Lista**: uma requisição com o cookie. Lista vazia é **falha** (`listaVazia`), não "sem publicações": é o que o site devolve quando não reconhece a sessão. Resposta que não é o JSON esperado (página de bloqueio, HTML) é falha (`listaIlegivel`).
3. **Janela**: publicações dos últimos 30 dias de Brasília (a lista inteira, ~4 semanas). Aviso publicado há 3 semanas pode ter sessão daqui a 10 dias; a memória evita reler.
4. **Filtro pela categoria e pelo título** (`avaliarPublicacao`), sem baixar a matéria:
   - precisa de uma modalidade na categoria ou no título (`TITULO_COM_MODALIDADE` do SIGPub);
   - descarta pelo `tituloDeAviso` do SIGPub (homologação, ratificação, resultado, extrato, aditivo, errata, suspensão, revogação, adiamento, convocação, notificação, processo seletivo, inexigibilidade, portaria, decreto…);
   - descarta resenha/extrato de termo de credenciamento;
   - descarta edital que não é compra (Aldir Blanc/PNAB, ações culturais, premiação, pareceristas, REURB, matrícula, sanção de lei), só quando o título não fala em pregão/concorrência/tomada/leilão/convite;
   - **dispensa, contratação direta e inexigibilidade ficam de fora** (`contratacaoDireta`), como pede a regra da fonte. Em 4 semanas foram 26 matérias, entre elas dispensas eletrônicas com disputa. Para incluí-las, basta tirar `DISPENSA_*` de `MODALIDADES_FORA_DA_FAMEM` e o `\bDISPENSA\b` de `TITULO_DE_CONTRATACAO_DIRETA`.
5. **Município** pela entidade (`municipioDaEntidade` do SIGPub, UF MA) e **nome oficial do IBGE** pela tabela dos 217 municípios (`famemMunicipios.ts`, da API de localidades do IBGE). Entidade sem município (consórcio, federação) não é baixada.
6. **Memória** no Redis: sorted set `famem:publicacoes-lidas`, membro = `TDC_ID`, guardado por 40 dias (mais que a janela). Sem Redis a coleta segue e os tetos limitam a releitura.
7. **Leitura**: das publicações mais novas para as mais antigas (`TDC_ID` decrescente).
8. **Texto para o leitor de avisos** (`textoParaOParser`):
   - "PREGÃO ELETRÔNICO: Nº 018/2026" vira "PREGÃO ELETRÔNICO Nº 018/2026" (o leitor não aceita dois-pontos antes do "Nº");
   - matéria de um aviso só: o título vira o cabeçalho ("AVISO DE LICITAÇÃO" + título), a primeira linha repetida sai, e linhas internas que o leitor tomaria por início ou fim de outro aviso ("AVISO DE LICITAÇÃO" depois do número, "TERMO DE…") são neutralizadas. Sem isso, Riachão ("PREGÃO ELETRÔNICO Nº 90020/2026 … AVISO DE LICITAÇÃO … Objeto") perdia o número;
   - matéria com dois ou mais avisos vai como está.
9. **Dados pessoais** (`textoSemDadosPessoais`), antes do leitor, para nada disso chegar ao `trecho`, ao objeto ou ao banco: tira e-mail, CPF, telefone com DDD ou com rótulo e a **assinatura** (o que vem depois do fecho "Cidade, 15 de outubro de 2026." / "09/10/2026." / "aos 05 dias de outubro de 2026.", em cada aviso da matéria, quando o resto tem até 300 caracteres e nenhum horário). Nome, CPF, e-mail e telefone de pessoa física não são lidos para nenhum campo; o título da matéria não é gravado (só a categoria).
10. **Só oportunidade**: aviso com sessão de hoje em diante (dia de Brasília). Sem data da sessão legível, com sessão passada ou de dispensa/inexigibilidade no texto não é gravado (contado no log). Sessão de hoje que já passou do horário é gravada como ENCERRADA pelo leitor.
11. **Duplicidade**, nesta ordem:
    - id do PNCP no texto (o leitor descarta);
    - **regra estrita** do PNCP (`existeNoPncpPelaRegraEstrita`): candidatos do PNCP no mesmo município e família de modalidade nos últimos 180 dias, e `podeEsconderComoRepeticao` de `repeticaoDoPncp.ts` — sem conflito de modalidade, número, dia da sessão nem tipo de órgão, e objeto ≥ 0,7 ou ≥ 0,4 com o mesmo número ou o mesmo dia. É a mesma regra que esconde depois; a regra mais frouxa do Querido Diário (`existeNoPncp`) não é usada;
    - o mesmo aviso já gravado pelo Querido Diário (`QD-` com o mesmo resto do `fonteId`);
    - republicação do mesmo aviso (`prepararRepublicacao`).
    O PNCP que chega depois esconde a da FAMEM pela revisão de sempre (`FONTES_QUE_REPETEM_O_PNCP`, `duplicata_de`).
12. **Identificador**: `FAMEM-{IBGE}:{família}:{número}-{ano}[:{tipo de órgão}]` (ex.: `FAMEM-2104073:PREGAO:10-2026`), o mesmo desenho do Querido Diário e do SIGPub: a republicação do aviso cai no mesmo registro. `rawJson` guarda a publicação (`TDC_ID`), o código identificador, a entidade, a categoria, a edição e o trecho limpo.
13. **Educação com o servidor** (`famemClient`): uma requisição por vez, 2 s entre elas, 60 s de timeout, resposta de no máximo 5 MB, sem redirecionamento.
    - 5xx e queda de conexão: nova tentativa depois de 10 s e de 30 s;
    - **403, 429, 401 ou redirecionamento: para a coleta na hora**, sem nova tentativa (o cliente da FAMEM não repete 429/503 sozinho, opção `repetirEmLimiteOuIndisponivel: false` do `httpClient`);
    - 404 não é repetido; 3 falhas de leitura seguidas param a coleta.
14. **Tetos por coleta**: 80 requisições, 60 matérias, 20 minutos, 5.000 itens da lista. O que sobra fica para a coleta seguinte (as mais antigas).
15. **Agenda**: 11:10 e 18:10 de Brasília (`coleta-famem`), horário que nenhuma outra fonte usa, depois da edição das 05:00; e uma coleta na subida do processo.
16. **Log** (`worker_logs`, fonte `FAMEM`): requisições, publicações na lista e na janela, outros atos, contratações diretas, sem município, já lidas, lidas, falhas, pendentes, avisos, com sessão de hoje em diante, sem data, sessão passada, já no PNCP, já no Querido Diário, novas, atualizadas e municípios. FAILED quando não houve lista (sessão, lista vazia, lista ilegível, bloqueio antes da lista); PARTIAL com falhas ou teto.

## Coleta real (18/10/2026, 18:01 de Brasília, contra a cópia do banco de 18/10 17:02)

Coleta única com os tetos abertos (o normal é 60 matérias por coleta) para medir a lista inteira:

| Medida | Valor |
|---|---|
| Requisições | 147 (página + lista + 145 matérias), 5 min 38 s, nenhuma falha, nenhum bloqueio |
| Lista | 2.000 publicações, 19 edições, 65 prefeituras |
| Matérias candidatas | 145 na coleta medida; **138** com o filtro de edital cultural que entrou depois (7 editais de premiação/PNAB/pareceristas a menos); 26 dispensas/contratações diretas fora pelo título |
| Licitações identificadas no texto | 115: **66 com sessão de hoje em diante**, 39 com a sessão já passada, 10 sem data legível |
| Já no PNCP (regra estrita) | **34 das 66** (nenhuma com id do PNCP no texto) |
| Republicação do mesmo aviso | 1 |
| Gravadas | 31 na coleta; **30** sem o chamamento da PNAB de Bacurituba (o filtro novo não o lê mais), em **16 municípios**: 21 pregões eletrônicos, 6 concorrências, 3 credenciamentos/chamadas públicas |
| Municípios do MA com licitação aberta | 134 → **140** (83 → 77 sem nenhuma): Cajari, Penalva, Sucupira do Norte, Nina Rodrigues, Feira Nova do Maranhão e Itinga do Maranhão |
| Regra frouxa do Querido Diário | esconderia mais 2 das 31 gravadas; a regra estrita as mantém |

Conferência da pesquisa do TCE-TO: das 65 prefeituras que publicam na FAMEM, 33 não tinham nenhuma aberta no banco; **13** delas publicaram aviso de licitação nas 4 semanas (a pesquisa estimou 16), e 6 passaram a ter uma licitação aberta com sessão futura (as outras 7 publicaram avisos com a sessão já passada).

Custo em regime: **~7 matérias por dia útil** (138 em 19 edições) + 2 requisições (página e lista, ~850 KB). A primeira coleta em produção lê as 60 mais novas; as 78 restantes saem nas duas coletas seguintes.

## Limites conhecidos

- Só o texto da matéria é lido. O edital fica no portal de compras de cada prefeitura e não é baixado (o host não está no `urlGuard.ts`; a análise por IA fica sem anexos desta fonte).
- O objeto vem do texto livre e às vezes leva junto o fim da frase ("…, que será realizado no dia 30 de outubro…"). Limite do leitor compartilhado.
- A assinatura é cortada pelo fecho com data; nome de pessoa no meio do texto ("Pregoeira: Fulana") ou num título (homenageado de um edital cultural) não é reconhecido. Os títulos não são gravados e os editais culturais não são lidos.
- Suspensão, revogação e adiamento publicados depois não mudam o registro gravado (o mesmo limite do SIGPub e do Querido Diário). O adiamento republicado como aviso com data nova atualiza a sessão pelo mesmo `fonteId`.
- O servidor devolve no máximo 2.000 publicações (~4 semanas). Se o volume subir, a janela real encolhe; a coleta lê o que vier.
- Se o site trocar o cookie por outro nome ou passar a exigir outro passo, a lista vem vazia e a coleta registra FAILED — não grava nada errado.
- O município vem da entidade da lista. Um aviso de uma prefeitura sobre outro município (raro) fica no município de quem publicou.
