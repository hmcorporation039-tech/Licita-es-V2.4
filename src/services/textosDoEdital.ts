import { prisma } from './tenderService'
import type { EditalDocumento } from './llm/types'
import { paginasDoTexto, type StatusDaConversa, type TextoDeDocumento } from '../lib/conversaComOEdital'

export const DIAS_DE_GUARDA_DEPOIS_DO_ENCERRAMENTO = 30
export const DIAS_DE_GUARDA_SEM_ENCERRAMENTO = 120

export async function marcarConversa(tenderId: string, status: StatusDaConversa, agora: Date = new Date()): Promise<void> {
  await prisma.tenderAnalysis.updateMany({ where: { tenderId }, data: { conversaStatus: status, conversaAtualizadaEm: agora } })
}

export async function guardarTextosDoEdital(tenderId: string, documentos: EditalDocumento[], agora: Date = new Date()): Promise<StatusDaConversa> {
  const linhas = documentos.map((d, ordem) =>
    d.tipo === 'texto'
      ? { tenderId, ordem, nome: d.nome, paginas: paginasDoTexto(d.texto), escaneado: false, texto: d.texto }
      : { tenderId, ordem, nome: d.nome, paginas: 0, escaneado: true, texto: '' }
  )
  const status: StatusDaConversa = linhas.some((l) => !l.escaneado && l.texto.trim() !== '') ? 'PRONTA' : 'SEM_TEXTO'
  await prisma.$transaction([
    prisma.tenderDocumentText.deleteMany({ where: { tenderId } }),
    prisma.tenderDocumentText.createMany({ data: linhas }),
    prisma.tenderAnalysis.updateMany({ where: { tenderId }, data: { conversaStatus: status, conversaAtualizadaEm: agora } }),
  ])
  return status
}

export async function carregarTextosDoEdital(tenderId: string): Promise<TextoDeDocumento[]> {
  return prisma.tenderDocumentText.findMany({
    where: { tenderId },
    orderBy: { ordem: 'asc' },
    select: { nome: true, paginas: true, escaneado: true, texto: true },
  })
}

export async function apagarTextosDeEditaisAntigos(agora: Date = new Date()): Promise<{ licitacoes: number }> {
  const dia = 24 * 60 * 60 * 1000
  const antigas = await prisma.tender.findMany({
    where: {
      textosDosDocumentos: { some: {} },
      OR: [
        { encerramentoAt: { lt: new Date(agora.getTime() - DIAS_DE_GUARDA_DEPOIS_DO_ENCERRAMENTO * dia) } },
        { encerramentoAt: null, createdAt: { lt: new Date(agora.getTime() - DIAS_DE_GUARDA_SEM_ENCERRAMENTO * dia) } },
      ],
    },
    select: { id: true },
    take: 1_000,
  })
  if (antigas.length === 0) return { licitacoes: 0 }
  const ids = antigas.map((t) => t.id)
  await prisma.$transaction([
    prisma.tenderDocumentText.deleteMany({ where: { tenderId: { in: ids } } }),
    prisma.tenderAnalysis.updateMany({ where: { tenderId: { in: ids } }, data: { conversaStatus: null, conversaAtualizadaEm: agora } }),
  ])
  return { licitacoes: ids.length }
}
