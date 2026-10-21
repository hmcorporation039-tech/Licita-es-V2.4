UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesIaMes}', '10'::jsonb) WHERE "code" = 'TESTE';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesIaMes}', '35'::jsonb) WHERE "code" = 'ESSENCIAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesIaMes}', '80'::jsonb) WHERE "code" = 'PROFISSIONAL';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{analisesIaMes}', '250'::jsonb) WHERE "code" = 'EMPRESARIAL';
