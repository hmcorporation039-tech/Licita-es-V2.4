// ============================================================
// scripts/tabelas.ts — Ordem das tabelas para exportar/importar.
//
// Fica num módulo próprio, sem nenhum efeito colateral, de propósito: quando
// esta lista vivia dentro do exportarDados.ts, importá-la no importador
// disparava o main() do exportador, que rodava contra o banco de DESTINO e
// sobrescrevia a pasta de backup. Um import inocente apagava a cópia dos dados.
// ============================================================

// Os mesmos nomes como estão no Postgres, na mesma ordem de dependência.
// Usado pelo importador do dump do Supabase, que fala SQL direto.
export const TABELAS_SQL = [
  'users',
  'uasgs',
  'monitored_items',
  'tenders',
  'tender_items',
  'tender_matches',
  'tender_checklists',
  'tender_participation_plans',
  'company_documents',
  'tender_analyses',
  'notifications',
  'worker_logs',
] as const

// A ordem importa: quem é referenciado vem antes de quem referencia.
export const TABELAS = [
  'user',
  'uasg',
  'monitoredItem',
  'tender',
  'tenderItem',
  'tenderMatch',
  'tenderChecklist',
  'tenderParticipationPlan',
  'companyDocument',
  'tenderAnalysis',
  'notification',
  'workerLog',
] as const
