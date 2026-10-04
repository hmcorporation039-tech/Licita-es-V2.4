-- Análise em dupla (um modelo analisa, outro revisa) e matriz de exigências.
-- Apenas aditiva.

-- AlterTable: a análise guarda o rascunho do analista e o relatório da revisão.
ALTER TABLE "tender_analyses" ADD COLUMN "rascunho" JSONB,
ADD COLUMN "revisao" JSONB,
ADD COLUMN "pipeline" TEXT;

-- AlterTable: cada chamada de IA diz a que etapa pertence (a cota conta só "analise").
ALTER TABLE "ai_usage" ADD COLUMN "etapa" TEXT NOT NULL DEFAULT 'analise';

-- CreateTable: o que cada empresa já atendeu da matriz de exigências de uma licitação.
CREATE TABLE "requirement_progress" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_progress_company_id_tender_id_key" ON "requirement_progress"("company_id", "tender_id");

-- AddForeignKey
ALTER TABLE "requirement_progress" ADD CONSTRAINT "requirement_progress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_progress" ADD CONSTRAINT "requirement_progress_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
