-- Etapa 1a — parte 2/2. Só aplicar DEPOIS de rodar `npm run empresas:backfill`
-- contra o banco alvo (cria 1 Company por usuário existente e preenche
-- company_id em todo mundo). Rodar esta migration sem o backfill antes
-- falha com "column contains null values" — de propósito, é o que impede
-- travar a coluna com gente sem empresa ainda.

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "monitored_items" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "company_documents" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tender_checklists" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tender_participation_plans" ALTER COLUMN "company_id" SET NOT NULL;

-- DropIndex — o checklist/plano passa a ser um por (empresa, licitação),
-- compartilhado entre os membros da empresa, em vez de um por usuário.
DROP INDEX "tender_checklists_user_id_tender_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "tender_checklists_company_id_tender_id_key" ON "tender_checklists"("company_id", "tender_id");

-- DropIndex
DROP INDEX "tender_participation_plans_user_id_tender_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "tender_participation_plans_company_id_tender_id_key" ON "tender_participation_plans"("company_id", "tender_id");
