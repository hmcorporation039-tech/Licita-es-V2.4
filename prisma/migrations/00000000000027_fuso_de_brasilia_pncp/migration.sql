UPDATE "tenders"
SET "abertura_at" = "abertura_at" + INTERVAL '3 hours',
    "encerramento_at" = "encerramento_at" + INTERVAL '3 hours',
    "publicado_at" = "publicado_at" + INTERVAL '3 hours'
WHERE "fonte" IN ('PNCP', 'COMPRASNET')
  AND "created_at" >= TIMESTAMP '2026-09-05 00:00:00';
