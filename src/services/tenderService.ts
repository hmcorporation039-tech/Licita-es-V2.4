// ============================================================
// services/tenderService.ts — Persiste licitações no banco
// ============================================================

import { Prisma, PrismaClient } from '@prisma/client'
import { NormalizedTender, NormalizedTenderItem } from '../types'
import { normalize } from '../lib/geoService'
import { fetchPNCPItens } from './pncpItemsService'
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

// Mapeia um item normalizado para as colunas de tender_items. Centralizado
// para os três pontos que gravam item (create, update sob demanda) ficarem
// sempre com o mesmo conjunto de campos.
function itemParaBanco(item: NormalizedTenderItem, tenderId: string) {
  return {
    tenderId,
    numeroItem: item.numeroItem,
    descricao: item.descricao,
    descricaoNorm: normalize(item.descricao),
    descricaoDetalhada: item.descricaoDetalhada,
    criterioJulgamento: item.criterioJulgamento,
    catmatCode: item.catmatCode,
    catserCode: item.catserCode,
    unidadeMedida: item.unidadeMedida,
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    valorTotal: item.valorTotal,
  }
}

// Situações "mortas" que a coleta pode marcar por conta própria, sem depender
// da varredura periódica. Numa RECOLETA só deixamos a coleta sobrescrever a
// situação para um desses estados — nunca revertê-la para ABERTA (o PNCP mantém
// situacaoCompraId=1 "Divulgada" mesmo depois de encerrada/homologada; quem
// detecta ENCERRADA/HOMOLOGADA é a varredura, e a recoleta não pode desfazer).
const SITUACOES_MORTAS_NA_COLETA: NonNullable<NormalizedTender['situacao']>[] = [
  'REVOGADA',
  'SUSPENSA',
  'ANULADA',
]

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
    valorHomologado: tender.valorHomologado,
    srp: tender.srp,
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
      valorHomologado: true,
      srp: true,
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

    // Na recoleta só propagamos a situação quando for um estado morto novo
    // (revogada/suspensa/anulada) — ver SITUACOES_MORTAS_NA_COLETA.
    const situacaoUpdate =
      tender.situacao && SITUACOES_MORTAS_NA_COLETA.includes(tender.situacao)
        ? { situacao: tender.situacao }
        : {}

    await prisma.tender.update({
      where: { id: existing.id },
      data: { ...dadosPersistidos(tender), ...situacaoUpdate },
    })

    return { isNew: false, tenderId: existing.id, isDupe: true, changed: true, changedFields }
  }

  const created = await prisma.$transaction(async (tx) => {
    const newTender = await tx.tender.create({
      data: {
        fonte: tender.fonte,
        fonteId: tender.fonteId,
        // Situação lida na coleta; sem valor, o banco aplica o default ABERTA.
        ...(tender.situacao ? { situacao: tender.situacao } : {}),
        ...dadosPersistidos(tender),
      },
    })

    if (tender.items && tender.items.length > 0) {
      await tx.tenderItem.createMany({
        data: tender.items.map((item) => itemParaBanco(item, newTender.id)),
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
    data: items.map((item) => itemParaBanco(item, tenderId)),
  })
}

// Garante que os itens de uma licitação PNCP estejam no banco, buscando-os sob
// demanda se ainda não existirem. Usado tanto ao abrir o detalhe quanto logo
// após um match (o "acompanhar compra" do fluxo), para o pool já vir com itens.
// Devolve true se buscou itens agora. Efeito colateral: não lança em rede
// (quem chama decide), mas propaga erro de rede para o try/catch do chamador.
export async function garantirItensPNCP(tender: {
  id: string
  fonte: string
  rawJson: unknown
}): Promise<boolean> {
  if (tender.fonte !== 'PNCP') return false
  const existentes = await prisma.tenderItem.count({ where: { tenderId: tender.id } })
  if (existentes > 0) return false

  const raw = (tender.rawJson ?? {}) as Record<string, unknown>
  const orgaoEntidade = raw.orgaoEntidade as Record<string, unknown> | undefined
  const cnpj = orgaoEntidade?.cnpj as string | undefined
  const ano = raw.anoCompra as number | undefined
  const sequencial = raw.sequencialCompra as number | undefined
  if (!cnpj || !ano || !sequencial) return false

  const itens = await fetchPNCPItens(cnpj, ano, sequencial)
  await saveTenderItemsIfMissing(tender.id, itens)
  return true
}

// Registra log de execução do worker
export async function saveWorkerLog(data: {
  worker: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'
  fonte?: NormalizedTender['fonte']
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
