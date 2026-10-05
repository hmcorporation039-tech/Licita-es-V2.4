-- Estudo de custos da licitação escolhida (Fase 4). Somente aditiva.

-- AlterTable: base da empresa (origem do deslocamento)
ALTER TABLE "companies" ADD COLUMN     "base_lat" DOUBLE PRECISION,
ADD COLUMN     "base_lng" DOUBLE PRECISION,
ADD COLUMN     "base_municipio" TEXT,
ADD COLUMN     "base_uf" CHAR(2);

-- CreateTable
CREATE TABLE "cost_studies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_studies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_studies_company_id_tender_id_key" ON "cost_studies"("company_id", "tender_id");

-- AddForeignKey
ALTER TABLE "cost_studies" ADD CONSTRAINT "cost_studies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_studies" ADD CONSTRAINT "cost_studies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_studies" ADD CONSTRAINT "cost_studies_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
