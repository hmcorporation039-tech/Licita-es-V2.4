# Fase 3 — Radar de oportunidades (contratos vencendo e dossiê de concorrente)

Tela `/radar` (menu "Radar"), alimentada sob demanda pela API pública de consulta do PNCP. Não cria tabelas nem migrations.

## Contratos vencendo
`GET /api/radar/contratos-vencendo?cnpjOrgao=&dias=120&todos=0`
- Busca os contratos do órgão publicados nos últimos ~2 anos e mostra os que vencem entre hoje e hoje+`dias`.
- Por padrão mostra só os que casam com as palavras-chave dos itens monitorados da empresa ("no seu ramo"); `todos=1` mostra tudo.
- O órgão é escolhido pelo nome (tabela UASG) ou digitando o CNPJ.

## Dossiê de concorrente
`GET /api/radar/concorrente/:cnpj` — total de contratos e valor, principais órgãos, estados, categorias, últimos contratos e os que vencem em 90 dias (chance de disputar a renovação).

## Limites conhecidos (da API do PNCP)
- Período máximo de 365 dias por consulta (usamos 2 janelas); página de até 500 registros; teto de páginas por consulta (6 para órgão, 4 para fornecedor) — órgãos/fornecedores gigantes ficam parciais.
- Cache em memória de 15 min por consulta. PNCP fora do ar → erro 502 com mensagem clara.
- A API não filtra por data de vigência nem por palavra-chave; por isso o filtro "vencendo" e o "ramo" são feitos aqui.

## Perfilador
`GET /api/radar/perfil` — usa o CNPJ da empresa para ler os contratos dela no PNCP (busca do portal, até 3.000 mais recentes) e sugerir palavras-chave (termos frequentes, sem genéricos), estados, órgãos e faixa de valor (P10–P90). A tela cria o item monitorado com um clique.

## PCA (Plano de Contratações Anual) — adiado
O endpoint de PCA exige códigos de classificação próprios e devolve poucos registros; precisa de decisão de produto antes de implementar.

## Correção (04/10/2026): fornecedor
A API de consulta `/api/consulta/v1/contratos` **ignora** o parâmetro `niFornecedor` — devolvia os contratos de todo o
período, de qualquer empresa (o dossiê mostrava "F & L COMERCIO" para qualquer CNPJ). Dossiê e Perfilador agora usam a busca
do portal (`/api/search/?q=<cnpj>&tipos_documento=contrato`), que indexa `fornecedor_ni`, e só aceitam itens cujo
`fornecedor_ni` é o CNPJ pedido. A busca às vezes responde vazio: até 3 tentativas por página. O filtro por órgão
(`cnpjOrgao`) foi conferido e funciona; mesmo assim, itens de outro órgão são descartados.
