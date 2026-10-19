// ============================================================
// api/routes/dashboard.ts — Visão geral do usuário logado: itens
// monitorados, matches recentes, documentos vencendo, próximos prazos
// dos planos de participação em andamento.
// ============================================================

import { Router } from 'express'
import { prisma } from '../../services/tenderService'
import { buildAutoMilestones } from '../../lib/participationPlanTemplate'
import { asyncHandler } from '../asyncHandler'
import { whereDaLicitacaoNoFeed } from '../../lib/feedDeMatches'
import { TENDER_PUBLICO } from '../../lib/tenderPublico'
import { fimDoPrazoDaLicitacao, horaDeBrasilia } from '../../lib/dataDeBrasilia'
import { dataDaSessao } from '../../lib/dataDaSessao'
import { calcularPrazosDaSessao, lerDataTexto, type Dia } from '../../lib/diasUteis'
import { prazoNoMapa, urgenciaDoEstado, type UrgenciaNoMapa } from '../../lib/prazoNoMapa'

export const dashboardRouter = Router()

const DOC_ALERT_DAYS = 15
const PRAZO_JANELA_DIAS = 14
export const ROTULO_DO_LIMITE_DE_IMPUGNACAO = 'Limite para impugnar ou pedir esclarecimento'

function inicioDoDiaDeBrasilia(dia: Dia): Date {
  const [ano, mes, diaDoMes] = dia.split('-').map(Number)
  return horaDeBrasilia(ano, mes - 1, diaDoMes)
}

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!

    const [itensAtivos, buscasEmAndamento, matchesNaoLidos, matchesTotal, ultimosMatches, documentos, planos] = await Promise.all([
      prisma.monitoredItem.count({ where: { companyId, active: true } }),
      prisma.monitoredItem.count({ where: { companyId, buscaEstado: 'EM_ANDAMENTO' } }),
      prisma.tenderMatch.count({ where: { companyId, read: false, tender: whereDaLicitacaoNoFeed() } }),
      prisma.tenderMatch.count({ where: { companyId, tender: whereDaLicitacaoNoFeed() } }),
      prisma.tenderMatch.findMany({
        where: { companyId, tender: whereDaLicitacaoNoFeed() },
        orderBy: [{ dentroDeObraCompleta: 'asc' }, { createdAt: 'desc' }],
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
      if (plano.status === 'VOU_PARTICIPAR') {
        const sessao = dataDaSessao(plano.tender) ?? lerDataTexto((analysis?.resultado as { dataSessao?: string } | null | undefined)?.dataSessao)
        if (sessao) {
          const prazos = calcularPrazosDaSessao(sessao, new Date(now))
          const limite = inicioDoDiaDeBrasilia(prazos.limiteImpugnacao)
          if (!prazos.limitePassou && limite.getTime() <= prazoCutoff) {
            proximosPrazos.push({
              tenderId: plano.tender.id,
              tenderObjeto: plano.tender.objetoResumido ?? plano.tender.objeto,
              fonte: plano.tender.fonte,
              label: ROTULO_DO_LIMITE_DE_IMPUGNACAO,
              date: limite.toISOString(),
            })
          }
        }
      }
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
      buscasEmAndamento,
      matchesNaoLidos,
      matchesTotal,
      ultimosMatches,
      documentosVencendoEmBreve,
      proximosPrazos,
    })
  })
)

const UF_VALIDA = /^[A-Z]{2}$/
const LICITACOES_POR_ESTADO_NO_MAPA = 15

dashboardRouter.get(
  '/mapa/oportunidades',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!
    const matches = await prisma.tenderMatch.findMany({
      where: { companyId, tender: { AND: [whereDaLicitacaoNoFeed(), { uf: { not: null } }] } },
      select: { tenderId: true, tender: { select: { uf: true } } },
      distinct: ['tenderId'],
    })
    const porUf = new Map<string, number>()
    for (const m of matches) {
      const uf = m.tender.uf!.toUpperCase()
      porUf.set(uf, (porUf.get(uf) ?? 0) + 1)
    }
    res.json({ estados: Array.from(porUf, ([uf, total]) => ({ uf, total })).sort((a, b) => b.total - a.total) })
  })
)

dashboardRouter.get(
  '/mapa/oportunidades/:uf',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!
    const uf = String(req.params.uf).toUpperCase()
    if (!UF_VALIDA.test(uf)) {
      res.status(400).json({ error: 'UF inválida' })
      return
    }
    const where = { companyId, tender: { AND: [whereDaLicitacaoNoFeed(), { uf }] } }
    const [doEstado, matches] = await Promise.all([
      prisma.tenderMatch.findMany({ where, select: { tenderId: true }, distinct: ['tenderId'] }),
      prisma.tenderMatch.findMany({
        where,
        distinct: ['tenderId'],
        orderBy: [{ dentroDeObraCompleta: 'asc' }, { createdAt: 'desc' }],
        take: LICITACOES_POR_ESTADO_NO_MAPA,
        select: {
          tender: { select: { id: true, fonte: true, municipio: true, orgao: true, objeto: true, objetoResumido: true, encerramentoAt: true } },
        },
      }),
    ])
    const agora = Date.now()
    res.json({
      uf,
      total: doEstado.length,
      tenders: matches.map(({ tender: t }) => {
        const { horasRestantes, urgencia } = prazoNoMapa(t.encerramentoAt, t.fonte, agora)
        return { id: t.id, municipio: t.municipio, orgao: t.orgao, objeto: t.objetoResumido ?? t.objeto, horasRestantes, urgencia }
      }),
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
