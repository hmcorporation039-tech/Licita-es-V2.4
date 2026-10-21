import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { ResumoDasPlataformas, resumirPlataformas } from '../lib/plataformaDeOrigem'

export interface AlcanceDasLicitacoes extends ResumoDasPlataformas {
  orgaos: number
}

export async function alcanceDasLicitacoes(where: Prisma.TenderWhereInput): Promise<AlcanceDasLicitacoes> {
  const [porOrgao, porPlataforma] = await Promise.all([
    prisma.tender.groupBy({ by: ['orgaoCnpj'], where: { AND: [where, { orgaoCnpj: { not: null } }] } }),
    prisma.tender.groupBy({ by: ['plataformaDeOrigem'], where: { AND: [where, { plataformaDeOrigem: { not: null } }] }, _count: { _all: true } }),
  ])
  const orgaos = porOrgao.filter((g) => typeof g.orgaoCnpj === 'string' && g.orgaoCnpj.trim().length > 0).length
  return {
    orgaos,
    ...resumirPlataformas(porPlataforma.map((g) => ({ nome: g.plataformaDeOrigem, licitacoes: g._count._all }))),
  }
}
