# DOM/SC — Diário Oficial dos Municípios de Santa Catarina

O DOM/SC é o diário oficial único dos municípios catarinenses, mantido pelo consórcio CIGA. Ele publica cerca de 3 mil atos por dia (prefeituras, câmaras, fundos, autarquias e consórcios).

## De onde a Bela lê
- O CIGA publica o diário como **dados abertos** em `dados.ciga.sc.gov.br` (CKAN). Há um conjunto de dados por mês (`domsc-publicacoes-de-MM-AAAA`) e um ZIP por faixa de horário ("Publicações de 09/11/2026 entre 16:00 e 23:59 (645)"). Os arquivos do dia saem de madrugada, por volta das 3h30.
- Cada ZIP traz um JSON (`autopublicacoes`) em que cada publicação já vem com `municipio`, `entidade`, `categoria`, `titulo`, `link` e o `texto` extraído do PDF (HTML do Apache Tika).
- Não há raspagem de página nem busca no site: só `package_show` e o download dos ZIPs.

## Regras
- Categorias lidas: **Licitações**, **Edital** e **Chamadas Públicas**. Na categoria Licitações também saem homologações, resultados, respostas a esclarecimento e extratos: esses atos ficam de fora pelo título.
- O texto passa pelo mesmo parser dos diários (`queridoDiarioParser`), com o título como cabeçalho quando o texto não traz "AVISO DE LICITAÇÃO". PDF escaneado sai como texto ilegível: nesse caso só o título é lido.
- O município vem do campo `municipio` (consórcios trazem a cidade-sede). Agências intermunicipais sem cidade ficam de fora.
- O que já está no PNCP (regra estrita da FAMEM) ou no Querido Diário não é salvo de novo.
- Fonte `DIARIO_MUNICIPAL`, prefixo do identificador `DMSC-`.
- Janela de 4 dias; cada ZIP lido por inteiro vai para a memória no Redis (`dom-sc:arquivos-lidos`, 40 dias) e não é baixado de novo. No máximo 16 arquivos por coleta.
- Coleta às 6h25 e às 15h25 (horário de Brasília).

## Medição (09/11/2026, duas faixas de horário)
- 1.006 publicações → 144 candidatas → 133 avisos → 28 licitações com sessão futura ou em aberto (pregões de Jaraguá do Sul e São Carlos, dispensas com disputa de Balneário Camboriú e Seara, credenciamentos de Biguaçu e Itapiranga...).
