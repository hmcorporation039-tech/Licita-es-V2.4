-- CreateTable
CREATE TABLE "company_document_files" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_document_files_document_id_key" ON "company_document_files"("document_id");

-- CreateIndex
CREATE INDEX "company_document_files_company_id_idx" ON "company_document_files"("company_id");

-- AddForeignKey
ALTER TABLE "company_document_files" ADD CONSTRAINT "company_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "company_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_document_files" ADD CONSTRAINT "company_document_files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

