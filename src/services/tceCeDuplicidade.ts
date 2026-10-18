import { NormalizedTender } from '../types'
import { normalize } from '../lib/geoService'
import { ComparacaoDoNumero, NumeroDaCompraNoPncp, conflitoComOPncp } from '../lib/repeticaoDoPncp'
import { CandidatoDoPncp, candidatosDoPncp, ehMesmaLicitacaoDoPncp } from './queridoDiarioService'

const SIMILARIDADE_MINIMA_COM_O_MESMO_NUMERO = 0.25
const SIMILARIDADE_QUE_DISPENSA_AS_PALAVRAS = 0.8
const PALAVRAS_EM_COMUM_PELO_OBJETO = 0.5
const PALAVRAS_EM_COMUM_PELO_NUMERO = 0.34
const CANDIDATOS_POR_CONSULTA = 300

const PALAVRAS_DE_PRAXE = new Set(
  (
    'para pela pelo pelos pelas como suas seus esta este estes estas deste desta destes destas mesmo demais conforme atender atendimento ' +
    'necessidade necessidades contratacao contratacoes contratar empresa empresas especializada especializadas especializado especializados ' +
    'prestacao prestar servico servicos registro registros preco precos futura futuras futuro futuros eventual eventuais aquisicao aquisicoes ' +
    'adquirir fornecimento secretaria secretarias municipio municipios municipal municipais prefeitura diversas diversos objeto visando ' +
    'objetivando destinado destinada destinados destinadas junto termo referencia edital anexo anexos unidade unidades administrativa ' +
    'administrativas fundo fundos pessoa juridica presente execucao lote lotes itens item tipo menor global ceara estado sede ' +
    'acordo especificacoes quantitativos constantes contidas forma parcelada'
  ).split(' ')
)

export type MotivoDaDuplicidade = 'objeto' | 'numero'

export interface CandidatoDoPncpNoCeara extends CandidatoDoPncp {
  objeto: string
  numeroCompra: string | null
  processo: string | null
}

export function palavrasDistintivas(objeto: string, municipio?: string | null): Set<string> {
  const doMunicipio = new Set(normalize(municipio ?? '').split(/[^a-z0-9]+/))
  return new Set(
    normalize(objeto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PALAVRAS_DE_PRAXE.has(p) && !doMunicipio.has(p))
  )
}

export function palavrasEmComum(a: Set<string>, b: Set<string>): number {
  const menor = Math.min(a.size, b.size)
  if (menor === 0) return 0
  let comuns = 0
  for (const palavra of a) if (b.has(palavra)) comuns++
  return comuns / menor
}

function anoDoTender(tender: Pick<NormalizedTender, 'aberturaAt' | 'publicadoAt'>): number | null {
  const referencia = tender.publicadoAt ?? tender.aberturaAt
  return referencia ? new Date(referencia.getTime() - 3 * 3_600_000).getUTCFullYear() : null
}

export function chaveDoNumero(texto: string | null | undefined, ano: number | null): string | null {
  const grupos = (texto ?? '').match(/\d+/g)
  if (!grupos) return null
  const anos = ano ? new Set([ano, ano % 100, ano - 1, (ano - 1) % 100]) : new Set<number>()
  const significativos = grupos
    .map((g) => ({ valor: Number(g), digitos: g.length }))
    .filter((g) => !(anos.has(g.valor) && (g.digitos === 4 || g.digitos === 2)))
    .map((g) => String(g.valor))
  return significativos.length > 0 ? significativos.join('.') : null
}

export function numerosDoTender(tender: NormalizedTender): Set<string> {
  const ano = anoDoTender(tender)
  const raw = tender.rawJson as { numero?: unknown; processoAdministrativo?: unknown }
  const textos = [tender.numeroControle, raw.numero, raw.processoAdministrativo].filter((t): t is string => typeof t === 'string')
  return new Set(textos.map((t) => chaveDoNumero(t, ano)).filter((c): c is string => c !== null))
}

function terminaCom(chave: string, final: string): boolean {
  const partes = chave.split('.')
  const doFinal = final.split('.')
  return doFinal.length <= partes.length && doFinal.every((parte, i) => partes[partes.length - doFinal.length + i] === parte)
}

export function comparacaoDoNumeroTceCe(
  tender: Pick<NormalizedTender, 'aberturaAt' | 'publicadoAt'>,
  numeros: Set<string>,
  candidato: NumeroDaCompraNoPncp
): ComparacaoDoNumero {
  const ano = anoDoTender(tender)
  const doPncp = [candidato.numeroCompra, candidato.processo].map((t) => chaveDoNumero(t, ano)).filter((c): c is string => c !== null)
  if (numeros.size === 0 || doPncp.length === 0) return 'desconhecido'
  if (doPncp.some((chave) => numeros.has(chave))) return 'igual'
  const doTce = [...numeros]
  return doPncp.some((chave) => doTce.some((numero) => terminaCom(numero, chave) || terminaCom(chave, numero))) ? 'desconhecido' : 'diferente'
}

export function motivoDaDuplicidade(
  tender: Pick<NormalizedTender, 'aberturaAt' | 'publicadoAt' | 'objeto' | 'municipio'>,
  numeros: Set<string>,
  candidato: CandidatoDoPncpNoCeara
): MotivoDaDuplicidade | null {
  const similaridade = Number(candidato.similaridade)
  if (similaridade >= SIMILARIDADE_QUE_DISPENSA_AS_PALAVRAS) return 'objeto'
  const emComum = palavrasEmComum(palavrasDistintivas(tender.objeto, tender.municipio), palavrasDistintivas(candidato.objeto, tender.municipio))
  if (emComum >= PALAVRAS_EM_COMUM_PELO_OBJETO && ehMesmaLicitacaoDoPncp(tender, candidato)) return 'objeto'
  if (numeros.size === 0 || similaridade < SIMILARIDADE_MINIMA_COM_O_MESMO_NUMERO || emComum < PALAVRAS_EM_COMUM_PELO_NUMERO) return null
  const ano = anoDoTender(tender)
  const doPncp = [candidato.numeroCompra, candidato.processo].map((t) => chaveDoNumero(t, ano))
  return doPncp.some((chave) => chave !== null && numeros.has(chave)) ? 'numero' : null
}

export interface DuplicataNoPncp {
  id: string
  motivo: MotivoDaDuplicidade
}

export async function duplicataNoPncpTceCe(
  tender: NormalizedTender,
  agora: Date = new Date(),
  modalidadeConhecida = true
): Promise<DuplicataNoPncp | null> {
  const candidatos = await candidatosDoPncp(tender, agora, modalidadeConhecida, CANDIDATOS_POR_CONSULTA)
  const numeros = numerosDoTender(tender)
  for (const candidato of candidatos) {
    if (conflitoComOPncp(tender, candidato, comparacaoDoNumeroTceCe(tender, numeros, candidato))) continue
    const motivo = motivoDaDuplicidade(tender, numeros, candidato)
    if (motivo) return { id: candidato.id, motivo }
  }
  return null
}

export async function duplicidadeNoPncpTceCe(
  tender: NormalizedTender,
  agora: Date = new Date(),
  modalidadeConhecida = true
): Promise<MotivoDaDuplicidade | null> {
  return (await duplicataNoPncpTceCe(tender, agora, modalidadeConhecida))?.motivo ?? null
}
