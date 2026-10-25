CREATE TYPE "TipoDeCusto" AS ENUM ('MATERIAL', 'MAO_DE_OBRA', 'SERVICO');

CREATE TYPE "FonteDePreco" AS ENUM ('PROPRIA', 'REFERENCIA');

CREATE TABLE "precos_base" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "descricao_norm" TEXT NOT NULL,
    "unidade" TEXT,
    "tipo" "TipoDeCusto" NOT NULL DEFAULT 'MATERIAL',
    "custo_unitario" DECIMAL(14,2) NOT NULL,
    "fonte" "FonteDePreco" NOT NULL DEFAULT 'PROPRIA',
    "observacao" TEXT,
    "data_do_preco" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "precos_base_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "precos_base_company_id_idx" ON "precos_base"("company_id");

ALTER TABLE "precos_base" ADD CONSTRAINT "precos_base_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "precos_base" ADD CONSTRAINT "precos_base_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
