CREATE TABLE "portal_credenciais" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senha_cifrada" BYTEA NOT NULL,
    "chave_versao" INTEGER NOT NULL DEFAULT 1,
    "consentimento_em" TIMESTAMP(3),
    "consentimento_texto" TEXT,
    "ultimo_teste_em" TIMESTAMP(3),
    "ultimo_teste_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portal_credenciais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_credenciais_company_id_portal_key" ON "portal_credenciais"("company_id", "portal");

CREATE INDEX "portal_credenciais_company_id_idx" ON "portal_credenciais"("company_id");

ALTER TABLE "portal_credenciais" ADD CONSTRAINT "portal_credenciais_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
