-- Mensagens do chat do pregoeiro lidas pela extensão da Bela (monitor do chat).
-- Aditiva: só cria a tabela nova.
CREATE TABLE "pregao_mensagens" (
    "id" TEXT NOT NULL,
    "acompanhamento_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "autor" TEXT,
    "texto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "cita_a_empresa" BOOLEAN NOT NULL DEFAULT false,
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pregao_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pregao_mensagens_acompanhamento_id_chave_key" ON "pregao_mensagens"("acompanhamento_id", "chave");
CREATE INDEX "pregao_mensagens_acompanhamento_id_created_at_idx" ON "pregao_mensagens"("acompanhamento_id", "created_at");

ALTER TABLE "pregao_mensagens" ADD CONSTRAINT "pregao_mensagens_acompanhamento_id_fkey" FOREIGN KEY ("acompanhamento_id") REFERENCES "pregao_acompanhamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
