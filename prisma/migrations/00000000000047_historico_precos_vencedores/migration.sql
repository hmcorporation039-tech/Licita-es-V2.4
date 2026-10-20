CREATE INDEX IF NOT EXISTS "tender_items_vencedor_catmat_idx"
  ON "tender_items" ("catmat_code")
  WHERE "valor_unitario_homologado" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tender_items_vencedor_catser_idx"
  ON "tender_items" ("catser_code")
  WHERE "valor_unitario_homologado" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tender_items_vencedor_descricao_trgm_idx"
  ON "tender_items" USING GIN ("descricao_norm" gin_trgm_ops)
  WITH (fastupdate = off)
  WHERE "valor_unitario_homologado" IS NOT NULL;
