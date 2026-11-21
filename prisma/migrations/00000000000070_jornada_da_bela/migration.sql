-- "Bela que acompanha" (11/2026): onde cada pessoa está no passo a passo guiado
-- pela Bela (convite, perguntas, busca, resultado). JSON pequeno, por usuário, para
-- continuar de onde parou em qualquer aparelho. Sem dado sensível: só a fase, o que
-- a empresa vende e os estados escolhidos.
ALTER TABLE "users" ADD COLUMN "jornada_da_bela" JSONB;
