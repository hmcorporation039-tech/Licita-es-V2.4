// ============================================================
// api/routes/dashboard.ts — Visão geral do usuário logado: itens
// monitorados, matches recentes, documentos vencendo, próximos prazos
// dos planos de participação em andamento.
// ============================================================

import { Router } from 'express'
import { prisma } from '../../services/tenderService'
import { buildAutoMilestones } from '../../lib/participationPlanTemplate'
import { asyncHandler } from '../asyncHandler'

export const dashboardRouter = Router()

const DOC_ALERT_DAYS = 15
const PRAZO_JANELA_DIAS = 14

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!

    const [itensAtivos, matchesNaoLidos, matchesTotal, ultimosMatches, documentos, planos] = await Promise.all([
      prisma.monitoredItem.count({ where: { userId, active: true } }),
      prisma.tenderMatch.count({ where: { userId, read: false } }),
      prisma.tenderMatch.count({ where: { userId } }),
      prisma.tenderMatch.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { tender: true, monitoredItem: { select: { name: true } } },
      }),
      prisma.companyDocument.findMany({ where: { userId, dataValidade: { not: null } } }),
      prisma.tenderParticipationPlan.findMany({
        where: { userId, status: { in: ['AVALIANDO', 'VOU_PARTICIPAR'] } },
        include: {
          tender: { select: { id: true, objeto: true, objetoResumido: true, publicadoAt: true, encerramentoAt: true, aberturaAt: true } },
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
    const proximosPrazos: { tenderId: string; tenderObjeto: string; label: string; date: string }[] = []

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
        const t = new Date(m.date).getTime()
        if (t >= now && t <= prazoCutoff) {
          proximosPrazos.push({
            tenderId: plano.tender.id,
            tenderObjeto: plano.tender.objetoResumido ?? plano.tender.objeto,
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

// Janelas usadas pra classificar a urgência de cada licitação escolhida no
// mapa — mesma lógica de "farol": vermelho pisca quando tá muito em cima da
// hora, amarelo quando ainda dá tempo mas já é prá se organizar, verde
// quando foi escolhida mas o prazo tá tranquilo (ou não tem data definida).
const MAPA_URGENTE_DIAS = 3
const MAPA_ANDAMENTO_DIAS = 15

dashboardRouter.get(
  '/mapa',
  asyncHandler(async (req, res) => {
    const userId = req.userId!

    const escolhidas = await prisma.tenderParticipationPlan.findMany({
      where: { userId, status: 'VOU_PARTICIPAR' },
      include: {
        tender: {
          select: {
            id: true,
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
    const DIA_MS = 24 * 60 * 60 * 1000

    type Urgencia = 'urgente' | 'andamento' | 'selecionada'
    const PRIORIDADE: Record<Urgencia, number> = { urgente: 3, andamento: 2, selecionada: 1 }

    const porUf = new Map<
      string,
      { uf: string; tenders: { id: string; municipio: string | null; orgao: string | null; objeto: string; diasRestantes: number | null; urgencia: Urgencia }[] }
    >()

    for (const plano of escolhidas) {
      const t = plano.tender
      if (!t.uf) continue // sem UF não dá pra sinalizar no mapa

      const diasRestantes = t.encerramentoAt ? Math.ceil((t.encerramentoAt.getTime() - now) / DIA_MS) : null

      let urgencia: Urgencia = 'selecionada'
      if (diasRestantes !== null && diasRestantes <= MAPA_URGENTE_DIAS) urgencia = 'urgente'
      else if (diasRestantes !== null && diasRestantes <= MAPA_ANDAMENTO_DIAS) urgencia = 'andamento'

      const uf = t.uf.toUpperCase()
      if (!porUf.has(uf)) porUf.set(uf, { uf, tenders: [] })
      porUf.get(uf)!.tenders.push({
        id: t.id,
        municipio: t.municipio,
        orgao: t.orgao,
        objeto: t.objetoResumido ?? t.objeto,
        diasRestantes,
        urgencia,
      })
    }

    const estados = Array.from(porUf.values()).map((g) => ({
      ...g,
      urgenciaPrioritaria: g.tenders.reduce<Urgencia>(
        (max, t) => (PRIORIDADE[t.urgencia] > PRIORIDADE[max] ? t.urgencia : max),
        'selecionada'
      ),
    }))

    res.json({ estados })
  })
)
