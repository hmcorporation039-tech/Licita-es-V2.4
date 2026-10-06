// ============================================================
// services/dossieDaLicitacao.ts — Junta, para o PDF do estudo, tudo o que já foi analisado sobre a
// licitação: condições lidas do edital, habilitação (o que o cofre da empresa já cobre e o que falta),
// matriz de exigências marcada pela empresa, alertas legais e riscos. Só leitura; sem IA nova.
// ============================================================

import { prisma } from './tenderService'
import { buildChecklistTemplate } from '../lib/checklistTemplate'
import { avaliarHabilitacao, ResultadoHabilitacao } from '../lib/habilitacao'
import { AlertaLegal, calcularAlertasLegais, lerValoresEmReais } from '../lib/alertasLegais'
import { lerDataTexto } from '../lib/diasUteis'
import { chaveDaExigencia, ExigenciaVerificada } from '../lib/matrizExigencias'
import type { EditalAnalysisResult, EditalAnalysisRisco } from './llm/types'

export interface ExigenciaDoDossie {
  texto: string
  categoria: string
  responsavel: string
  documento: string
  pagina: string
  atendida: boolean
  nota: string | null
  verificacao: string | null
}

export interface DossieDaLicitacao {
  analisada: boolean
  condicoes: { rotulo: string; valor: string }[]
  habilitacao: ResultadoHabilitacao
  exigencias: ExigenciaDoDossie[]
  exigenciasTecnicas: string[]
  riscos: EditalAnalysisRisco[]
  alertas: AlertaLegal[]
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function carregarDossie(companyId: string, tenderId: string): Promise<DossieDaLicitacao> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { aberturaAt: true, valorEstimado: true, analysis: { select: { status: true, resultado: true } } },
  })
  const analisada = tender?.analysis?.status === 'DONE' && tender.analysis.resultado != null
  const a = analisada ? (tender!.analysis!.resultado as unknown as Partial<EditalAnalysisResult>) : null

  const sessao = tender?.aberturaAt ?? (a ? lerDataTexto(a.dataSessao) : null)
  const docs = await prisma.companyDocument.findMany({ where: { companyId }, select: { id: true, nome: true, tipo: true, dataValidade: true } })
  const habilitacao = avaliarHabilitacao({
    checklist: buildChecklistTemplate(),
    documentos: docs,
    documentosExigidosIA: a ? (a.documentosExigidos ?? []) : null,
    sessao,
  })

  const progresso = await prisma.requirementProgress.findUnique({ where: { companyId_tenderId: { companyId, tenderId } } })
  const estado = (progresso?.state ?? {}) as unknown as Record<string, { atendida?: boolean; nota?: string | null }>
  const matriz = a && Array.isArray(a.matrizExigencias) ? (a.matrizExigencias as ExigenciaVerificada[]) : []
  const exigencias: ExigenciaDoDossie[] = matriz.map((e) => {
    const chave = chaveDaExigencia(e.texto)
    return {
      texto: e.texto,
      categoria: e.categoria,
      responsavel: e.responsavel,
      documento: e.documento,
      pagina: e.pagina,
      atendida: estado[chave]?.atendida === true,
      nota: estado[chave]?.nota ?? null,
      verificacao: e.verificacao?.status ?? null,
    }
  })

  const valorEstimado = tender?.valorEstimado != null ? Number(tender.valorEstimado) : (lerValoresEmReais(a?.valorEstimado ?? '')[0] ?? null)
  const alertas =
    a && typeof a.garantiaProposta === 'string'
      ? calcularAlertasLegais({
          garantiaProposta: a.garantiaProposta,
          garantiaContratual: a.garantiaContratual,
          patrimonioLiquidoMinimo: a.patrimonioLiquidoMinimo,
          visitaTecnica: a.visitaTecnica,
          valorEstimado,
        })
      : []

  const condicoes = a
    ? ([
        ['Resumo', texto(a.resumo)],
        ['Data da sessão', texto(a.dataSessao)],
        ['Critério de julgamento', texto(a.criterioJulgamento)],
        ['Registro de preços', texto(a.registroPrecos)],
        ['Adesão à ata', texto(a.adesaoAta)],
        ['Prazo de entrega/execução', texto(a.prazoEntrega)],
        ['Local', texto(a.local)],
        ['Pagamento', texto(a.pagamento)],
        ['Esclarecimentos até', texto(a.prazoEsclarecimento)],
        ['Impugnação até', texto(a.prazoImpugnacao)],
        ['Garantia da proposta', texto(a.garantiaProposta)],
        ['Garantia contratual', texto(a.garantiaContratual)],
        ['Patrimônio líquido mínimo', texto(a.patrimonioLiquidoMinimo)],
        ['Visita técnica', texto(a.visitaTecnica)],
      ] as [string, string][])
        .filter(([, v]) => v !== '')
        .map(([rotulo, valor]) => ({ rotulo, valor }))
    : []

  return {
    analisada,
    condicoes,
    habilitacao,
    exigencias,
    exigenciasTecnicas: a && Array.isArray(a.exigenciasTecnicas) ? a.exigenciasTecnicas.map(texto).filter(Boolean) : [],
    riscos: a && Array.isArray(a.riscos) ? a.riscos : [],
    alertas,
  }
}
