-- Cache local do catálogo oficial (CATMAT/CATSER) para o autocomplete de
-- códigos no cadastro de item monitorado. Aditivo puro: tabela e tipo novos.
-- Ver prisma/schema.prisma (model CatalogItem) e scripts/importCatalogo.ts.

-- CreateEnum
CREATE TYPE "CatalogoTipo" AS ENUM ('MATERIAL', 'SERVICO');

-- CreateTable
CREATE TABLE "catalog_items" (
  "tipo" "CatalogoTipo" NOT NULL,
  "codigo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "descricao_norm" TEXT NOT NULL,
  "grupo" TEXT,
  "classe" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("tipo", "codigo")
);

-- CreateIndex
CREATE INDEX "catalog_items_tipo_idx" ON "catalog_items" ("tipo");

-- Busca por descrição usa LIKE '%termo%' — índice GIN de trigramas (a extensão
-- pg_trgm já foi criada na migration 00000000000002).
CREATE INDEX IF NOT EXISTS "catalog_items_descricao_norm_trgm_idx"
  ON "catalog_items" USING GIN ("descricao_norm" gin_trgm_ops);
