// ============================================================
// services/tenderService.ts — Persiste licitações no banco
// ============================================================

import { Prisma, PrismaClient } from '@prisma/client'
import { NormalizedTender, NormalizedTenderItem } from '../types'
import { normalize } from '../lib/geoService'
import {
  CampoMonitorado,
  camposAlterados,
  snapshotDeTender,
  tenderContentHash,
} from '../lib/tenderContentHash'

const prisma = new PrismaClient()

export interface SaveResult {
  isNew: boolean
  tenderId: string
  isDupe: boolean
  changed: boolean
  changedFields: CampoMonitorado[]
}

function dadosPersistidos(tender: NormalizedTender) {
  return {
    modalidade: tender.modalidade,
    objeto: tender.objeto,
    objetoResumido: tender.objetoResumido,
    objetoNorm: normalize(tender.objeto),
    objetoResumidoNorm: tender.objetoResumido ? normalize(tender.objetoResumido) : null,
    orgaoNorm: tender.orgao ? normalize(tender.orgao) : null,
    municipioNorm: tender.municipio ? normalize(tender.municipio) : null,
    valorEstimado: tender.valorEstimado,
    uf: tender.uf,
    municipio: tender.municipio,
    municipioIbge: tender.municipioIbge,
    municipioLat: tender.municipioLat,
    municipioLng: tender.municipioLng,
    orgao: tender.orgao,
    orgaoCnpj: tender.orgaoCnpj,
    unidade: tender.unidade,
    aberturaAt: tender.aberturaAt,
    encerramentoAt: tender.encerramentoAt,
    publicadoAt: tender.publicadoAt,
    linkEdital: tender.linkEdital,
    numeroControle: tender.numeroControle,
    rawJson: tender.rawJson as Prisma.InputJsonValue,
    contentHash: tenderContentHash(tender),
  }
}

// Salva a licitação nova ou atualiza a que já existe. Órgãos republicam
// licitação com frequência — prorrogam a data de encerramento, retificam o
// valor, trocam o link do edital — e antes disso o registro ficava para
// sempre com o conteúdo do momento da primeira coleta.
export async function saveTender(tender: NormalizedTender): Promise<SaveResult> {
  const existing = await prisma.tender.findUnique({
    where: { fonteId: tender.fonteId },
    select: {
      id: true,
      contentHash: true,
      modalidade: true,
      objeto: true,
      valorEstimado: true,
      uf: true,
      municipio: true,
      orgao: true,
      orgaoCnpj: true,
      unidade: true,
      aberturaAt: true,
      encerramentoAt: true,
      publicadoAt: true,
      linkEdital: true,
      numeroControle: true,
    },
  })

  if (existing) {
    const hashAtual = tenderContentHash(tender)
    if (existing.contentHash === hashAtual) {
      return { isNew: false, tenderId: existing.id, isDupe: true, changed: false, changedFields: [] }
    }

    const changedFields = camposAlterados(snapshotDeTender(existing), snapshotDeTender(tender))

    await prisma.tender.update({ where: { id: existing.id }, data: dadosPersistidos(tender) })

    return { isNew: false, tenderId: existing.id, isDupe: true, changed: true, changedFields }
  }

  const created = await prisma.$transaction(async (tx) => {
    const newTender = await tx.tender.create({
      data: {
        fonte: tender.fonte,
        fonteId: tender.fonteId,
        ...dadosPersistidos(tender),
      },
    })

    if (tender.items && tender.items.length > 0) {
      await tx.tenderItem.createMany({
        data: tender.items.map((item) => ({
          tenderId: newTender.id,
          numeroItem: item.numeroItem,
          descricao: item.descricao,
          descricaoNorm: normalize(item.descricao),
          catmatCode: item.catmatCode,
          catserCode: item.catserCode,
          unidadeMedida: item.unidadeMedida,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: item.valorTotal,
        })),
      })
    }

    return newTender
  })

  return { isNew: true, tenderId: created.id, isDupe: false, changed: false, changedFields: [] }
}

// Salva os itens de uma licitação já existente (busca sob demanda, feita
// quando o usuário abre o detalhe pela primeira vez) — não duplica se já
// tiver itens salvos.
export async function saveTenderItemsIfMissing(
  tenderId: string,
  items: NormalizedTenderItem[]
): Promise<void> {
  const existingCount = await prisma.tenderItem.count({ where: { tenderId } })
  if (existingCount > 0 || items.length === 0) return

  await prisma.tenderItem.createMany({
    data: items.map((item) => ({
      tenderId,
      numeroItem: item.numeroItem,
      descricao: item.descricao,
      descricaoNorm: normalize(item.descricao),
      catmatCode: item.catmatCode,
      catserCode: item.catserCode,
      unidadeMedida: item.unidadeMedida,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal,
    })),
  })
}

// Registra log de execução do worker
export async function saveWorkerLog(data: {
  worker: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'
  fonte?: 'PNCP' | 'COMPRASNET'
  totalFetched?: number
  totalNew?: number
  totalDupes?: number
  totalUpdated?: number
  errorMsg?: string
  startedAt: Date
  finishedAt?: Date
}) {
  return prisma.workerLog.create({ data })
}

export { prisma }
