import { NormalizedTender } from '../types'
import { SIMILARIDADE_QUE_DISPENSA_CONFIRMACAO, podeEsconderComoRepeticao } from '../lib/repeticaoDoPncp'
import { CandidatoDoPncpNoMunicipio, candidatosDoPncp } from './queridoDiarioService'
import { comparacaoDoNumeroTceCe, numerosDoTender } from './tceCeDuplicidade'

const CANDIDATOS_POR_CONSULTA = 300

export function repeticaoDoCandidatoTcePi(tender: NormalizedTender, candidatos: CandidatoDoPncpNoMunicipio[]): CandidatoDoPncpNoMunicipio | undefined {
  const numeros = numerosDoTender(tender)
  return candidatos.find((candidato) => podeEsconderComoRepeticao(tender, candidato, comparacaoDoNumeroTceCe(tender, numeros, candidato)))
}

export function gemeaDaPublicacaoNoPncp(tender: NormalizedTender, candidatos: CandidatoDoPncpNoMunicipio[]): CandidatoDoPncpNoMunicipio | undefined {
  const numeros = numerosDoTender(tender)
  return candidatos.find(
    (candidato) => Number(candidato.similaridade) >= SIMILARIDADE_QUE_DISPENSA_CONFIRMACAO && comparacaoDoNumeroTceCe(tender, numeros, candidato) !== 'diferente'
  )
}

export async function duplicataNoPncpTcePi(tender: NormalizedTender, agora: Date = new Date()): Promise<string | null> {
  const candidatos = await candidatosDoPncp(tender, agora, true, CANDIDATOS_POR_CONSULTA)
  return repeticaoDoCandidatoTcePi(tender, candidatos)?.id ?? null
}

export async function gemeaPublicadaNoPncpTcePi(tender: NormalizedTender, agora: Date = new Date()): Promise<string | null> {
  const candidatos = await candidatosDoPncp(tender, agora, false, CANDIDATOS_POR_CONSULTA)
  return gemeaDaPublicacaoNoPncp(tender, candidatos)?.id ?? null
}
