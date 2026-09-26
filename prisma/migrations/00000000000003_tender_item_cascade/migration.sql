-- TenderItem era a única relação de Tender criada com ON DELETE RESTRICT;
-- TenderMatch, TenderChecklist, TenderParticipationPlan e TenderAnalysis já
-- nasceram com CASCADE. Como abrir o detalhe de uma licitação busca e grava
-- os itens dela (ver api/routes/tenders.ts), qualquer licitação que alguém
-- tenha aberto passava a ser indeletável — e a faxina de retenção morria
-- com violação de chave estrangeira ao topar com a primeira delas.

ALTER TABLE "tender_items" DROP CONSTRAINT "tender_items_tender_id_fkey";

ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "tenders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
