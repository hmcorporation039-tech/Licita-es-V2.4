-- Etapa 1a (fundação da "Empresa multi-usuário") — parte 1/2.
--
-- Tudo aqui é aditivo e nullable onde precisa ser: nenhuma tabela existente
-- perde dado, nenhum usuário perde acesso. company_id só vira NOT NULL na
-- migration seguinte (00000000000005_empresas_constraints), depois que
-- `npm run empresas:backfill` rodar e criar 1 Company por usuário existente.
--
-- Não roda `prisma migrate dev` neste projeto (ver MIGRACAO.md) — esta
-- migration foi escrita à mão, no mesmo padrão da 00000000000001_colunas_v2.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PESSOA_FISICA', 'PESSOA_JURIDICA');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tipo" "AccountType" NOT NULL DEFAULT 'PESSOA_FISICA',
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "cpf" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cpf_key" ON "companies"("cpf");

-- AlterTable — company_id nullable por enquanto (backfill vem antes da trava)
ALTER TABLE "users" ADD COLUMN "company_id" TEXT,
ADD COLUMN "company_role" "CompanyRole" NOT NULL DEFAULT 'OWNER';

-- AlterTable
ALTER TABLE "monitored_items" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "company_documents" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "tender_checklists" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "tender_participation_plans" ADD COLUMN "company_id" TEXT;

-- AddForeignKey (FK em coluna nullable é permitido — só não checa linhas NULL)
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_items" ADD CONSTRAINT "monitored_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_checklists" ADD CONSTRAINT "tender_checklists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_participation_plans" ADD CONSTRAINT "tender_participation_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "monitored_items_company_id_idx" ON "monitored_items"("company_id");

-- CreateIndex
CREATE INDEX "company_documents_company_id_idx" ON "company_documents"("company_id");
