-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'NO_DOCUMENTS');

-- CreateEnum
CREATE TYPE "FonteEnum" AS ENUM ('PNCP', 'COMPRASNET');

-- CreateEnum
CREATE TYPE "ModalidadeEnum" AS ENUM ('PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL', 'CONCORRENCIA', 'DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA', 'INEXIGIBILIDADE', 'CONVITE', 'TOMADA_DE_PRECOS', 'CONCURSO', 'CREDENCIAMENTO', 'DIALOGO_COMPETITIVO', 'OUTROS');

-- CreateEnum
CREATE TYPE "NotificationTypeEnum" AS ENUM ('EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "ParticipationStatusEnum" AS ENUM ('AVALIANDO', 'VOU_PARTICIPAR', 'NAO_VOU_PARTICIPAR', 'PARTICIPEI');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SituacaoEnum" AS ENUM ('ABERTA', 'ENCERRADA', 'SUSPENSA', 'CANCELADA', 'ANULADA', 'HOMOLOGADA', 'REVOGADA');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "company_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tipo" TEXT,
    "nome" TEXT NOT NULL,
    "data_emissao" TIMESTAMP(3),
    "data_validade" TIMESTAMP(3),
    "observacao" TEXT,
    "last_alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitored_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "catmat_codes" TEXT[],
    "catser_codes" TEXT[],
    "ufs" TEXT[],
    "valor_min" DECIMAL(65,30),
    "valor_max" DECIMAL(65,30),
    "modalidades" TEXT[],
    "orgaos" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "raio_km" INTEGER,
    "origem_municipio" TEXT,
    "origem_uf" CHAR(2),
    "origem_lat" DOUBLE PRECISION,
    "origem_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "uasg_codes" TEXT[],

    CONSTRAINT "monitored_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationTypeEnum" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_analyses" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "documento_nome" TEXT,
    "resultado" JSONB,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_checklists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_items" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "numero_item" INTEGER,
    "descricao" TEXT NOT NULL,
    "catmat_code" TEXT,
    "catser_code" TEXT,
    "unidade_medida" TEXT,
    "quantidade" DECIMAL(65,30),
    "valor_unitario" DECIMAL(65,30),
    "valor_total" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_matches" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "monitored_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "matched_keywords" TEXT[],
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_participation_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "status" "ParticipationStatusEnum" NOT NULL DEFAULT 'AVALIANDO',
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_participation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "fonte" "FonteEnum" NOT NULL,
    "fonte_id" TEXT NOT NULL,
    "modalidade" "ModalidadeEnum" NOT NULL,
    "situacao" "SituacaoEnum" NOT NULL DEFAULT 'ABERTA',
    "objeto" TEXT NOT NULL,
    "objeto_resumido" VARCHAR(500),
    "objeto_norm" TEXT,
    "objeto_resumido_norm" TEXT,
    "orgao_norm" TEXT,
    "municipio_norm" TEXT,
    "valor_estimado" DECIMAL(65,30),
    "uf" CHAR(2),
    "municipio" TEXT,
    "municipio_ibge" TEXT,
    "municipio_lat" DOUBLE PRECISION,
    "municipio_lng" DOUBLE PRECISION,
    "orgao" TEXT,
    "orgao_cnpj" VARCHAR(14),
    "unidade" TEXT,
    "abertura_at" TIMESTAMP(3),
    "encerramento_at" TIMESTAMP(3),
    "publicado_at" TIMESTAMP(3),
    "link_edital" TEXT,
    "numero_controle" TEXT,
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uasgs" (
    "codigo_uasg" TEXT NOT NULL,
    "nome_uasg" TEXT NOT NULL,
    "nome_uasg_norm" TEXT NOT NULL,
    "sigla_uf" CHAR(2),
    "municipio_nome" TEXT,
    "codigo_orgao" INTEGER,
    "nome_orgao" TEXT,
    "nome_orgao_norm" TEXT,
    "cnpj_orgao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uasgs_pkey" PRIMARY KEY ("codigo_uasg")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "access_expires_at" TIMESTAMP(3),
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_logs" (
    "id" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL,
    "fonte" "FonteEnum",
    "total_fetched" INTEGER,
    "total_new" INTEGER,
    "total_dupes" INTEGER,
    "error_msg" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_documents_tipo_idx" ON "company_documents"("tipo" ASC);

-- CreateIndex
CREATE INDEX "company_documents_user_id_idx" ON "company_documents"("user_id" ASC);

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tender_analyses_tender_id_key" ON "tender_analyses"("tender_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tender_checklists_user_id_tender_id_key" ON "tender_checklists"("user_id" ASC, "tender_id" ASC);

-- CreateIndex
CREATE INDEX "tender_items_catmat_code_idx" ON "tender_items"("catmat_code" ASC);

-- CreateIndex
CREATE INDEX "tender_items_tender_id_idx" ON "tender_items"("tender_id" ASC);

-- CreateIndex
CREATE INDEX "tender_matches_created_at_idx" ON "tender_matches"("created_at" ASC);

-- CreateIndex
CREATE INDEX "tender_matches_read_idx" ON "tender_matches"("read" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tender_matches_tender_id_monitored_item_id_key" ON "tender_matches"("tender_id" ASC, "monitored_item_id" ASC);

-- CreateIndex
CREATE INDEX "tender_matches_user_id_idx" ON "tender_matches"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tender_participation_plans_user_id_tender_id_key" ON "tender_participation_plans"("user_id" ASC, "tender_id" ASC);

-- CreateIndex
CREATE INDEX "tenders_abertura_at_idx" ON "tenders"("abertura_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tenders_fonte_id_key" ON "tenders"("fonte_id" ASC);

-- CreateIndex
CREATE INDEX "tenders_fonte_idx" ON "tenders"("fonte" ASC);

-- CreateIndex
CREATE INDEX "tenders_modalidade_idx" ON "tenders"("modalidade" ASC);

-- CreateIndex
CREATE INDEX "tenders_publicado_at_idx" ON "tenders"("publicado_at" ASC);

-- CreateIndex
CREATE INDEX "tenders_situacao_idx" ON "tenders"("situacao" ASC);

-- CreateIndex
CREATE INDEX "tenders_uf_idx" ON "tenders"("uf" ASC);

-- CreateIndex
CREATE INDEX "uasgs_nome_orgao_norm_idx" ON "uasgs"("nome_orgao_norm" ASC);

-- CreateIndex
CREATE INDEX "uasgs_nome_uasg_norm_idx" ON "uasgs"("nome_uasg_norm" ASC);

-- CreateIndex
CREATE INDEX "uasgs_sigla_uf_idx" ON "uasgs"("sigla_uf" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- CreateIndex
CREATE INDEX "worker_logs_created_at_idx" ON "worker_logs"("created_at" ASC);

-- CreateIndex
CREATE INDEX "worker_logs_status_idx" ON "worker_logs"("status" ASC);

-- CreateIndex
CREATE INDEX "worker_logs_worker_idx" ON "worker_logs"("worker" ASC);

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_items" ADD CONSTRAINT "monitored_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_checklists" ADD CONSTRAINT "tender_checklists_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_checklists" ADD CONSTRAINT "tender_checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_monitored_item_id_fkey" FOREIGN KEY ("monitored_item_id") REFERENCES "monitored_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_participation_plans" ADD CONSTRAINT "tender_participation_plans_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_participation_plans" ADD CONSTRAINT "tender_participation_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

