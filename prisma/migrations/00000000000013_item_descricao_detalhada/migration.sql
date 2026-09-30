-- Aditivo puro: colunas novas e nullable, nenhum dado existente é tocado.
-- Descrição detalhada (informacaoComplementar) e critério de julgamento do
-- item, vindos do PNCP — ver src/services/pncpItemsService.ts.

-- AlterTable
ALTER TABLE "tender_items" ADD COLUMN "descricao_detalhada" TEXT,
                           ADD COLUMN "criterio_julgamento" TEXT;
