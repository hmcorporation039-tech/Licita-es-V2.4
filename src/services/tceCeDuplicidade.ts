import { Prisma } from '@prisma/client'
import { NormalizedTender } from '../types'
import { normalize } from '../lib/geoService'
import { prisma } from './tenderService'
import { CandidatoDoPncp, ehMesmaLicitacaoDoPncp, modalidadesEquivalentes } from './queridoDiarioService'

const DIAS_DE_HISTORICO_DO_PNCP = 180
const DIA_MS = 86_400_000
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

export async function duplicidadeNoPncpTceCe(
  tender: NormalizedTender,
  agora: Date = new Date(),
  modalidadeConhecida = true
): Promise<MotivoDaDuplicidade | null> {
  if (!tender.uf || (!tender.municipioIbge && !tender.municipio)) return null
  const limite = new Date(agora.getTime() - DIAS_DE_HISTORICO_DO_PNCP * DIA_MS)
  const municipioNorm = tender.municipio ? normalize(tender.municipio) : null
  const filtroDaModalidade = modalidadeConhecida
    ? Prisma.sql`AND modalidade::text IN (${Prisma.join(modalidadesEquivalentes(tender.modalidade))})`
    : Prisma.empty
  const candidatos = await prisma.$queryRaw<CandidatoDoPncpNoCeara[]>`
    SELECT abertura_at AS "aberturaAt",
           encerramento_at AS "encerramentoAt",
           objeto,
           raw_json->>'numeroCompra' AS "numeroCompra",
           raw_json->>'processo' AS processo,
           similarity(coalesce(objeto_norm, ''), ${normalize(tender.objeto)})::float8 AS similaridade
    FROM tenders
    WHERE fonte = 'PNCP'
      AND uf = ${tender.uf}
      AND publicado_at >= ${limite}
      ${filtroDaModalidade}
      AND (municipio_ibge = ${tender.municipioIbge ?? null} OR municipio_norm = ${municipioNorm})
    ORDER BY similaridade DESC
    LIMIT ${CANDIDATOS_POR_CONSULTA}
  `
  const numeros = numerosDoTender(tender)
  for (const candidato of candidatos) {
    const motivo = motivoDaDuplicidade(tender, numeros, candidato)
    if (motivo) return motivo
  }
  return null
}
