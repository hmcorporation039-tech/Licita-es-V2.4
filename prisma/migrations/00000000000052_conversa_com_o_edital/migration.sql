ALTER TABLE "tender_analyses" ADD COLUMN "conversa_status" TEXT;
ALTER TABLE "tender_analyses" ADD COLUMN "conversa_atualizada_em" TIMESTAMP(3);

CREATE TABLE "tender_document_texts" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "paginas" INTEGER NOT NULL DEFAULT 0,
    "escaneado" BOOLEAN NOT NULL DEFAULT false,
    "texto" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_document_texts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tender_document_texts_tender_id_ordem_key" ON "tender_document_texts"("tender_id", "ordem");

ALTER TABLE "tender_document_texts" ADD CONSTRAINT "tender_document_texts_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "edital_perguntas" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "pergunta" TEXT NOT NULL,
    "resposta" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edital_perguntas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "edital_perguntas_tender_id_company_id_created_at_idx" ON "edital_perguntas"("tender_id", "company_id", "created_at");
CREATE INDEX "edital_perguntas_company_id_created_at_idx" ON "edital_perguntas"("company_id", "created_at");

ALTER TABLE "edital_perguntas" ADD CONSTRAINT "edital_perguntas_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "edital_perguntas" ADD CONSTRAINT "edital_perguntas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "edital_perguntas" ADD CONSTRAINT "edital_perguntas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "plans" SET "limits" = jsonb_set("limits", '{perguntasAoEditalMes}', '30'::jsonb) WHERE "code" = 'TESTE';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{perguntasAoEditalMes}', '150'::jsonb) WHERE "code" = 'ESSENCIAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{perguntasAoEditalMes}', '400'::jsonb) WHERE "code" = 'PROFISSIONAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{perguntasAoEditalMes}', '1500'::jsonb) WHERE "code" = 'EMPRESARIAL';
