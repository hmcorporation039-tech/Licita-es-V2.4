ALTER TABLE "users"
    ADD COLUMN "totp_segredo" TEXT,
    ADD COLUMN "totp_segredo_novo" TEXT,
    ADD COLUMN "totp_ativado_em" TIMESTAMP(3),
    ADD COLUMN "totp_ultimo_passo" INTEGER,
    ADD COLUMN "totp_codigos_de_recuperacao" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
