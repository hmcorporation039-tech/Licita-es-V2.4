import { NormalizedTender } from '../types'
import { normalize } from '../lib/geoService'
import { ComparacaoDoNumero, comparacaoDoDia, entidadeDoOrgao, modalidadesEquivalentes, numeracaoComparavel } from '../lib/repeticaoDoPncp'
import { prisma } from './tenderService'
import { CandidatoDoPncpNoMunicipio, candidatosDoPncp } from './queridoDiarioService'
import { comparacaoDoNumeroTceCe, duplicataNoPncpTceCe, numerosDoTender } from './tceCeDuplicidade'
import { MotivoDaDuplicidadeTceRs } from './tceRsColeta'

export const SIMILARIDADE_COM_NUMERO_E_DIA = 0.4
export const SIMILARIDADE_COM_NUMERO = 0.75
export const SIMILARIDADE_COM_DIA = 0.95

const CANDIDATOS_POR_CONSULTA = 50
const CAMARA_NO_NOME = /\b(?:camara|legislativo|vereadores)\b/

export interface DuplicataNoPncpTceRs {
  id: string
  motivo: MotivoDaDuplicidadeTceRs
}

export function controlePncpDoTender(tender: Pick<NormalizedTender, 'rawJson'>): string | null {
  const controle = (tender.rawJson as { controlePncp?: unknown }).controlePncp
  return typeof controle === 'string' && controle ? controle : null
}

function nomeDoOrgaoNaOrigem(tender: Pick<NormalizedTender, 'rawJson' | 'orgao'>): string {
  const daOrigem = (tender.rawJson as { nomeDoOrgaoNaOrigem?: unknown }).nomeDoOrgaoNaOrigem
  return typeof daOrigem === 'string' ? daOrigem : (tender.orgao ?? '')
}

export function entidadesCompativeisNoRs(tender: Pick<NormalizedTender, 'rawJson' | 'orgao' | 'municipio'>, orgaoNoPncp: string | null): boolean {
  const doPncp = normalize(orgaoNoPncp ?? '').replace(/[^a-z0-9]+/g, ' ')
  const camaraNoPncp = CAMARA_NO_NOME.test(doPncp)
  const daOrigem = nomeDoOrgaoNaOrigem(tender).toUpperCase()
  if (daOrigem.startsWith('CM DE ')) return camaraNoPncp
  if (daOrigem.startsWith('PM DE ')) return !camaraNoPncp && entidadeDoOrgao(orgaoNoPncp, tender.municipio)?.tipo !== 'estado'
  return !camaraNoPncp
}

export function mesmaLicitacaoNoRs(tender: NormalizedTender, numeros: Set<string>, candidato: CandidatoDoPncpNoMunicipio): 'numero' | 'sessao' | null {
  if (!modalidadesEquivalentes(tender.modalidade).includes(candidato.modalidade)) return null
  if (!entidadesCompativeisNoRs(tender, candidato.orgao)) return null
  const similaridade = Number(candidato.similaridade)
  const numero: ComparacaoDoNumero = numeracaoComparavel(tender.modalidade, candidato.modalidade) ? comparacaoDoNumeroTceCe(tender, numeros, candidato) : 'desconhecido'
  const dia = comparacaoDoDia(tender, candidato)
  if (numero === 'igual' && dia === 'igual' && similaridade >= SIMILARIDADE_COM_NUMERO_E_DIA) return 'numero'
  if (numero === 'igual' && similaridade >= SIMILARIDADE_COM_NUMERO) return 'numero'
  return numero === 'desconhecido' && dia === 'igual' && similaridade >= SIMILARIDADE_COM_DIA ? 'sessao' : null
}

export async function duplicataNoPncpTceRs(tender: NormalizedTender, agora: Date = new Date()): Promise<DuplicataNoPncpTceRs | null> {
  const controle = controlePncpDoTender(tender)
  if (controle) {
    const doPncp = await prisma.tender.findFirst({ where: { fonte: 'PNCP', fonteId: controle }, select: { id: true } })
    if (doPncp) return { id: doPncp.id, motivo: 'controle' }
  }
  const pelaRegraComum = await duplicataNoPncpTceCe(tender, agora, true)
  if (pelaRegraComum) return pelaRegraComum
  const numeros = numerosDoTender(tender)
  const candidatos = await candidatosDoPncp(tender, agora, true, CANDIDATOS_POR_CONSULTA)
  for (const candidato of candidatos) {
    const motivo = mesmaLicitacaoNoRs(tender, numeros, candidato)
    if (motivo) return { id: candidato.id, motivo }
  }
  return null
}

export async function duplicidadeNoPncpTceRs(tender: NormalizedTender, agora: Date = new Date()): Promise<MotivoDaDuplicidadeTceRs | null> {
  return (await duplicataNoPncpTceRs(tender, agora))?.motivo ?? null
}
