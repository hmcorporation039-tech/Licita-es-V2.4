ALTER TABLE "pregao_acompanhamentos" ADD COLUMN "robo_ativo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pregao_acompanhamentos" ADD COLUMN "intervalo_lances_seg" INTEGER NOT NULL DEFAULT 15;
