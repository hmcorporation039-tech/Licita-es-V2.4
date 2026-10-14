-- AlterTable
ALTER TABLE "companies" ADD COLUMN "responsavel_cpf" TEXT,
ADD COLUMN "responsavel_cargo" TEXT,
ADD COLUMN "dados_bancarios" TEXT;

-- CreateTable
CREATE TABLE "company_logos" (
    "company_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_logos_pkey" PRIMARY KEY ("company_id")
);

-- AddForeignKey
ALTER TABLE "company_logos" ADD CONSTRAINT "company_logos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
