UPDATE "tenders"
SET "situacao" = 'ABERTA'
WHERE "fonte" = 'PNCP'
  AND "situacao" = 'HOMOLOGADA'
  AND "valor_homologado" IS NOT NULL
  AND ("valor_homologado" <= 0 OR "encerramento_at" > now());

UPDATE "tenders"
SET "valor_homologado" = NULL
WHERE "fonte" = 'PNCP'
  AND "valor_homologado" IS NOT NULL
  AND ("valor_homologado" <= 0 OR "encerramento_at" > now());
