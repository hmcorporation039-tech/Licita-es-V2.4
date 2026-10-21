CREATE TABLE "cupons" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "percentual" INTEGER NOT NULL,
    "meses" INTEGER NOT NULL,
    "max_usos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "valido_ate" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cupons_percentual_check" CHECK ("percentual" BETWEEN 1 AND 90),
    CONSTRAINT "cupons_meses_check" CHECK ("meses" BETWEEN 1 AND 36)
);
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "ambiente" TEXT NOT NULL,
    "asaas_cliente_id" TEXT NOT NULL,
    "asaas_assinatura_id" TEXT,
    "valor_centavos" INTEGER NOT NULL,
    "valor_cheio_centavos" INTEGER NOT NULL,
    "cupom_id" TEXT,
    "desconto_ate" TIMESTAMP(3),
    "pago_ate" TIMESTAMP(3),
    "criada_por_user_id" TEXT,
    "cancelada_em" TIMESTAMP(3),
    "motivo_do_cancelamento" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinaturas_ciclo_check" CHECK ("ciclo" IN ('MENSAL', 'ANUAL')),
    CONSTRAINT "assinaturas_status_check" CHECK ("status" IN ('PENDENTE', 'ATIVA', 'ATRASADA', 'CANCELADA')),
    CONSTRAINT "assinaturas_ambiente_check" CHECK ("ambiente" IN ('sandbox', 'producao'))
);
CREATE UNIQUE INDEX "assinaturas_asaas_assinatura_id_key" ON "assinaturas"("asaas_assinatura_id");
CREATE UNIQUE INDEX "assinaturas_uma_vigente_por_empresa" ON "assinaturas"("company_id") WHERE "status" <> 'CANCELADA';
CREATE INDEX "assinaturas_company_id_created_at_idx" ON "assinaturas"("company_id", "created_at");
CREATE INDEX "assinaturas_status_idx" ON "assinaturas"("status");
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_cupom_id_fkey" FOREIGN KEY ("cupom_id") REFERENCES "cupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_criada_por_user_id_fkey" FOREIGN KEY ("criada_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "assinatura_id" TEXT NOT NULL,
    "asaas_cobranca_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "forma" TEXT,
    "valor_centavos" INTEGER NOT NULL,
    "valor_liquido_centavos" INTEGER,
    "vencimento" DATE NOT NULL,
    "pago_em" TIMESTAMP(3),
    "estornado_em" TIMESTAMP(3),
    "link_da_fatura" TEXT,
    "aviso_de_fatura_em" TIMESTAMP(3),
    "aviso_de_atraso_em" TIMESTAMP(3),
    "aviso_de_pagamento_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pagamentos_asaas_cobranca_id_key" ON "pagamentos"("asaas_cobranca_id");
CREATE INDEX "pagamentos_assinatura_id_vencimento_idx" ON "pagamentos"("assinatura_id", "vencimento");
CREATE INDEX "pagamentos_company_id_idx" ON "pagamentos"("company_id");
CREATE INDEX "pagamentos_pago_em_idx" ON "pagamentos"("pago_em");
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "eventos_de_cobranca" (
    "id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "asaas_cobranca_id" TEXT,
    "asaas_assinatura_id" TEXT,
    "processado_em" TIMESTAMP(3),
    "resultado" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_de_cobranca_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "eventos_de_cobranca_created_at_idx" ON "eventos_de_cobranca"("created_at");
