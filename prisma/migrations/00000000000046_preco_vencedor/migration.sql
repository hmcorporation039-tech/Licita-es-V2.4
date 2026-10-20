ALTER TABLE "tender_items"
  ADD COLUMN IF NOT EXISTS "situacao_do_resultado" TEXT,
  ADD COLUMN IF NOT EXISTS "vencedor_ni" TEXT,
  ADD COLUMN IF NOT EXISTS "vencedor_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "vencedor_porte" TEXT,
  ADD COLUMN IF NOT EXISTS "valor_unitario_homologado" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "quantidade_homologada" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "valor_total_homologado" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "data_do_resultado" DATE,
  ADD COLUMN IF NOT EXISTS "fornecedores_registrados" INTEGER;

ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "resultado_conferido_em" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resultado_final" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "tenders_resultado_pendente_idx"
  ON "tenders" ("encerramento_at", "resultado_conferido_em")
  WHERE "fonte" = 'PNCP' AND "resultado_final" = false;
