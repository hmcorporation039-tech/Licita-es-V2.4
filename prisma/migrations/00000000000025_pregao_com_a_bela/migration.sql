CREATE TYPE "CriterioDoLance" AS ENUM ('UNITARIO', 'TOTAL_DO_ITEM');

CREATE TYPE "ResultadoDoPregao" AS ENUM ('GANHOU', 'PERDEU', 'DESCLASSIFICADO', 'FRACASSADO');

CREATE TYPE "OrigemDoLance" AS ENUM ('MELHOR_LANCE', 'MEU_LANCE');

CREATE TABLE "pregao_acompanhamentos" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "decremento_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    "max_lances" INTEGER NOT NULL DEFAULT 2,
    "criterio" "CriterioDoLance" NOT NULL DEFAULT 'UNITARIO',
    "resultado" "ResultadoDoPregao",
    "valor_final" DECIMAL(16,2),
    "encerrado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pregao_acompanhamentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pregao_lances" (
    "id" TEXT NOT NULL,
    "acompanhamento_id" TEXT NOT NULL,
    "alvo" TEXT NOT NULL,
    "origem" "OrigemDoLance" NOT NULL,
    "valor" DECIMAL(16,2) NOT NULL,
    "margem_pct" DECIMAL(7,2),
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pregao_lances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pregao_acompanhamentos_company_id_tender_id_key" ON "pregao_acompanhamentos"("company_id", "tender_id");

CREATE INDEX "pregao_lances_acompanhamento_id_created_at_idx" ON "pregao_lances"("acompanhamento_id", "created_at");

ALTER TABLE "pregao_acompanhamentos" ADD CONSTRAINT "pregao_acompanhamentos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pregao_acompanhamentos" ADD CONSTRAINT "pregao_acompanhamentos_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pregao_lances" ADD CONSTRAINT "pregao_lances_acompanhamento_id_fkey" FOREIGN KEY ("acompanhamento_id") REFERENCES "pregao_acompanhamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
