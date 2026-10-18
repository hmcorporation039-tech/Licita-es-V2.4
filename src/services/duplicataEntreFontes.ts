import { FonteEnum, Prisma } from '@prisma/client'
import { NormalizedTender } from '../types'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import { whereLicitacaoAberta } from '../lib/licitacaoAberta'
import { SIMILARIDADE_MINIMA_PARA_ESCONDER_NO_MESMO_DIA, ehMesmaLicitacaoDoPncp, licitacaoDoPncpEquivalente, modalidadesEquivalentes, objetosCompativeis } from './queridoDiarioService'
import { chaveDoNumero, duplicataNoPncpTceCe, motivoDaDuplicidade, numerosDoTender } from './tceCeDuplicidade'
import { idDaLicitacaoTceCe } from './tceCeParser'

export const FONTES_QUE_REPETEM_O_PNCP: FonteEnum[] = ['QUERIDO_DIARIO', 'DIARIO_MUNICIPAL', 'TCE_CE']

const DIAS_DE_HISTORICO = 180
const DIA_MS = 86_400_000
const REGISTROS_POR_MUNICIPIO = 50
const ANO_NO_NUMERO = /(?:^|\D)(20\d{2})(?!\d)/

const REGISTRO_DE_OUTRA_FONTE = {
  id: true,
  fonte: true,
  fonteId: true,
  modalidade: true,
  objeto: true,
  uf: true,
  municipio: true,
  municipioIbge: true,
  orgao: true,
  aberturaAt: true,
  publicadoAt: true,
  numeroControle: true,
  rawJson: true,
  createdAt: true,
} satisfies Prisma.TenderSelect

export type RegistroDeOutraFonte = Prisma.TenderGetPayload<{ select: typeof REGISTRO_DE_OUTRA_FONTE }>

export interface LicitacaoDoPncpNoLocal {
  uf?: string | null
  municipio?: string | null
  municipioIbge?: string | null
}

function comoTender(registro: RegistroDeOutraFonte): NormalizedTender {
  return {
    fonte: registro.fonte,
    fonteId: registro.fonteId,
    modalidade: registro.modalidade,
    objeto: registro.objeto,
    uf: registro.uf ?? undefined,
    municipio: registro.municipio ?? undefined,
    municipioIbge: registro.municipioIbge ?? undefined,
    orgao: registro.orgao ?? undefined,
    aberturaAt: registro.aberturaAt ?? undefined,
    publicadoAt: registro.publicadoAt ?? undefined,
    numeroControle: registro.numeroControle ?? undefined,
    rawJson: registro.rawJson && typeof registro.rawJson === 'object' ? (registro.rawJson as Record<string, unknown>) : {},
  }
}

export async function licitacaoDoPncpDoRegistro(registro: RegistroDeOutraFonte, agora: Date = new Date()): Promise<string | null> {
  const tender = comoTender(registro)
  if (registro.fonte === 'TCE_CE') return (await duplicataNoPncpTceCe(tender, agora, registro.modalidade !== 'OUTROS'))?.id ?? null
  return licitacaoDoPncpEquivalente(tender, agora)
}

async function marcarComoDuplicata(id: string, original: string): Promise<boolean> {
  if (id === original) return false
  const { count } = await prisma.tender.updateMany({ where: { id, duplicataDe: null }, data: { duplicataDe: original } })
  return count > 0
}

function filtroDoLocal(local: LicitacaoDoPncpNoLocal): Prisma.TenderWhereInput[] {
  const filtros: Prisma.TenderWhereInput[] = []
  if (local.municipioIbge) filtros.push({ municipioIbge: local.municipioIbge })
  if (local.municipio) filtros.push({ municipioNorm: normalize(local.municipio) })
  return filtros
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' || typeof valor === 'number' ? String(valor) : null
}

export function ehRepeticaoDaLicitacaoDoPncp(registro: RegistroDeOutraFonte, pncp: NormalizedTender, similaridade: number): boolean {
  const raw = pncp.rawJson as { numeroCompra?: unknown; anoCompra?: unknown; processo?: unknown }
  const tender = comoTender(registro)
  const candidato = {
    aberturaAt: pncp.aberturaAt ?? null,
    encerramentoAt: pncp.encerramentoAt ?? null,
    similaridade,
    numeroCompra: textoOuNulo(raw.numeroCompra),
    anoCompra: textoOuNulo(raw.anoCompra),
  }
  if (registro.fonte === 'TCE_CE') {
    if (registro.modalidade !== 'OUTROS' && !modalidadesEquivalentes(registro.modalidade).includes(pncp.modalidade)) return false
    return motivoDaDuplicidade(tender, numerosDoTender(tender), { ...candidato, objeto: pncp.objeto, processo: textoOuNulo(raw.processo) }) !== null
  }
  return modalidadesEquivalentes(registro.modalidade).includes(pncp.modalidade) && ehMesmaLicitacaoDoPncp(tender, candidato, SIMILARIDADE_MINIMA_PARA_ESCONDER_NO_MESMO_DIA)
}

export async function esconderRepeticoesDaLicitacaoDoPncp(pncpId: string, pncp: NormalizedTender, agora: Date = new Date()): Promise<number> {
  const doLocal = filtroDoLocal(pncp)
  if (!pncp.uf || doLocal.length === 0) return 0
  const registros = await prisma.tender.findMany({
    where: {
      fonte: { in: FONTES_QUE_REPETEM_O_PNCP },
      duplicataDe: null,
      uf: pncp.uf,
      OR: doLocal,
      createdAt: { gte: new Date(agora.getTime() - DIAS_DE_HISTORICO * DIA_MS) },
    },
    select: REGISTRO_DE_OUTRA_FONTE,
    orderBy: { createdAt: 'desc' },
    take: REGISTROS_POR_MUNICIPIO,
  })
  if (registros.length === 0) return 0
  const similaridades = await prisma.$queryRaw<{ id: string; similaridade: number }[]>`
    SELECT id, similarity(coalesce(objeto_norm, ''), ${normalize(pncp.objeto)})::float8 AS similaridade
    FROM tenders
    WHERE id IN (${Prisma.join(registros.map((r) => r.id))})
  `
  const porId = new Map(similaridades.map((s) => [s.id, Number(s.similaridade)]))
  let escondidos = 0
  for (const registro of registros) {
    if (!ehRepeticaoDaLicitacaoDoPncp(registro, pncp, porId.get(registro.id) ?? 0)) continue
    if (await marcarComoDuplicata(registro.id, pncpId)) escondidos++
  }
  return escondidos
}

export async function revisarRepeticoesDoPncp(agora: Date = new Date()): Promise<Partial<Record<FonteEnum, number>>> {
  const registros = await prisma.tender.findMany({
    where: { AND: [whereLicitacaoAberta(agora), { fonte: { in: FONTES_QUE_REPETEM_O_PNCP } }] },
    select: REGISTRO_DE_OUTRA_FONTE,
    orderBy: { id: 'asc' },
  })
  const escondidos: Partial<Record<FonteEnum, number>> = {}
  for (const registro of registros) {
    const original = await licitacaoDoPncpDoRegistro(registro, agora)
    if (original && (await marcarComoDuplicata(registro.id, original))) escondidos[registro.fonte] = (escondidos[registro.fonte] ?? 0) + 1
  }
  return escondidos
}

export function anoDaLicitacaoTceCe(registro: Pick<RegistroDeOutraFonte, 'numeroControle' | 'publicadoAt'>): number | null {
  const noNumero = ANO_NO_NUMERO.exec(registro.numeroControle ?? '')
  if (noNumero) return Number(noNumero[1])
  return registro.publicadoAt ? new Date(registro.publicadoAt.getTime() - 3 * 3_600_000).getUTCFullYear() : null
}

export function chaveDaRepeticaoTceCe(registro: RegistroDeOutraFonte): string | null {
  const ano = anoDaLicitacaoTceCe(registro)
  const numero = chaveDoNumero(registro.numeroControle, ano)
  if (!registro.municipioIbge || ano === null || numero === null) return null
  return [registro.municipioIbge, normalize(registro.orgao ?? ''), registro.modalidade, numero, ano].join('|')
}

function recencia(registro: RegistroDeOutraFonte): number {
  return idDaLicitacaoTceCe(registro.fonteId) ?? 0
}

export function repeticoesDoTceCe(registros: RegistroDeOutraFonte[]): { id: string; original: string }[] {
  const porChave = new Map<string, RegistroDeOutraFonte[]>()
  for (const registro of registros) {
    const chave = chaveDaRepeticaoTceCe(registro)
    if (chave) porChave.set(chave, [...(porChave.get(chave) ?? []), registro])
  }
  const repeticoes: { id: string; original: string }[] = []
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue
    const ordenado = [...grupo].sort((a, b) => recencia(b) - recencia(a) || b.createdAt.getTime() - a.createdAt.getTime())
    const [maisRecente, ...anteriores] = ordenado
    for (const anterior of anteriores) {
      if (objetosCompativeis(anterior.objeto, maisRecente.objeto)) repeticoes.push({ id: anterior.id, original: maisRecente.id })
    }
  }
  return repeticoes
}

export async function esconderRepeticoesDoTceCe(): Promise<number> {
  const registros = await prisma.tender.findMany({ where: { fonte: 'TCE_CE', duplicataDe: null }, select: REGISTRO_DE_OUTRA_FONTE })
  let escondidos = 0
  for (const { id, original } of repeticoesDoTceCe(registros)) {
    if (await marcarComoDuplicata(id, original)) escondidos++
  }
  return escondidos
}
