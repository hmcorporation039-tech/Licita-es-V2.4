-- Aditivo puro: duas colunas novas e nullable, nenhum dado existente é tocado.
-- valor_homologado é o sinal confiável de que uma dispensa/inexigibilidade do
-- PNCP já concluiu (situacaoCompraId fica parado em "Divulgada no PNCP" pra
-- essas mesmo depois de homologadas — ver situacaoUpdateService.ts). srp é o
-- flag de Registro de Preços, já vem pronto no payload do PNCP.

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN "valor_homologado" DECIMAL(65,30),
ADD COLUMN "srp" BOOLEAN;
