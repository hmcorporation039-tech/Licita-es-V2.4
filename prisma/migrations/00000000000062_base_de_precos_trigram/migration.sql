-- pg_trgm já existe (migration 2). Índice de trigramas para casar a descrição
-- dos itens do edital com a base de preços por similaridade (operador %).
CREATE INDEX "precos_base_descricao_norm_trgm_idx"
  ON "precos_base" USING GIN ("descricao_norm" gin_trgm_ops);
