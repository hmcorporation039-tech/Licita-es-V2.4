-- Prestadores da região: a empresa escolhe aparecer para quem ganhou obra perto dela.
ALTER TABLE "perfis_de_obras" ADD COLUMN "visivel_como_prestador" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "perfis_de_obras" ADD COLUMN "apresentacao" VARCHAR(400);
