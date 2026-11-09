-- Período de teste mais econômico (11/2026): o teste não gera análise NOVA de edital
-- (vê as que já estão prontas, que são compartilhadas e não custam nada) e tem menos
-- chamadas de IA. Continua ajustável pelo painel Admin → Planos → Teste.
UPDATE "plans"
SET "limits" = "limits"::jsonb
      || '{"analisesIaMes":0,"perguntasAoEditalMes":3,"mensagensDeSuporteMes":5,"analisesDeConcorrenteMes":1}'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'TESTE';
