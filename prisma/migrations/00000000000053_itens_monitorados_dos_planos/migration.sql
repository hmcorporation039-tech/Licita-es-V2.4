UPDATE "plans" SET "limits" = jsonb_set("limits", '{itensMonitorados}', '10'::jsonb) WHERE "code" = 'TESTE';
UPDATE "plans" SET "limits" = jsonb_set("limits", '{itensMonitorados}', '30'::jsonb) WHERE "code" = 'ESSENCIAL';
