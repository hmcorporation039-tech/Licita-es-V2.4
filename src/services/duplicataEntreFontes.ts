import { FonteEnum, Prisma } from '@prisma/client'
import { NormalizedTender } from '../types'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import { whereLicitacaoAberta } from '../lib/licitacaoAberta'
import { ComparacaoDoNumero, NumeroDaCompraNoPncp, comparacaoDoNumeroDoAviso, modalidadeIncerta, numeroDoAviso, podeEsconderComoRepeticao } from '../lib/repeticaoDoPncp'
import { CandidatoDoPncpNoMunicipio, candidatosDoPncp, objetosCompativeis } from './queridoDiarioService'
import { objetoSemConteudo } from './queridoDiarioParser'
import { chaveDoNumero, comparacaoDoNumeroTceCe, numerosDoTender } from './tceCeDuplicidade'
import { idDaLicitacaoTceCe } from './tceCeParser'

export const FONTES_QUE_REPETEM_O_PNCP: FonteEnum[] = ['QUERIDO_DIARIO', 'DIARIO_MUNICIPAL', 'TCE_CE', 'TCE_PI', 'TCE_TO', 'TCE_RS']
export const FONTES_DE_DIARIO: FonteEnum[] = ['QUERIDO_DIARIO', 'DIARIO_MUNICIPAL']
export const MOTIVO_SEM_OBJETO = 'SEM_OBJETO'

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

export interface RevisaoDasRepeticoes {
  escondidos: Partial<Record<FonteEnum, number>>
  restaurados: Partial<Record<FonteEnum, number>>
  semObjeto: number
  comObjetoDeVolta: number
}

type OriginalDoPncp = CandidatoDoPncpNoMunicipio & { registroId: string }

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

function comparacaoDoNumeroDoRegistro(registro: RegistroDeOutraFonte, pncp: NumeroDaCompraNoPncp): ComparacaoDoNumero {
  if (registro.fonte !== 'TCE_CE' && registro.fonte !== 'TCE_PI' && registro.fonte !== 'TCE_TO' && registro.fonte !== 'TCE_RS') return comparacaoDoNumeroDoAviso(numeroDoAviso(registro.fonteId), pncp)
  const tender = comoTender(registro)
  return comparacaoDoNumeroTceCe(tender, numerosDoTender(tender), pncp)
}

export function ehRepeticaoDoCandidato(registro: RegistroDeOutraFonte, candidato: CandidatoDoPncpNoMunicipio): boolean {
  return podeEsconderComoRepeticao(registro, candidato, comparacaoDoNumeroDoRegistro(registro, candidato))
}

export async function licitacaoDoPncpDoRegistro(registro: RegistroDeOutraFonte, agora: Date = new Date()): Promise<string | null> {
  const modalidadeConhecida = !modalidadeIncerta(registro)
  const candidatos = await candidatosDoPncp(comoTender(registro), agora, modalidadeConhecida)
  return candidatos.find((candidato) => ehRepeticaoDoCandidato(registro, candidato))?.id ?? null
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
  return ehRepeticaoDoCandidato(registro, {
    id: '',
    modalidade: pncp.modalidade,
    orgao: pncp.orgao ?? null,
    objeto: pncp.objeto,
    aberturaAt: pncp.aberturaAt ?? null,
    encerramentoAt: pncp.encerramentoAt ?? null,
    similaridade,
    numeroCompra: textoOuNulo(raw.numeroCompra),
    anoCompra: textoOuNulo(raw.anoCompra),
    processo: textoOuNulo(raw.processo),
  })
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

function contar(contagem: Partial<Record<FonteEnum, number>>, fonte: FonteEnum): void {
  contagem[fonte] = (contagem[fonte] ?? 0) + 1
}

export async function restaurarRepeticoesQueNaoSeConfirmam(): Promise<Partial<Record<FonteEnum, number>>> {
  const originais = await prisma.$queryRaw<OriginalDoPncp[]>`
    SELECT d.id AS "registroId",
           p.id,
           p.modalidade::text AS modalidade,
           p.orgao,
           p.objeto,
           p.abertura_at AS "aberturaAt",
           p.encerramento_at AS "encerramentoAt",
           similarity(coalesce(p.objeto_norm, ''), coalesce(d.objeto_norm, ''))::float8 AS similaridade,
           p.raw_json->>'numeroCompra' AS "numeroCompra",
           p.raw_json->>'anoCompra' AS "anoCompra",
           p.raw_json->>'processo' AS processo
    FROM tenders d
    JOIN tenders p ON p.id = d.duplicata_de AND p.fonte = 'PNCP'
    WHERE d.fonte::text IN (${Prisma.join(FONTES_QUE_REPETEM_O_PNCP)})
  `
  if (originais.length === 0) return {}
  const registros = await prisma.tender.findMany({ where: { id: { in: originais.map((o) => o.registroId) } }, select: REGISTRO_DE_OUTRA_FONTE })
  const porId = new Map(registros.map((r) => [r.id, r]))
  const restaurados: Partial<Record<FonteEnum, number>> = {}
  for (const original of originais) {
    const registro = porId.get(original.registroId)
    if (!registro || ehRepeticaoDoCandidato(registro, original)) continue
    const { count } = await prisma.tender.updateMany({ where: { id: registro.id, duplicataDe: original.id }, data: { duplicataDe: null } })
    if (count > 0) contar(restaurados, registro.fonte)
  }
  return restaurados
}

async function marcarMotivo(ids: string[], de: string | null, para: string | null): Promise<number> {
  if (ids.length === 0) return 0
  const { count } = await prisma.tender.updateMany({ where: { id: { in: ids }, motivoOculta: de }, data: { motivoOculta: para } })
  return count
}

export async function revisarAvisosSemObjeto(agora: Date = new Date()): Promise<{ semObjeto: number; comObjetoDeVolta: number }> {
  const abertos = await prisma.tender.findMany({
    where: { AND: [whereLicitacaoAberta(agora), { fonte: { in: FONTES_DE_DIARIO } }] },
    select: { id: true, objeto: true },
  })
  const semObjeto = await marcarMotivo(abertos.filter((t) => objetoSemConteudo(t.objeto)).map((t) => t.id), null, MOTIVO_SEM_OBJETO)
  const ocultos = await prisma.tender.findMany({ where: { fonte: { in: FONTES_DE_DIARIO }, motivoOculta: MOTIVO_SEM_OBJETO }, select: { id: true, objeto: true } })
  const comObjetoDeVolta = await marcarMotivo(ocultos.filter((t) => !objetoSemConteudo(t.objeto)).map((t) => t.id), MOTIVO_SEM_OBJETO, null)
  return { semObjeto, comObjetoDeVolta }
}

export async function revisarRepeticoesDoPncp(agora: Date = new Date()): Promise<RevisaoDasRepeticoes> {
  const restaurados = await restaurarRepeticoesQueNaoSeConfirmam()
  const registros = await prisma.tender.findMany({
    where: { AND: [whereLicitacaoAberta(agora), { fonte: { in: FONTES_QUE_REPETEM_O_PNCP } }] },
    select: REGISTRO_DE_OUTRA_FONTE,
    orderBy: { id: 'asc' },
  })
  const escondidos: Partial<Record<FonteEnum, number>> = {}
  for (const registro of registros) {
    const original = await licitacaoDoPncpDoRegistro(registro, agora)
    if (original && (await marcarComoDuplicata(registro.id, original))) contar(escondidos, registro.fonte)
  }
  return { escondidos, restaurados, ...(await revisarAvisosSemObjeto(agora)) }
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
