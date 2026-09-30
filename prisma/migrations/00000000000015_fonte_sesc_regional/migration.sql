-- Aditivo puro: novo valor de enum, nenhuma linha existente é tocada.
-- Departamentos Regionais do SESC (exceto GO, que já tem fonte própria).
-- Ver src/services/sescRegional/ e src/workers/coletorSescRegional.ts.

-- AlterEnum
ALTER TYPE "FonteEnum" ADD VALUE 'SESC_REGIONAL';
