-- Estrategista de Habilitação: análise dos documentos de um concorrente contra
-- as exigências do edital. O enum AnalysisStatus já existe (análise de edital).

CREATE TABLE "analises_de_concorrente" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "nome_concorrente" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "resultado" JSONB,
    "erro" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "analises_de_concorrente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analises_de_concorrente_company_id_tender_id_idx" ON "analises_de_concorrente"("company_id", "tender_id");

ALTER TABLE "analises_de_concorrente" ADD CONSTRAINT "analises_de_concorrente_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analises_de_concorrente" ADD CONSTRAINT "analises_de_concorrente_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analises_de_concorrente" ADD CONSTRAINT "analises_de_concorrente_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "concorrente_arquivos" (
    "id" TEXT NOT NULL,
    "analise_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "concorrente_arquivos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "concorrente_arquivos_analise_id_idx" ON "concorrente_arquivos"("analise_id");

ALTER TABLE "concorrente_arquivos" ADD CONSTRAINT "concorrente_arquivos_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "analises_de_concorrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
