-- Obras e ganhadores: contratos assinados do PNCP (quem ganhou, o quê, onde) e o
-- cadastro de nichos/região de cada empresa. Aditiva: só cria tabelas novas.

-- CreateTable
CREATE TABLE "contratos_publicos" (
    "id" TEXT NOT NULL,
    "compra_controle" TEXT,
    "orgao_cnpj" TEXT NOT NULL,
    "orgao_nome" TEXT NOT NULL,
    "uf" CHAR(2),
    "municipio" TEXT,
    "municipio_ibge" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "fornecedor_ni" TEXT NOT NULL,
    "fornecedor_nome" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objeto_norm" TEXT NOT NULL,
    "valor_global" DECIMAL(18,2) NOT NULL,
    "categoria" TEXT,
    "tipo" TEXT,
    "data_assinatura" DATE,
    "vigencia_fim" DATE,
    "publicado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_publicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coleta_de_contratos_dias" (
    "dia" DATE NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "gravados" INTEGER NOT NULL DEFAULT 0,
    "completa" BOOLEAN NOT NULL DEFAULT false,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coleta_de_contratos_dias_pkey" PRIMARY KEY ("dia")
);

-- CreateTable
CREATE TABLE "perfis_de_obras" (
    "company_id" TEXT NOT NULL,
    "raio_km" INTEGER DEFAULT 150,
    "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valor_minimo" DECIMAL(18,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_de_obras_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "nichos_de_obras" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "alvos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nichos_de_obras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_publicos_uf_data_assinatura_idx" ON "contratos_publicos"("uf", "data_assinatura");

-- CreateIndex
CREATE INDEX "contratos_publicos_data_assinatura_idx" ON "contratos_publicos"("data_assinatura");

-- CreateIndex
CREATE INDEX "contratos_publicos_fornecedor_ni_idx" ON "contratos_publicos"("fornecedor_ni");

-- CreateIndex
CREATE INDEX "nichos_de_obras_company_id_idx" ON "nichos_de_obras"("company_id");

-- AddForeignKey
ALTER TABLE "perfis_de_obras" ADD CONSTRAINT "perfis_de_obras_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nichos_de_obras" ADD CONSTRAINT "nichos_de_obras_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Busca por palavra no objeto do contrato (mesmo padrão das licitações).
CREATE INDEX "contratos_publicos_objeto_norm_trgm_idx" ON "contratos_publicos" USING gin ("objeto_norm" gin_trgm_ops);
