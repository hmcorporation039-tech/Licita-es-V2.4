// ============================================================
// lib/participationPlanTemplate.ts — Monta a linha do tempo de uma
// licitação (marcos automáticos) a partir dos dados já coletados do
// Tender e, quando disponível, da análise por IA do edital (prazos de
// impugnação/esclarecimento, que o PNCP não expõe estruturado).
//
// Recalculado a cada consulta — não é persistido — pra sempre refletir
// o estado mais atual (ex: análise rodada depois do plano já existir).
// ============================================================

export interface PlanMilestone {
  id: string
  label: string
  date: string | null // ISO — null quando só temos texto descritivo (ex: prazo relativo)
  detalhe: string | null // texto complementar (ex: o prazo descritivo da análise)
  done: boolean
  custom: boolean
}

interface TenderDates {
  publicadoAt: Date | null
  encerramentoAt: Date | null
  aberturaAt: Date | null
}

interface AnalysisPrazos {
  prazoImpugnacao: string
  prazoEsclarecimento: string
}

export function buildAutoMilestones(tender: TenderDates, analysis: AnalysisPrazos | null): PlanMilestone[] {
  const milestones: PlanMilestone[] = []

  if (tender.publicadoAt) {
    milestones.push({
      id: 'publicacao',
      label: 'Publicação no PNCP',
      date: tender.publicadoAt.toISOString(),
      detalhe: null,
      done: true, // se está publicada, essa etapa já aconteceu
      custom: false,
    })
  }

  if (analysis) {
    milestones.push({
      id: 'esclarecimento',
      label: 'Prazo para pedir esclarecimentos',
      date: null,
      detalhe: analysis.prazoEsclarecimento,
      done: false,
      custom: false,
    })
    milestones.push({
      id: 'impugnacao',
      label: 'Prazo para impugnar o edital',
      date: null,
      detalhe: analysis.prazoImpugnacao,
      done: false,
      custom: false,
    })
  }

  if (tender.encerramentoAt) {
    milestones.push({
      id: 'fim-propostas',
      label: 'Fim do recebimento de propostas',
      date: tender.encerramentoAt.toISOString(),
      detalhe: null,
      done: false,
      custom: false,
    })
  }

  if (tender.aberturaAt) {
    milestones.push({
      id: 'abertura-disputa',
      label: 'Abertura da sessão / disputa',
      date: tender.aberturaAt.toISOString(),
      detalhe: null,
      done: false,
      custom: false,
    })
  }

  return milestones
}
