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

## PCA (Plano de Contratações Anual) — adiado
O endpoint de PCA exige códigos de classificação próprios e devolve poucos registros; precisa de decisão de produto antes de implementar.
