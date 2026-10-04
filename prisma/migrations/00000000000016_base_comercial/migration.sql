-- Base comercial da 2.4: planos, medição de IA e trilha de auditoria.
-- Apenas aditiva (colunas com default e tabelas novas) — voltar o código para a
-- 2.3 com este banco continua funcionando.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "plan_code" TEXT NOT NULL DEFAULT 'TESTE',
ADD COLUMN "quota_overrides" JSONB;

-- CreateTable
CREATE TABLE "plans" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "limits" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price_monthly_cents" INTEGER,
    "price_yearly_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT,
    "company_id" TEXT,
    "user_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6),
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_email" TEXT,
    "company_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_company_id_created_at_idx" ON "ai_usage"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- Planos iniciais. Os limites são PONTO DE PARTIDA (null = ilimitado) e se
-- ajustam pelo painel admin sem nova migration. Sem preço até a cobrança existir.
INSERT INTO "plans" ("code", "name", "description", "limits", "sort_order", "updated_at") VALUES
  ('TESTE', 'Teste', 'Período de avaliação gratuito.', '{"itensMonitorados":3,"usuarios":1,"analisesIaMes":3}', 1, CURRENT_TIMESTAMP),
  ('ESSENCIAL', 'Essencial', 'Pessoa física e microempresa.', '{"itensMonitorados":10,"usuarios":1,"analisesIaMes":10}', 2, CURRENT_TIMESTAMP),
  ('PROFISSIONAL', 'Profissional', 'Empresa que licita com frequência.', '{"itensMonitorados":100,"usuarios":5,"analisesIaMes":40}', 3, CURRENT_TIMESTAMP),
  ('EMPRESARIAL', 'Empresarial', 'Consultorias e empresas maiores.', '{"itensMonitorados":null,"usuarios":null,"analisesIaMes":150}', 4, CURRENT_TIMESTAMP);
