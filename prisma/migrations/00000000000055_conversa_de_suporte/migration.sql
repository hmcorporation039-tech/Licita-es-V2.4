CREATE TABLE "mensagens_de_suporte" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "dados" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_de_suporte_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensagens_de_suporte_user_id_created_at_idx" ON "mensagens_de_suporte"("user_id", "created_at");
CREATE INDEX "mensagens_de_suporte_company_id_papel_created_at_idx" ON "mensagens_de_suporte"("company_id", "papel", "created_at");

ALTER TABLE "mensagens_de_suporte" ADD CONSTRAINT "mensagens_de_suporte_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagens_de_suporte" ADD CONSTRAINT "mensagens_de_suporte_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "plans" SET "limits" = jsonb_set("limits", '{mensagensDeSuporteMes}', '30'::jsonb) WHERE "code" = 'TESTE';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{mensagensDeSuporteMes}', '100'::jsonb) WHERE "code" = 'ESSENCIAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{mensagensDeSuporteMes}', '300'::jsonb) WHERE "code" = 'PROFISSIONAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{mensagensDeSuporteMes}', '1000'::jsonb) WHERE "code" = 'EMPRESARIAL';
