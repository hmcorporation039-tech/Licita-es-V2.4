-- Etapa 1b — parte 1/2. Aditivo e nullable: nenhuma linha existente é
-- afetada, nenhum match some. company_id só vira NOT NULL na migration
-- seguinte, depois do backfill (ver scripts/empresasBackfill.ts).

-- AlterTable
ALTER TABLE "tender_matches" ADD COLUMN "company_id" TEXT;

-- AddForeignKey (FK em coluna nullable é permitido — só não checa linhas NULL)
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tender_matches_company_id_idx" ON "tender_matches"("company_id");
