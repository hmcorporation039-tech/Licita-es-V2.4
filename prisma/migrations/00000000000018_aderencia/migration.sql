-- Nota de aderência: guarda se o match veio de código CATMAT/CATSER (o sinal mais
-- forte), que a nota ao vivo precisa para o critério "Objeto". Apenas aditiva.

-- AlterTable
ALTER TABLE "tender_matches" ADD COLUMN "matched_by_code" BOOLEAN NOT NULL DEFAULT false;

-- Antes desta migration o score era uma constante: 1 = código, 0.9 = palavra-chave.
UPDATE "tender_matches" SET "matched_by_code" = true WHERE "score" >= 1;
