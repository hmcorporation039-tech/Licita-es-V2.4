ALTER TABLE "monitored_items" ADD COLUMN IF NOT EXISTS "palavras_de_exclusao" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "tender_matches" ADD COLUMN IF NOT EXISTS "dentro_de_obra_completa" BOOLEAN NOT NULL DEFAULT false;

WITH "licitacoes_de_obra" AS (
  SELECT
    t."id",
    regexp_replace(coalesce(t."objeto_norm", ''), 'mao de obra', ' ', 'g') AS "texto"
  FROM "tenders" t
  WHERE (t."encerramento_at" IS NULL OR t."encerramento_at" >= now() - INTERVAL '1 day')
    AND regexp_replace(coalesce(t."objeto_norm", ''), 'mao de obra', ' ', 'g') ~ '\m(obras?|construcao|construcoes|reforma|reformas|ampliacao|edificacao|edificacoes|engenharia)\M'
)
UPDATE "tender_matches" tm
SET "dentro_de_obra_completa" = true
FROM "licitacoes_de_obra" o
WHERE tm."tender_id" = o."id"
  AND tm."matched_by_code" = false
  AND NOT EXISTS (
    SELECT 1 FROM unnest(tm."matched_keywords") AS k
    WHERE lower(k) ~ '^(obras?|construcao|construção|reforma|reformas|ampliacao|ampliação|edificacao|edificação|engenharia)$'
  )
  AND (
    (
      (length(o."texto") - length(regexp_replace(o."texto", '[;,]', '', 'g'))) >= 6
      AND o."texto" ~ '\m(fundac|alvenaria|cobertura|hidrossanitari|impermeabiliza|revestimento|terraplenagem|drenagem|pavimentac|esquadria|estrutura|pintura|forro|piso)'
    )
    OR NOT EXISTS (
      SELECT 1 FROM unnest(tm."matched_keywords") AS k
      WHERE position(lower(translate(k, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')) IN o."texto") > 0
    )
  );
