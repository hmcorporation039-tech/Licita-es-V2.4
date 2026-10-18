CREATE TYPE "EstadoDaBusca" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'FALHOU');

ALTER TABLE "monitored_items"
  ADD COLUMN "busca_estado" "EstadoDaBusca",
  ADD COLUMN "busca_encontrados" INTEGER,
  ADD COLUMN "busca_removidos" INTEGER,
  ADD COLUMN "busca_limitada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "busca_concluida_em" TIMESTAMP(3);

CREATE INDEX "tender_matches_monitored_item_id_idx" ON "tender_matches"("monitored_item_id");
