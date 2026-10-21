CREATE TABLE "erros_do_sistema" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "codigo_de_rastreio" TEXT,
    "metodo" TEXT,
    "rota" TEXT,
    "status" INTEGER,
    "mensagem" TEXT NOT NULL,
    "pilha" TEXT,
    "tela" TEXT,
    "navegador" TEXT,
    "versao" TEXT,
    "user_id" TEXT,
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erros_do_sistema_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "erros_do_sistema_codigo_de_rastreio_idx" ON "erros_do_sistema"("codigo_de_rastreio");
CREATE INDEX "erros_do_sistema_user_id_created_at_idx" ON "erros_do_sistema"("user_id", "created_at");
CREATE INDEX "erros_do_sistema_created_at_idx" ON "erros_do_sistema"("created_at");

ALTER TABLE "erros_do_sistema" ADD CONSTRAINT "erros_do_sistema_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erros_do_sistema" ADD CONSTRAINT "erros_do_sistema_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chamados" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "origem" TEXT NOT NULL DEFAULT 'FORMULARIO',
    "assunto" TEXT NOT NULL,
    "relato" TEXT NOT NULL,
    "contexto" JSONB NOT NULL DEFAULT '{}',
    "diagnostico" JSONB,
    "diagnostico_status" TEXT,
    "diagnostico_em" TIMESTAMP(3),
    "resolvido_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chamados_numero_key" ON "chamados"("numero");
CREATE INDEX "chamados_company_id_created_at_idx" ON "chamados"("company_id", "created_at");
CREATE INDEX "chamados_status_created_at_idx" ON "chamados"("status", "created_at");

ALTER TABLE "chamados" ADD CONSTRAINT "chamados_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chamado_mensagens" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "user_id" TEXT,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chamado_mensagens_chamado_id_created_at_idx" ON "chamado_mensagens"("chamado_id", "created_at");

ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
