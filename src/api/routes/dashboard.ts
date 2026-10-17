// ============================================================
// api/routes/dashboard.ts — Visão geral do usuário logado: itens
// monitorados, matches recentes, documentos vencendo, próximos prazos
// dos planos de participação em andamento.
// ============================================================

import { Router } from 'express'
import { prisma } from '../../services/tenderService'
import { buildAutoMilestones } from '../../lib/participationPlanTemplate'
import { asyncHandler } from '../asyncHandler'
import { whereLicitacaoAberta } from '../../lib/licitacaoAberta'
import { TENDER_PUBLICO } from '../../lib/tenderPublico'
import { fimDoPrazoDaLicitacao } from '../../lib/dataDeBrasilia'
import { prazoNoMapa, urgenciaDoEstado, type UrgenciaNoMapa } from '../../lib/prazoNoMapa'

export const dashboardRouter = Router()

const DOC_ALERT_DAYS = 15
const PRAZO_JANELA_DIAS = 14

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!

    const [itensAtivos, matchesNaoLidos, matchesTotal, ultimosMatches, documentos, planos] = await Promise.all([
      prisma.monitoredItem.count({ where: { companyId, active: true } }),
      prisma.tenderMatch.count({ where: { companyId, read: false, tender: whereLicitacaoAberta() } }),
      prisma.tenderMatch.count({ where: { companyId, tender: whereLicitacaoAberta() } }),
      prisma.tenderMatch.findMany({
        where: { companyId, tender: whereLicitacaoAberta() },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { tender: { select: TENDER_PUBLICO }, monitoredItem: { select: { name: true } } },
      }),
      prisma.companyDocument.findMany({ where: { companyId, dataValidade: { not: null } } }),
      prisma.tenderParticipationPlan.findMany({
        where: { companyId, status: { in: ['AVALIANDO', 'VOU_PARTICIPAR'] } },
        include: {
          tender: { select: { id: true, fonte: true, objeto: true, objetoResumido: true, publicadoAt: true, encerramentoAt: true, aberturaAt: true } },
        },
      }),
    ])

    const now = Date.now()
    const docAlertCutoff = now + DOC_ALERT_DAYS * 24 * 60 * 60 * 1000
    const documentosVencendoEmBreve = documentos
      .filter((d) => d.dataValidade && d.dataValidade.getTime() <= docAlertCutoff)
      .map((d) => ({ id: d.id, nome: d.nome, dataValidade: d.dataValidade }))
      .sort((a, b) => (a.dataValidade!.getTime() - b.dataValidade!.getTime()))

    const prazoCutoff = now + PRAZO_JANELA_DIAS * 24 * 60 * 60 * 1000
    const proximosPrazos: { tenderId: string; tenderObjeto: string; fonte: string; label: string; date: string }[] = []

    // Uma consulta para todas as análises, em vez de uma por plano dentro do laço.
    const analyses = await prisma.tenderAnalysis.findMany({
      where: { tenderId: { in: planos.map((p) => p.tenderId) }, status: 'DONE' },
    })
    const analysePorTender = new Map(analyses.map((a) => [a.tenderId, a]))

    for (const plano of planos) {
      const analysis = analysePorTender.get(plano.tenderId)
      const analysisPrazos =
        analysis?.resultado
          ? (analysis.resultado as unknown as { prazoImpugnacao: string; prazoEsclarecimento: string })
          : null
      const milestones = buildAutoMilestones(plano.tender, analysisPrazos)
      for (const m of milestones) {
        if (m.done || !m.date) continue
        const inicio = new Date(m.date)
        if (fimDoPrazoDaLicitacao(inicio, plano.tender.fonte).getTime() >= now && inicio.getTime() <= prazoCutoff) {
          proximosPrazos.push({
            tenderId: plano.tender.id,
            tenderObjeto: plano.tender.objetoResumido ?? plano.tender.objeto,
            fonte: plano.tender.fonte,
            label: m.label,
            date: m.date,
          })
        }
      }
    }
    proximosPrazos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    res.json({
      itensMonitoradosAtivos: itensAtivos,
      matchesNaoLidos,
      matchesTotal,
      ultimosMatches,
      documentosVencendoEmBreve,
      proximosPrazos,
    })
  })
)

dashboardRouter.get(
  '/mapa',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!

    const escolhidas = await prisma.tenderParticipationPlan.findMany({
      where: { companyId, status: 'VOU_PARTICIPAR' },
      include: {
        tender: {
          select: {
            id: true,
            fonte: true,
            uf: true,
            municipio: true,
            orgao: true,
            objeto: true,
            objetoResumido: true,
            encerramentoAt: true,
            situacao: true,
          },
        },
      },
    })

    const now = Date.now()

    const porUf = new Map<
      string,
      { uf: string; tenders: { id: string; municipio: string | null; orgao: string | null; objeto: string; horasRestantes: number | null; urgencia: UrgenciaNoMapa }[] }
    >()

    for (const plano of escolhidas) {
      const t = plano.tender
      if (!t.uf) continue // sem UF não dá pra sinalizar no mapa

      const { horasRestantes, urgencia } = prazoNoMapa(t.encerramentoAt, t.fonte, now)

      const uf = t.uf.toUpperCase()
      if (!porUf.has(uf)) porUf.set(uf, { uf, tenders: [] })
      porUf.get(uf)!.tenders.push({
        id: t.id,
        municipio: t.municipio,
        orgao: t.orgao,
        objeto: t.objetoResumido ?? t.objeto,
        horasRestantes,
        urgencia,
      })
    }

    const estados = Array.from(porUf.values()).map((g) => ({
      ...g,
      urgenciaPrioritaria: urgenciaDoEstado(g.tenders.map((t) => t.urgencia)),
    }))

    res.json({ estados })
  })
)
