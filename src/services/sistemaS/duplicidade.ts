import { Prisma } from '@prisma/client'
import { ModalidadeEnum, NormalizedTender } from '../../types'
import { normalize } from '../../lib/geoService'
import { prisma } from '../tenderService'
import { CandidatoDoPncp, ehMesmaLicitacaoDoPncp, modalidadesEquivalentes } from '../queridoDiarioService'

const DIAS_DE_HISTORICO_DO_PNCP = 180
const DIA_MS = 86_400_000

type EntidadeNoPncp = 'SENAC' | 'SENAI' | 'SESI' | 'IEL'

const NOMES_NO_PNCP: Record<EntidadeNoPncp, string[]> = {
  SENAC: ['senac', 'aprendizagem comercial'],
  SENAI: ['senai', 'aprendizagem industrial'],
  SESI: ['sesi', 'servico social da industria'],
  IEL: ['euvaldo lodi'],
}

const MODALIDADES_PARA_PROCESSO_SEM_NOME_PUBLICO: ModalidadeEnum[] = ['OUTROS', 'CONCORRENCIA', 'PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL']

export interface CandidatoDoSistemaSNoPncp extends CandidatoDoPncp {
  uf: string | null
  modalidade: string
  orgaoNorm: string | null
  orgaoCnpj: string | null
}

export function entidadesDoOrgao(orgao: string | undefined): EntidadeNoPncp[] {
  const siglas = (orgao ?? '').toUpperCase().split('-')[0].split('/')
  return (Object.keys(NOMES_NO_PNCP) as EntidadeNoPncp[]).filter((e) => siglas.includes(e))
}

export function nomesDoOrgaoNoPncp(orgao: string | undefined): string[] {
  return entidadesDoOrgao(orgao).flatMap((e) => NOMES_NO_PNCP[e])
}

export function modalidadesComparaveisNoPncp(modalidade: ModalidadeEnum): ModalidadeEnum[] {
  return modalidade === 'OUTROS' ? MODALIDADES_PARA_PROCESSO_SEM_NOME_PUBLICO : modalidadesEquivalentes(modalidade)
}

export function raizDoCnpj(cnpj: string | null | undefined): string | null {
  const digitos = (cnpj ?? '').replace(/\D/g, '')
  return digitos.length === 14 ? digitos.slice(0, 8) : null
}

function mesmoOrgao(tender: Pick<NormalizedTender, 'orgao' | 'orgaoCnpj'>, candidato: CandidatoDoSistemaSNoPncp): boolean {
  const raiz = raizDoCnpj(tender.orgaoCnpj)
  if (raiz && raiz === raizDoCnpj(candidato.orgaoCnpj)) return true
  const orgaoNoPncp = candidato.orgaoNorm ?? ''
  return nomesDoOrgaoNoPncp(tender.orgao).some((nome) => new RegExp(`\\b${nome}\\b`).test(orgaoNoPncp))
}

export function ehMesmaLicitacaoDoSistemaS(
  tender: Pick<NormalizedTender, 'uf' | 'orgao' | 'orgaoCnpj' | 'modalidade' | 'aberturaAt'>,
  candidato: CandidatoDoSistemaSNoPncp
): boolean {
  if (!tender.uf || candidato.uf !== tender.uf) return false
  if (!modalidadesComparaveisNoPncp(tender.modalidade).includes(candidato.modalidade as ModalidadeEnum)) return false
  if (!mesmoOrgao(tender, candidato)) return false
  return ehMesmaLicitacaoDoPncp(tender, candidato)
}

export async function existeNoPncpSistemaS(tender: NormalizedTender, agora: Date = new Date()): Promise<boolean> {
  const nomes = nomesDoOrgaoNoPncp(tender.orgao)
  const raiz = raizDoCnpj(tender.orgaoCnpj)
  if (!tender.uf || (nomes.length === 0 && !raiz)) return false
  const limite = new Date(agora.getTime() - DIAS_DE_HISTORICO_DO_PNCP * DIA_MS)
  const padroes = nomes.length > 0 ? nomes.map((nome) => `%${nome}%`) : ['']
  const candidatos = await prisma.$queryRaw<CandidatoDoSistemaSNoPncp[]>`
    SELECT uf,
           modalidade::text AS modalidade,
           orgao_norm AS "orgaoNorm",
           orgao_cnpj AS "orgaoCnpj",
           abertura_at AS "aberturaAt",
           encerramento_at AS "encerramentoAt",
           similarity(coalesce(objeto_norm, ''), ${normalize(tender.objeto)})::float8 AS similaridade
    FROM tenders
    WHERE fonte = 'PNCP'
      AND uf = ${tender.uf}
      AND publicado_at >= ${limite}
      AND modalidade::text IN (${Prisma.join(modalidadesComparaveisNoPncp(tender.modalidade))})
      AND (left(coalesce(orgao_cnpj, ''), 8) = ${raiz ?? '-'} OR orgao_norm LIKE ANY (ARRAY[${Prisma.join(padroes)}]::text[]))
    ORDER BY similaridade DESC
    LIMIT 50
  `
  return candidatos.some((candidato) => ehMesmaLicitacaoDoSistemaS(tender, candidato))
}
