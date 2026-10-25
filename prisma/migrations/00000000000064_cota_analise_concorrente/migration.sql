-- Cota mensal de análises de concorrente (Estrategista de Habilitação, Fatia 1b).
-- Só dados: acrescenta a chave analisesDeConcorrenteMes ao JSON de limites de
-- cada plano. Aditiva — plano sem a chave cai no padrão de lib/planos.ts.
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesDeConcorrenteMes}', '3'::jsonb) WHERE "code" = 'TESTE';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesDeConcorrenteMes}', '15'::jsonb) WHERE "code" = 'ESSENCIAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesDeConcorrenteMes}', '40'::jsonb) WHERE "code" = 'PROFISSIONAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesDeConcorrenteMes}', '150'::jsonb) WHERE "code" = 'EMPRESARIAL';
