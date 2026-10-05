# Fase 4 — Estudo de custos da licitação escolhida

Em **Licitações escolhidas → Estudo de custos** (só para licitações marcadas "Vou participar").
Planos: disponível em todos. Migration `00000000000020_estudo_de_custos` (aditiva).

## O que faz
1. **Preços de mercado por item** (CATMAT/CATSER): o que órgãos públicos efetivamente pagaram, da API de Pesquisa de
   Preços do Compras.gov.br. Mínimo, mediana, máximo, nº de compras; filtro por Brasil/UF e período (6 a 36 meses);
   valores absurdos são descartados (critério de Tukey, só com 8+ compras). Cache de 30 min.
2. **Custos e preços do usuário** por item, impostos (%), margem desejada (%) e outros custos livres.
3. **Deslocamento**: da base da empresa (Empresa → Base de entregas) até o município da licitação. Distância em linha
   reta (IBGE) x 1,3, ida e volta, x viagens x R$/km + pedágio + hospedagem. O usuário pode informar os km à mão.
4. **Prazo**: prazo do edital (pré-preenchido do que a análise leu) contra preparo + transporte (500 km/dia);
   situação ok / apertado (folga até 2 dias) / inviável; datas de entrega e limite (corridos ou úteis).
5. **Resultado**: receita, custos, lucro ou prejuízo, margem, **preço mínimo** (global e por item, com rateio do
   deslocamento e outros custos) e cenários de lance (seus preços, valor estimado, mediana de mercado, preço mínimo).
6. **PDF** ("Baixar PDF — vou concorrer"): licitação, resultado, cenários, itens, mercado com data da consulta,
   deslocamento, prazo, avisos e ressalva de que é apoio à decisão.

## API (`/api/estudos`)
`GET /:tenderId` · `POST /:tenderId/calcular` (não grava) · `PUT /:tenderId` · `POST /:tenderId/precos` · `GET /:tenderId/pdf`.
Todas exigem que a empresa tenha marcado a licitação como "Vou participar" (senão 409). Um estudo por (empresa, licitação).
Grava-se só o que o usuário digitou; o resultado é recalculado sempre.

## Limites conhecidos
- Preço de mercado só para item com código CATMAT/CATSER; os demais, preço digitado.
- A API de preços às vezes traz valores errados dos órgãos; por isso a mediana (e o descarte de extremos).
- Distância é estimativa (linha reta x 1,3), não rota. Preço pago por outros não é o custo da empresa.
- Licitação sem itens detalhados (fora do PNCP) vira um item único com o objeto inteiro.
