# Mapa de cobertura — Sistema S (SESI / SENAI / SENAC) — verificado em 15/10/2026

Todas as URLs abaixo foram testadas com curl (UA de navegador, poucas requisições por host) e devolveram HTTP 200 com licitações reais, exceto onde indicado.
Nenhum login, nenhum formulário enviado.

## Plataformas encontradas

| Código | Plataforma | Como ler | Campos úteis |
|---|---|---|---|
| **PDG** | Paradigma WBC (igual a `paradigma.ts`) | `GET <base>/portal/Mural.aspx` (cookie) → `POST <base>/portal/WebService/Servicos.asmx/PesquisarProcessos` (mesmo corpo do `paradigma.ts`, visão 999) | `nCdProcesso, sNrProcessoDisplay, sDsObjeto, tDtInicial, tDtFinal, sDsSituacao, sNmModalidade, sNmEmpresa` |
| **DRF** | "Portal de Licitações" padrão do Sistema Indústria (Django REST Framework) | `GET <host>/api/licitacoes/?status=A&current=1` → JSON paginado (30/pág., campo `next`) | `id, numero, ano, titulo, objeto, modalidade, data_abertura, status, empresas[{nome}], documentos[{descricao, arquivo:"/media/..", tipo}], criterios_julgamento` |
| **SNC** | Portal da Transparência nacional do Senac (Angular, API pública) | `GET https://transparencia.senac.br/service/api/licitacoes/regional/{uf}` (uf minúsculo; `dn` = Depto. Nacional) | `data[{modalidade, dataUltimaCarga, dadosModalidadeLicitacao[{id, numeroProcesso, objeto, situacao, dataAbertura, dataSituacao, linkPregaoEletronico, criterioDeJulgamento, documentos[]}]}]` |
| SPT | Transparência SESI-SP/SENAI-SP (ASP.NET MVC, HTML no servidor) | `GET /licitacoes/licitacoes-editais` | cartões "N. 712/2026 / modalidade / Entidade / Status / Objeto / Data de Abertura das Propostas" |
| HTML | Página própria, HTML no servidor | ver linha | ver linha |

## Tabela UF × entidade

SESI e SENAI usam o mesmo portal da federação em todas as UFs (normalmente junto com o IEL e a própria federação). A coluna "SESI/SENAI" vale para os dois, exceto onde indicado.
SENAC: **todos os DRs + DN** estão na API nacional SNC (ver ressalvas no fim).

| UF | SESI/SENAI — URL | Plat. | Formato | Coletável | Obs. | SENAC (SNC: abertos ≥ hoje / última carga) |
|---|---|---|---|---|---|---|
| AC | https://transparencia.fieac.org/editais_transparencia/ | HTML (PHP, mesmo visual do DRF, mas `/api` dá 404) | HTML no servidor, ISO-8859-1 | sim | "Edital Número 019/2026 / Abertura 13/10/2026 08:30" + PDFs | 0 / 14/10 — próprio: portal.ac.senac.br/licitacoes/editais |
| AL | https://licitacao.fiea.com.br | **DRF** | JSON | sim | 9 em andamento | 3 / 15/10 |
| AM | https://licitacoes.fieam.com.br | **DRF** | JSON | sim | 141 com status A (filtrar pela data) | 0 / **08/05 (carga parada)** — próprio: am.senac.br/licitacoes/ |
| AP | https://licitacao.sesisenaiap.org.br | **DRF** | JSON | sim | 16 | 1 / 09/10 |
| BA | https://compras.fieb.org.br | **PDG** | JSON (POST) | sim | 50+/pág.; SENAI CIMATEC aparece muito | 1 / 15/10 |
| CE | https://portaldecompras.sfiec.org.br | **PDG** | JSON (POST) | sim | FIEC+SESI+SENAI | 0 / 09/10 |
| DF | https://licitacoes.sistemafibra.org.br | **DRF** | JSON | sim | 31 | 2 / 09/10 (também no PNCP) |
| ES | https://portaldecompras.findes.org.br | **PDG** | JSON (POST) | sim | inclui CINDES/IEL — filtrar `sNmEmpresa` | 0 / 02/09 (também no PNCP) |
| GO | já coberto (`fiegParser.ts`) | — | HTML | sim | — | 0 / 16/09 |
| MA | https://www.fiema.org.br/editais/18/RCA+-+Disputa+Aberta (+ `/19` Disputa Fechada, `/6` Credenciamento) | HTML | HTML no servidor (cartões) | sim | tem reCAPTCHA só no formulário da página, a listagem é aberta; datas por extenso ("14 de setembro de 2026") | 0 / 26/08 |
| MG | https://compras.fiemg.com.br | **PDG** | JSON (POST) | sim | a raiz tem desafio do Cloudflare, mas `/portal/Mural.aspx` e o asmx respondem 200 | 3 / 15/10 |
| MS | https://compras.fiems.com.br | **PDG** | JSON (POST) | sim | — | 0 / 09/10 |
| MT | https://compras.sfiemt.ind.br | **PDG** | JSON (POST) | sim | — | 0 / 06/10 |
| PA | https://licitacao.senaipa.org.br (= licitacao.sesipa.org.br) | **DRF** | JSON | sim | 118 com status A | 2 / 15/10 |
| PB | https://licitacoes.fiepb.org.br | **DRF** | JSON | sim | 12 | 1 / 14/10 |
| PE | https://licitacoes.pe.senai.br | **DRF** | JSON | sim | 12; inclui "SISTEMA FIEPE" | 0 / **20/08 (carga parada)** — Senac PE está no PNCP (5 abertas) |
| PI | https://licitacao.fiepi.com.br | **DRF** | JSON | sim | 236 com status "Aberto/Em execução", até de 2023 → filtrar pela data; `data_abertura` vem em dd/mm/aaaa | 0 / 18/08 — próprio: licitacao.pi.senac.br |
| PR | https://portaldecompras.sistemafiep.org.br | provavelmente PDG | — | **não** | desafio "managed" do Cloudflare (403 `cf-mitigated: challenge`) na raiz, no Mural e no asmx | 1 / 08/10 (também no PNCP) |
| RJ | https://portaldecompras.firjan.com.br | **PDG** | JSON (POST) | sim | `sNmEmpresa` traz "CNPJ - SESI XXX" | 2 / 09/10 |
| RN | https://app.fiern.org.br/engine.php?class=LicitacaoDownloadView (iframe de fiern.org.br/processos-de-selecao/) | HTML (Adianti/PHP) | tabela HTML; precisa do cookie da sessão (abrir antes o `index.php?class=...`) | sim | colunas: ENTIDADE, MODALIDADE, PROCESSO, CHAMAMENTO, OBJETO, PUBLICADO EM, DATA ABERTURA, SITUAÇÃO | 0 / 08/10 — próprio: licitacoes.rn.senac.br |
| RO | https://licitacao.fiero.org.br | **DRF** | JSON | sim | 14 | 0 / **23/07 (carga parada)** |
| RR | SENAI: http://licitacoes.rr.senai.br:8000 | **DRF** (HTTP, porta 8000) | JSON | sim | só SENAI/RR. **SESI-RR**: só ODS/PDF anuais em transparencia.sesirr.org.br → **não** | 5 / 15/10 |
| RS | https://compras.sistemafiergs.org.br | **PDG** | JSON (POST) | sim | — | 7 / 15/10 — o Senac RS também está no PDG `egov.paradigmabs.com.br/sesc_senac_rs`, que o `paradigma.ts` já baixa e hoje descarta |
| SC | https://portaldecompras.fiesc.com.br | **PDG** | JSON (POST) | sim | — | 3 / 08/10 (também no PNCP) |
| SE | https://lsa.fies.org.br | **DRF** | JSON | sim | 12 | 1 / 13/10 |
| SP | SENAI: https://transparencia.sp.senai.br/licitacoes/licitacoes-editais · SESI: https://transparencia.sesisp.org.br/licitacoes/licitacoes-editais | SPT (o mesmo template nos dois) | HTML no servidor | sim | um parser para 2 unidades; o SENAI-SP também publica no PNCP (12 abertas) e o SESI-SP tem 3 | 2 / 15/10 |
| TO | http://licitacao.sesi-to.com.br (= licitacao.senai-to.com.br) | **DRF** | JSON | sim | 6 | 1 / 15/10 |
| DN | https://www.portaldaindustria.com.br/api/licitacoes/ (CNI/SESI-DN/SENAI-DN/IEL-NC) | **DRF** | JSON (precisa de `Accept-Encoding: gzip`) | sim | 41 | Senac DN: `regional/dn`, 3 |

robots.txt: nenhuma restrição encontrada (404 ou sem `Disallow`) em transparencia.senac.br, compras.fiemg.com.br, licitacao.fiea.com.br e licitacao.fiepi.com.br.

SEBRAE e SENAR não aparecem em nenhum desses portais. Vários SEBRAE (SP, PE, PR, RJ, MA, PA, CE) e SENAR (MS, PB) publicam no **PNCP** (busca `status=recebendo_proposta`), assim como os Senac PE, PR, ES, SC, DF, RN e PA, o SENAI-SP e o SESI-SP. O coletor PNCP do repositório já deve captar esses (nada em `src/` filtra o Sistema S).

## Agrupamento por plataforma (unidades cobertas por parser a escrever)

| # | Plataforma | Parsers novos | Unidades cobertas |
|---|---|---|---|
| 1 | **SNC — API nacional do Senac** | 1 | **28** (27 DRs + DN) |
| 2 | **DRF — Portal de Licitações do Sistema Indústria** | 1 | **12 federações + DN ≈ 24 unidades SESI/SENAI** (AL, AM, AP, DF, PA, PB, PE, PI, RO, RR-SENAI, SE, TO, DN) |
| 3 | **PDG — Paradigma** (reaproveitar `criarUnidadeParadigma`) | 0 (só configuração + filtro de entidade) | **9 federações = 18 unidades SESI/SENAI** (BA, CE, ES, MG, MS, MT, RJ, RS, SC) + Senac RS |
| 4 | SPT (SESI-SP/SENAI-SP) | 1 | 2 |
| 5 | HTML avulsos | 1 cada | AC, MA, RN (2 unidades cada) |
| — | Não coletáveis | — | PR (Cloudflare), SESI-RR (só planilhas anuais) |

Com 1 a 3 (2 parsers novos + configuração), a cobertura fica em 27/27 Senac e em SESI/SENAI de 22 das 27 UFs + DN (o GO já existe).

## Recomendação e amostras

### 1. Paradigma (reuso) — `criarUnidadeParadigma({uf, nome, base})`
Bases: `https://compras.fieb.org.br`, `https://portaldecompras.sfiec.org.br`, `https://portaldecompras.findes.org.br`, `https://compras.fiemg.com.br`, `https://compras.fiems.com.br`, `https://compras.sfiemt.ind.br`, `https://portaldecompras.firjan.com.br`, `https://compras.sistemafiergs.org.br`, `https://portaldecompras.fiesc.com.br`.
Ajustes: (a) `montarTender` hoje fixa `fonte: 'SESC_REGIONAL'` e o prefixo `SESC-` → parametrizar a fonte/prefixo; (b) trocar o filtro fixo "senac" por um predicado de entidade (por exemplo, separar SESI/SENAI/IEL/federação por `sNmEmpresa`). Uma unidade por federação, com `tender.unidade = sNmEmpresa`.
Exemplo real (FIEMG): `nCdProcesso 16063`, "SDE 2026004296 — Contratação de empresa para prestação de serviços de licenciamento do evento ENA…", início 15/10/2026, fim 19/10/2026, "Em andamento", empresa "SESI/DRMG - SEDE".

### 2. Senac nacional — `GET https://transparencia.senac.br/service/api/licitacoes/regional/{uf}`
Uma chamada por UF (~0,3 a 1,3 MB, traz o histórico todo e não tem paginação). "Atual" = `situacao` ∉ {Finalizada, Cancelada, Suspensa} **e** `dataAbertura` ≥ hoje (muitos itens antigos ficam em "Em processo"). `dataAbertura` vem com "Z", mas é hora local. O id estável é `id` (GUID). `linkPregaoEletronico` aponta para a plataforma da disputa (Portal de Compras Públicas, Licitanet, Compras.gov).
Ressalva: a API é alimentada por carga de cada DR (`dataUltimaCarga`). AM, RO, PE, PI, MA e ES estão atrasados semanas ou meses. Para esses, o PNCP ou o portal próprio complementa.
Exemplo real (Senac RS): `id 8f5218d8-…`, Pregão eletrônico 042/2026, "Contratação de empresa especializada em serviços de reforma em embarcação", abertura 23/10/2026 09:30, "Em processo".

### 3. DRF Sistema Indústria — `GET <host>/api/licitacoes/?status=A&current=1`
JSON `{count, next, previous, results[]}`, 30 por página, `next` absoluto (às vezes em http). `status=A` = em andamento. `data_abertura` vem em ISO (`2026-10-26`) ou em BR (`26/10/2026`, no PI), então o parser tem de aceitar os dois. Alguns hosts (PI, AM, PA) mantêm processos antigos como abertos → usar `ehLicitacaoAtual` com `aberturaAt`. A entidade fica em `empresas[].nome`. O edital é `host + documentos[].arquivo`. Pedir com `--compressed`/gzip (o portaldaindustria só devolve JSON assim).
Exemplo real (FIEA/AL): `id 2069`, nº 53/2026, "ENERGIA SOLAR FOTOVOLTAICA", RCA Disputa Fechada, abertura 26/10/2026, "Em andamento", empresa "SESI / SENAI - AL", edital `/media/CHAMAMENTO_P%C3%9ABLICO_SESI_SENAI_N%C2%BA_53-2026_-_ENERGIA_SOLAR_FOTOVOLTAICA.pdf`.
