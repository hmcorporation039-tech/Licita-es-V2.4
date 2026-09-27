-- Etapa 1b — parte 2/2. Só aplicar DEPOIS de rodar `npm run empresas:backfill`
-- (versão atualizada, que agora também preenche tender_matches.company_id a
-- partir do monitored_item dono do match).

-- AlterTable
ALTER TABLE "tender_matches" ALTER COLUMN "company_id" SET NOT NULL;
