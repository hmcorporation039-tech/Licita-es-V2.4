# Mapa da fonte — TCE-TO (municípios do Tocantins) — verificado em 18/10/2026

O Tribunal de Contas do Tocantins exige que todo jurisdicionado (prefeituras, câmaras, fundos e autarquias municipais, além do Estado) cadastre cada licitação no **SICAP-LCO** (Licitações, Contratos e Obras) em até 5 dias da publicação no diário (IN TCE/TO nº 3/2017).
O **Módulo Público** do SICAP-LCO (`app.tceto.tc.br/lo_publico`) mostra esses cadastros a qualquer pessoa, com filtro pela **data de abertura** (recebimento das propostas ou sessão). Por isso ele traz licitação aberta antes da sessão, inclusive de prefeitura pequena que ainda não publica no PNCP.

- Sem login, sem CAPTCHA, sem robots.txt (`/robots.txt` responde 302).
- A página pública chama uma API JSON do próprio TCE, que é a que a coleta usa. Só GET.
- Fonte no banco: `TCE_TO` (migration 43). Rótulo na web: "TCE-TO (municípios do Tocantins)".

## Por que esta fonte (pesquisa de 18/10/2026: BA, MA e TO)

Banco de 18/10/2026 (cópia descartável do backup das 14:56): municípios **sem nenhuma licitação aberta** na base — BA 111 de 417, MA 83 de 217, TO 56 de 139.

| Fonte | UF | URL | Cobertura | Abertas antes da sessão? | Formato | Viabilidade |
|---|---|---|---|---|---|---|
| **TCE-TO — SICAP-LCO, Módulo Público** | TO | `app.tceto.tc.br/lo_publico` (API `…/sicap/lco/jurisdicionado/auditor/app/controllers/`) | 139 municípios (cadastro obrigatório); 125 procedimentos com sessão futura, 88 municipais em 47 municípios | Sim, filtro por data de abertura | JSON com paginação (`page`, `limit`, `total`), detalhe em JSON | **Implementada** |
| FAMEM — Diário Oficial dos Municípios do Maranhão (SIGA/siganet) | MA | `diariooficial.famem.org.br/dom/dom/todasPublicacoes` | 65 entes publicaram em 4 semanas; 140 avisos de licitação/pregão/concorrência no período; 16 dos 83 municípios do MA sem aberta na base | Sim (aviso com data da sessão no texto) | Lista JSON (DataTables, exige cookie de sessão do próprio site) + matéria em HTML com o texto | **Viável — próxima a fazer** (mesmo formato do SIGPub, parser compartilhado do Querido Diário) |
| TCE-MA — Mural SACOP | MA | `sacop-mural.apps.tcema.tc.br` (API `/api/v1/mural/licitacoes`) | Histórico até 2022; 0 registros de 2024–2026 | Não (desatualizado) | JSON | Inviável hoje |
| TCM-BA — Licitações Municipais | BA | `tcm.ba.gov.br/controle-social/edital-licitacao-municipio/` | 417 municípios | Desconhecido | Formulário com reCAPTCHA v3; o webservice responde "Unauthorized origin or missing API key" | Inviável (CAPTCHA + chave) |
| DOEM / IBDM (`doem.org.br`) | BA | `doem.org.br` | Muitos municípios baianos | Sim | Redireciona para "Bot Detection" (`ibdm.org.br/challenge`) | Inviável (proteção anti-robô) |
| Diário Oficial BA / Rede Geral | BA | `diariooficialba.com.br` → `pm{cidade}.transparenciaoficialba.com.br` | Lista as 417 cidades | — | Os subdomínios das cidades não resolvem (NXDOMAIN) | Inviável (fora do ar) |
| Diário Oficial da União, seção 3 | BA/MA/TO | `in.gov.br` | Prefeituras com recurso federal publicam aviso lá | Sim | HTML de busca; `robots.txt` com `Disallow: /`; base completa só pelo INLABS (com cadastro) | Inviável sem conta (robots proíbe) |
| SAI (`sai.io.org.br`) | BA | `sai.io.org.br` | — | — | Exige login | Inviável |
| SIGPub (UPB, FAMEM, ATM) | BA/MA/TO | `diariomunicipal.com.br/{upb,famem,atm}` | — | — | 404 / redireciona para a home | Não hospeda essas associações |

Conferência por amostra: dos 56 municípios do TO sem aberta na base, 11 têm licitação com sessão futura no SICAP-LCO; dos 83 do MA, 16 publicaram aviso no diário da FAMEM nas últimas 4 semanas. Na Bahia nenhuma fonte aberta e permitida foi achada.

## Como lê

| Item | Valor |
|---|---|
| Lista | `GET /sicap/lco/jurisdicionado/auditor/app/controllers/?c=TCE_sicap_lco_jurisdicionado_auditor_ProcedimentosPublico&m=listarProcedimentos&tipoordenacao=procedimento&ordem=DESC&tipodata=abertura&databrinicio=DD/MM/AAAA&databrfim=DD/MM/AAAA&page=N&limit=200&start=(N-1)*200` |
| Resposta da lista | `{ success, raiz: [...], total }` |
| Campos usados da lista | `idProcedimento`, `nomeuni`, `cnpjuni`, `codmunicipio` (IBGE), `codesfera` (2 = municipal), `modalidade`, `numeroLicitatorio`/`anoLicitatorio`, `numProcessoAdministrativo`/`anoProcessoAdministrativo`, `objeto`, `valorEstimado`, `dataAberturaEvento`, `primeiraPublicacao`, `dataCadastroProcedimento`, `isregistropreco`, `esdispensaeletronica`, `iscredenciamento`, `situacao_2fase`, `ativoProcedimento`, `sigiloso` |
| Detalhe | `GET …?c=TCE_sicap_lco_jurisdicionado_auditor_ProcedimentosPublico&m=detalharPrimeiraFase&idProcedimento={id}` |
| Campos usados do detalhe | veículos de publicação (`Publicacoes`), `linksessao`, critério (`TipoLicitacao`), regime, quantidade de itens, natureza do objeto, `procedimentoAtivo`, `situacao2Fase` |
| Página pública (vira `linkEdital`) | `https://app.tceto.tc.br/lo_publico/pesquisar/detalhes?idProcedimento={id}` |
| Anexos | `…&c=TCE_sicap_lco_jurisdicionado_auditor_AnexosPublico&m=listarAnexos` lista o edital em PDF — **não são baixados** (o host não está no `urlGuard.ts`, a análise por IA fica sem anexos desta fonte) |

**Dado pessoal**: a lista traz nome e CPF de quem assinou o cadastro (`assinaturas`) e o detalhe traz responsável, e-mail, telefone e CPF de quem digitou. O parser **não lê** esses campos e nada disso vai para o banco. As fixtures dos testes foram salvas sem eles.

## Coleta (`workers/coletorTceTo.ts` + `services/tceToColeta.ts`)

1. **Lista**: sessões de hoje (Brasília) até 400 dias à frente, 200 por página, até a página incompleta ou o `total` anunciado (1 requisição em 18/10/2026). Teto de 20 páginas.
2. **Só municipais** (`codesfera = 2`) de município do Tocantins (139 códigos do IBGE em `tceToMunicipios.ts`). Unidades estaduais ficam de fora, porque publicam no PNCP.
3. **Cadastradas hoje** esperam a coleta seguinte: o PNCP ainda pode trazê-las.
4. **Duplicidade com o PNCP, antes do detalhe**: a regra do TCE-CE (`duplicataNoPncpTceCe`) com o predicado estrito de `repeticaoDoPncp.ts`. Mesmo município, modalidade equivalente, número/processo sem conflito, dia da sessão sem conflito e órgão compatível. É repetição com objeto ≥ 0,8, ou palavras distintivas em comum, ou o mesmo número/processo com objeto parecido. Ajustes de 18/10/2026, todos achados na coleta real:
   - o PNCP fecha as propostas às 23:59 da véspera, e esse dia seguinte também conta como o dia da sessão (vale para todas as fontes);
   - a data do TCE-TO é só o dia, digitado pelo município, e aceita 1 dia de folga (só `TCE_TO`);
   - chamada pública, leilão e afins (`OUTROS`) comparam com qualquer modalidade do PNCP, como o `OUTROS` do TCE-CE;
   - número do PNCP com o ano colado no fim (`000000012026`) vira o número 1.
5. **Detalhe** só das novas fora do PNCP, das sessões mais próximas para as mais distantes. Se o detalhe falhar (ou o teto acabar), a nova é gravada só com os dados da lista (`rawJson.detalheLido = false`).
6. **Já gravadas** (`TCE-TO-{idProcedimento}`): relidas quando a linha da lista muda (`rawJson.assinaturaDaLista`) ou depois de 3 dias sem conferência. Mudança de situação vai direto para `situacao`. Suspensa que reabre volta ao matcher.
7. **Sumidas**: com a lista lida por inteiro, uma ABERTA/SUSPENSA com sessão futura que sumiu da lista tem o detalhe conferido uma vez por dia. Procedimento inativo vira CANCELADA, e a 2ª fase encerrada muda a situação.
8. **Memória** no Redis, no sorted set `tce-to:detalhes-lidos`, por 20 dias:
   - guarda o procedimento lido e descartado (`{id}:{hash da linha}`), que só é relido se a linha mudar;
   - guarda a sumida conferida no dia (`sumida:{id}:{dia}`);
   - sem Redis, a coleta segue sem memória.
9. **Educação com o servidor**:
   - requisições em sequência, 2 s entre elas (`tceToClient`), timeout de 60 s, resposta de no máximo 10 MB, sem redirecionamento;
   - 5xx e erro de rede: até 3 tentativas na lista e 2 no detalhe, com espera de 5 s e depois 10 s;
   - **403/429** para os pedidos na hora. O `httpClient` já esperou e repetiu o 429.
10. **Orçamento por coleta**: 300 detalhes e 30 minutos. O que sobra fica para a coleta seguinte.
11. **Agenda**: 10:45 e 17:45 de Brasília (`coleta-tce-to`), depois das duas coletas do PNCP.
12. **Repetição depois**: `TCE_TO` está em `FONTES_QUE_REPETEM_O_PNCP`. Quando o PNCP traz a mesma licitação mais tarde, a do TCE-TO é escondida (`duplicataDe`).

## O que entra

| Origem | Campo nosso |
|---|---|
| `modalidade` + marcas | Pregão Eletrônico/Presencial; Concorrência; Tomada de Preços; Convite; Concurso; Diálogo Competitivo; `esdispensaeletronica` → DISPENSA_COM_DISPUTA; `iscredenciamento` → CREDENCIAMENTO; Chamada Pública/Leilão → OUTROS |
| `situacao_2fase` | vazio/"Em andamento" → ABERTA; "Suspenso." → SUSPENSA; Homologada/Adjudicada → HOMOLOGADA; Fracassada/Deserta/Encerrada → ENCERRADA; Cancelada/Revogada/Anulada; `ativoProcedimento = 0` → CANCELADA; outro texto → ignorada |
| `dataAberturaEvento` | `aberturaAt` = meia-noite de Brasília do dia (dia sem hora: aberta até o fim do dia, mostrada só com a data) |
| `primeiraPublicacao` (ou cadastro) | `publicadoAt` |
| `codmunicipio` | `uf` TO, `municipio` com o nome oficial do IBGE, `municipioIbge`, coordenadas |
| `nomeuni`, `cnpjuni` | `orgao` ("Prefeitura Municipal de Taguatinga", "Fundo Municipal de Saúde de Augustinópolis"), `orgaoCnpj` |
| `valorEstimado` | `valorEstimado`. Com orçamento sigiloso ou zero, fica vazio |
| `isregistropreco` ou "registro de preço" no objeto | `srp` |
| `numeroLicitatorio/anoLicitatorio` | `numeroControle` ("4/2026") e `rawJson.numero` |
| Outros | `rawJson`: processo administrativo, unidade gestora, modalidade e situação da origem, fases, relatoria, datas de cadastro e da primeira publicação, orçamento sigiloso, e do detalhe os veículos de publicação, `publicadoNoPncp`, link da sessão, critério, regime e naturezas |

## Coleta real de 18/10/2026 (banco descartável com as 575 licitações do TO do backup, 521 do PNCP)

| Medida | Valor |
|---|---|
| Requisições ao TCE-TO | 44 (1 de lista + 43 de detalhe), ~100 s |
| Procedimentos com sessão de hoje em diante | 125, sendo 88 municipais em 47 municípios |
| Já no PNCP | 41 (39 pelo objeto, 2 pelo número) |
| Ignoradas | 4 (homologada, fracassada ou suspensa já no cadastro novo) |
| **Fora do PNCP, gravadas** | **43, em 23 municípios, R$ 34,3 mi estimados**: 18 pregões eletrônicos, 13 presenciais, 9 concorrências, 3 chamadas públicas |
| Municípios que **não tinham nenhuma** licitação aberta na base | **10**: Augustinópolis (7), Miracema do Tocantins (5), Buriti do Tocantins (3), Novo Jardim (2), Palmeirópolis (2), Goiatins, Luzinópolis, Marianópolis do Tocantins, Oliveira de Fátima e Taguatinga (1 cada) |
| Gravadas que citam o PNCP entre os veículos | 0 |

A primeira passada, sem os ajustes do passo 4, gravou 54. Oito delas eram de Pedro Afonso, iguais ao PNCP (o PNCP fechava as propostas às 23:59 da véspera). Também caíram Filadélfia (chamada pública × concorrência) e Rio dos Bois (número `000000012026`).

## Riscos conhecidos

- **Repetição que ainda escapa** (conferência à mão das 43): Combinado PE 7/2026 tem a sessão de 19/10 no TCE e de 26/10 no PNCP (adiada, e o TCE não foi atualizado). Gurupi CC 14/2026 tem o mesmo número e o mesmo dia, mas o objeto foi escrito de outro jeito. São 2 ou 3 de 43. O predicado estrito prefere mostrar duas vezes a esconder uma licitação diferente.
- **Cadastro atrasado ou incompleto**: o município tem 5 dias para cadastrar, e há município que não cadastra tudo. Uma recomendação do MPTO de 01/2024 achou só 1 de 13 licitações de Bernardo Sayão no SICAP-LCO. A fonte complementa o PNCP, não garante cobertura.
- **Data só com o dia**: a hora da sessão não vem. A licitação fica aberta até o fim do dia e aparece só com a data.
- **API sem documentação**: é a que o Módulo Público usa. Mudança de formato faz o parser recusar a lista e o log mostrar a falha, sem gravar nada errado.
- Sem anexos, a análise por IA devolve "sem documentos" para esta fonte. O edital está na página pública do TCE.

## O que fica para depois

1. **FAMEM (MA)**: mesmo desenho do SIGPub.
   - Uma requisição devolve as ~2.000 publicações mais recentes (cerca de 4 semanas), com categoria ("AVISO DE LICITAÇÃO", "AVISO DE PREGÃO", "AVISO DE CONCORRÊNCIA", "EDITAL") e ente.
   - Só os avisos são lidos (`/dom/dom/publicacoesDetalhes/{id}`, HTML com o texto) e passam pelo `parseDiarioOficial`.
   - Custa ~5 a 10 matérias por dia. A lista exige o cookie de sessão que o próprio site cria na primeira visita.
   - Cobre 16 dos 83 municípios do MA sem aberta na base.
2. **Bahia**: nenhuma fonte aberta e permitida.
   - O TCM-BA usa reCAPTCHA e chave de API; o DOEM/IBDM tem anti-robô; o DOU proíbe robôs.
   - Caminhos possíveis: pedir acesso ao webservice do TCM-BA (ofício/LAI), assinar o INLABS da Imprensa Nacional (seção 3, com cadastro), ou esperar a obrigação do PNCP para os municípios pequenos (~04/2027).
3. **Anexos do SICAP-LCO**: o edital em PDF ("Edital em formato pesquisável") está listado no detalhe. Baixá-lo exige pôr o host no `urlGuard.ts` e no fluxo de documentos.
