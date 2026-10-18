import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { buildKeywordRegex, regexDaPalavraNoPostgres, termosDoPreFiltro, variantesDoOrgao } from '../lib/matching'
import { literalNoLike } from '../lib/buscaLiteral'

export const MAX_CANDIDATAS_DA_BUSCA_POR_TEXTO = 30_000

export function whereDoPreFiltroDeTexto(texto: string): Prisma.TenderWhereInput {
  return {
    OR: termosDoPreFiltro(texto).flatMap((termo) => [{ objetoNorm: { contains: literalNoLike(termo) } }, { objetoResumidoNorm: { contains: literalNoLike(termo) } }]),
  }
}

export function citaOTexto(regex: RegExp, licitacao: { objetoNorm: string | null; objetoResumidoNorm: string | null }): boolean {
  return (licitacao.objetoNorm !== null && regex.test(licitacao.objetoNorm)) || (licitacao.objetoResumidoNorm !== null && regex.test(licitacao.objetoResumidoNorm))
}

export interface IdsDaBuscaPorTexto {
  ids: string[]
  limitada: boolean
}

export const MAX_IDS_DA_BUSCA_NO_BANCO = 5_000

export async function idsQueCitamOTextoNoBanco(texto: string, limite: number = MAX_IDS_DA_BUSCA_NO_BANCO + 1): Promise<string[]> {
  const regex = regexDaPalavraNoPostgres(texto)
  if (!regex) return []
  const linhas = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM tenders WHERE objeto_norm ~ ${regex} OR objeto_resumido_norm ~ ${regex} LIMIT ${limite}`
  return linhas.map((linha) => linha.id)
}

export async function idsQueCitamOTexto(
  texto: string,
  where: Prisma.TenderWhereInput,
  orderBy: Prisma.TenderOrderByWithRelationInput[]
): Promise<IdsDaBuscaPorTexto> {
  const regex = buildKeywordRegex(texto)
  if (!regex) return { ids: [], limitada: false }
  const citam = await idsQueCitamOTextoNoBanco(texto)
  if (citam.length <= MAX_IDS_DA_BUSCA_NO_BANCO) {
    if (citam.length === 0) return { ids: [], limitada: false }
    const ordenadas = await prisma.tender.findMany({ where: { AND: [where, { id: { in: citam } }] }, orderBy, select: { id: true } })
    return { ids: ordenadas.map((t) => t.id), limitada: false }
  }
  const candidatas = await prisma.tender.findMany({
    where: { AND: [where, whereDoPreFiltroDeTexto(texto)] },
    orderBy,
    take: MAX_CANDIDATAS_DA_BUSCA_POR_TEXTO,
    select: { id: true, objetoNorm: true, objetoResumidoNorm: true },
  })
  return {
    ids: candidatas.filter((c) => citaOTexto(regex, c)).map((c) => c.id),
    limitada: candidatas.length === MAX_CANDIDATAS_DA_BUSCA_POR_TEXTO,
  }
}

export function whereDoOrgao(orgao: string): Prisma.TenderWhereInput {
  return { OR: variantesDoOrgao(orgao).map((variante) => ({ orgaoNorm: { contains: literalNoLike(variante) } })) }
}

const NUMERO_COM_ANO = /^0*(\d{1,6})\s*\/\s*(\d{4})$/
const TAMANHOS_DO_NUMERO_DA_COMPRA = [1, 2, 3, 4, 5, 6]

export function whereDoNumeroDoEdital(numero: string): Prisma.TenderWhereInput {
  const limpo = numero.trim()
  const condicoes: Prisma.TenderWhereInput[] = [
    { numeroControle: { contains: literalNoLike(limpo), mode: 'insensitive' } },
    { rawJson: { path: ['numeroCompra'], string_contains: limpo } },
    { rawJson: { path: ['processo'], string_contains: limpo } },
  ]
  const comAno = limpo.match(NUMERO_COM_ANO)
  if (comAno) {
    const [, sequencial, ano] = comAno
    const formas = [...new Set(TAMANHOS_DO_NUMERO_DA_COMPRA.filter((n) => n >= sequencial.length).map((n) => sequencial.padStart(n, '0')))]
    condicoes.push({
      AND: [{ OR: formas.map((forma) => ({ rawJson: { path: ['numeroCompra'], equals: forma } })) }, { rawJson: { path: ['anoCompra'], equals: Number(ano) } }],
    })
  }
  return { OR: condicoes }
}
