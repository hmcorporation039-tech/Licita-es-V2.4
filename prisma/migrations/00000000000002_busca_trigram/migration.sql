-- Busca do feed de licitações usa `contains` (LIKE '%termo%') sobre as colunas
-- normalizadas. Índice B-tree não serve para LIKE com curinga à esquerda, então
-- toda busca era sequential scan na tabela inteira — casada com um COUNT(*)
-- sobre o mesmo predicado. Índice GIN com trigramas resolve os dois.
--
-- Se o papel do banco não tiver permissão para criar extensão, rode como
-- superusuário apenas a linha abaixo e depois reaplique a migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "tenders_objeto_norm_trgm_idx"
  ON "tenders" USING GIN ("objeto_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "tenders_objeto_resumido_norm_trgm_idx"
  ON "tenders" USING GIN ("objeto_resumido_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "tenders_orgao_norm_trgm_idx"
  ON "tenders" USING GIN ("orgao_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "tenders_municipio_norm_trgm_idx"
  ON "tenders" USING GIN ("municipio_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "tenders_numero_controle_trgm_idx"
  ON "tenders" USING GIN ("numero_controle" gin_trgm_ops);

-- Autocomplete de UASG (/api/uasg/search) tem o mesmo problema.
CREATE INDEX IF NOT EXISTS "uasgs_nome_uasg_norm_trgm_idx"
  ON "uasgs" USING GIN ("nome_uasg_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "uasgs_nome_orgao_norm_trgm_idx"
  ON "uasgs" USING GIN ("nome_orgao_norm" gin_trgm_ops);

-- Feed ordena por publicado_at dentro de um recorte de UF/situação.
CREATE INDEX IF NOT EXISTS "tenders_uf_publicado_at_idx"
  ON "tenders" ("uf", "publicado_at" DESC);

CREATE INDEX IF NOT EXISTS "tenders_situacao_publicado_at_idx"
  ON "tenders" ("situacao", "publicado_at" DESC);

-- O pré-filtro do rematch também procura a palavra-chave na descrição do item.
CREATE INDEX IF NOT EXISTS "tender_items_descricao_norm_trgm_idx"
  ON "tender_items" USING GIN ("descricao_norm" gin_trgm_ops);
