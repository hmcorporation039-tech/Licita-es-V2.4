ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receber_resumo_diario" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receber_lembrete_de_prazo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receber_aviso_de_documento" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receber_aviso_de_alteracao" BOOLEAN NOT NULL DEFAULT true;
