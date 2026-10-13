# Referências de design — Monitor de Licitações — 13/10/2026

Base para o redesign do `web/`. Protótipo com dados reais (lista + detalhe, nas duas cores):
https://claude.ai/artifact/558XZyHJeW1hyMz46QtrTR

## 1. Referências que valem para este tipo de sistema

| Referência | O que copiar | O que evitar |
|---|---|---|
| [IBM Carbon — data table](https://carbondesignsystem.com/components/data-table/style) e [status](https://carbondesignsystem.com/patterns/status-indicator-pattern/) | Alturas de linha documentadas (24/32/40/48/64 px); status combina cor + forma/ícone + texto; no máximo 5–6 indicadores por tela | O visual IBM inteiro, arejado demais para uso de horas |
| [GOV.UK — Tag](https://design-system.service.gov.uk/components/tag/) | Poucos status; o estado normal não leva tag; status como adjetivo; cor nunca é o único sinal | Tipografia de 19 px e cara de serviço ao cidadão |
| [USWDS — Table](https://designsystem.digital.gov/components/table/) | Cabeçalho fixo, `aria-sort`, números à direita com algarismos tabulares, variante compacta | Visual de site do governo americano |
| [Gov.br DS](https://www.gov.br/ds) | Vocabulário do PNCP e do Compras.gov.br (modalidade, situação) | Copiar o visual: confunde a ferramenta com um portal do governo |
| [Linear — redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) | Tema gerado de 3 variáveis; pouca cor de marca no chrome; sidebar alinhada; Cmd+K | Inter, dark mode padrão e roxo: é a "cara de SaaS de IA" |
| [GitHub Primer — tipografia](https://primer.style/foundations/typography) | Escala em rem com line-height no grid de 4 px; não usar cor como ênfase principal | — |
| Stripe Dashboard | Poucos KPIs no topo e tabela compacta embaixo; filtros sempre visíveis | O gradiente do site de marketing |
| [Bloomberg Terminal](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/) | Esconder a complexidade sem cortar dados; mudar aos poucos, preservando posições | Preto e laranja |
| [Matt Ström — UI Density](https://mattstromawn.com/writing/ui-density/) | Densidade de valor (valor por pixel e por segundo), não só espaçamento apertado | — |
| [GovSpend](https://govspend.com/govspend-platform/) | Ordenar por prazo, buscas salvas com alerta, exportação | Só referência de funcionalidade (a UI logada não é pública) |

## 2. Concorrentes brasileiros

| Produto | Visual observado (site público) | Leitura |
|---|---|---|
| ConLicitação | Verde vivo; produto como grade de cards com ícone verde | Datado, "menu de portal" |
| Siga Pregão | Landing escura, tiles de KPI coloridos | Template SaaS genérico de 2022–23 |
| Effecti | Marinho, creme e ciano; foto de banco de imagens | Corporativo genérico |
| Alerta Licitação | Bootstrap 3/AdminLTE, caixas de KPI coloridas | Antigo |

**Onde dá para se diferenciar:** ninguém usa o **prazo** como eixo da tela; todos usam cor saturada em blocos (o sóbrio e tipográfico se destaca); nenhum mostra a análise do edital como documento rastreável (item, página, trecho); nenhum tem lista densa com atalhos de teclado.

## 3. Padrões adotados no protótipo

| Tema | Decisão |
|---|---|
| Tipografia | IBM Plex Sans (400/500/600) + IBM Plex Mono para processo, CNPJ, datas e valores; `tabular-nums` em tudo |
| Escala | 11 (rótulo de grupo) · 12 (metadado) · 13 (célula) · 14 (corpo) · 18 (valor em destaque) · 20 (título da licitação) · 24 (título da página) |
| Neutros | Fundo `#F7F6F2`, superfície `#FFFFFF`, borda `#E4E2DC`, texto `#1A1C1F`, secundário `#5B5F66` (AA no branco) |
| Forma | Raio de 4 px (2 px em tags), borda de 1 px, sem sombra, sem gradiente |
| Tabela | Linha de 2 níveis com 56 px (objeto + órgão/local); cabeçalho de 36 px; sem zebra; valores à direita em mono |
| Status × prazo | Eixos separados. Situação = tag neutra com ponto. Urgência só no prazo: até 48 h em vermelho `#B42318`, até 7 dias em âmbar `#A15C07`, depois cinza. "OK" não tem cor |
| Contra o efeito árvore de natal | No máximo um elemento colorido por linha; a cor vai no texto e no ícone, nunca no fundo da linha; um aviso no topo resume ("36 propostas encerram em 24 h") |
| Navegação | Sidebar de 232 px com fundo neutro e grupos (Operação, Empresa, Ajuda); item ativo com fundo suave e barra de 2 px na cor de destaque |
| Ícones | Traço fino e inline com o texto; nunca dentro de círculo colorido |

## 4. Cor de destaque

| Par | Contraste |
|---|---|
| `#1F3A5F` sobre branco | 11,48:1 (AAA) |
| `#0F5C4D` sobre branco | 7,90:1 (AAA) |
| `#0F5C4D` × verde de "ok" `#15803D` | 1,58:1 (quase iguais) |

**Recomendação: azul-tinta `#1F3A5F`.** O produto vive de prazo e validade, então o verde precisa significar "em dia/válido". Com o destaque também verde, "ação" e "válido" se confundem, principalmente para daltônicos (deuteranopia). O verde também é a cor do ConLicitação e do Siga Pregão. O azul-tinta lembra documento, assinatura e jurídico sem copiar o azul do gov.br. O risco dele, parecer marinho corporativo (perto do Effecti), se resolve com tipografia, densidade e neutros quentes. O petróleo pode ficar como segunda cor de série em gráficos.
