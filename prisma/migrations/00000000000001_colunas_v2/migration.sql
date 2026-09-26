-- Colunas introduzidas pela v2. Todas aditivas: nulas ou com default,
-- entao a v1 continua rodando normalmente depois desta migration.
-- Isto permite migrar o banco ANTES de fazer o deploy do codigo novo.

-- AlterEnum
ALTER TYPE "AnalysisStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "tender_items" ADD COLUMN     "descricao_norm" TEXT;

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "situacao_checked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "worker_logs" ADD COLUMN     "total_updated" INTEGER;

-- CreateIndex
CREATE INDEX "tenders_situacao_checked_at_idx" ON "tenders"("situacao_checked_at");

-- CreateIndex
CREATE INDEX "tenders_encerramento_at_idx" ON "tenders"("encerramento_at");

