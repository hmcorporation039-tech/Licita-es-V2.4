// ============================================================
// lib/matching.ts — Regras puras de casamento entre licitação e item
// monitorado. Sem Prisma e sem I/O de propósito: é aqui que mora a regra
// de negócio que precisa de teste isolado.
//
// Critério principal: a palavra-chave precisa aparecer LITERALMENTE no
// objeto da licitação (ou na descrição de algum item), ignorando
// maiúsculas/acentos e respeitando borda de palavra (para "cat6" não
// "achar" dentro de "cateterismo", por exemplo).
//
// Antes usávamos similaridade de trigramas (pg_trgm/word_similarity),
// mas isso mede sobreposição de fragmentos de 3 letras — não se a
// palavra realmente aparece no texto — e gerava muito falso positivo
// com palavras-chave curtas/técnicas (ex: "cat6" batendo com
// "cateterismo cardíaco", "medicamentos" batendo com "equipamento
// médico" por causa do sufixo "-mento" em comum).
// ============================================================

import { haversineKm, normalize } from './geoService'

// Score alto pra casamento por palavra-chave; máximo reservado pro
// casamento exato de código CATMAT/CATSER, o sinal mais forte possível.
export const KEYWORD_MATCH_SCORE = 0.9
export const CODE_MATCH_SCORE = 1

const PALAVRAS_DE_LIGACAO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'a', 'o', 'as', 'os', 'ou', 'no', 'na', 'nos', 'nas'])
const TAMANHO_MINIMO_DA_VARIACAO = 3

export function temPalavraSignificativa(keyword: string): boolean {
  return normalize(keyword).split(/\s+/).some((palavra) => palavra !== '' && !PALAVRAS_DE_LIGACAO.has(palavra))
}

export function variacoesDaPalavra(palavra: string): string[] {
  if (palavra.length < TAMANHO_MINIMO_DA_VARIACAO || /\d/.test(palavra) || PALAVRAS_DE_LIGACAO.has(palavra)) return [palavra]
  const formas = new Set([palavra])
  const somar = (forma: string) => {
    if (forma.length >= TAMANHO_MINIMO_DA_VARIACAO) formas.add(forma)
  }
  if (/(oes|aes)$/.test(palavra)) somar(`${palavra.slice(0, -3)}ao`)
  if (/ais$/.test(palavra)) somar(`${palavra.slice(0, -3)}al`)
  if (/eis$/.test(palavra)) {
    somar(`${palavra.slice(0, -3)}el`)
    somar(`${palavra.slice(0, -3)}il`)
  }
  if (/ois$/.test(palavra)) somar(`${palavra.slice(0, -3)}ol`)
  if (/uis$/.test(palavra)) somar(`${palavra.slice(0, -3)}ul`)
  if (/ns$/.test(palavra)) somar(`${palavra.slice(0, -2)}m`)
  if (/[rsz]es$/.test(palavra)) somar(palavra.slice(0, -2))
  if (/[^s]s$/.test(palavra)) somar(palavra.slice(0, -1))
  for (const base of [...formas]) {
    if (/ao$/.test(base)) {
      somar(`${base.slice(0, -2)}oes`)
      somar(`${base.slice(0, -2)}aes`)
      somar(`${base}s`)
    } else if (/al$/.test(base)) somar(`${base.slice(0, -2)}ais`)
    else if (/el$/.test(base)) somar(`${base.slice(0, -2)}eis`)
    else if (/ol$/.test(base)) somar(`${base.slice(0, -2)}ois`)
    else if (/ul$/.test(base)) somar(`${base.slice(0, -2)}uis`)
    else if (/il$/.test(base)) somar(`${base.slice(0, -2)}is`)
    else if (/m$/.test(base)) somar(`${base.slice(0, -1)}ns`)
    else if (/[rz]$/.test(base)) somar(`${base}es`)
    else if (!/s$/.test(base)) somar(`${base}s`)
  }
  return [...formas].sort((a, b) => b.length - a.length)
}

function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildKeywordRegex(keyword: string): RegExp | null {
  const palavras = normalize(keyword).trim().split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return null
  const partes = palavras.map((palavra) => {
    const formas = variacoesDaPalavra(palavra).map(escaparParaRegex)
    return formas.length === 1 ? formas[0] : `(?:${formas.join('|')})`
  })
  return new RegExp(`\\b${partes.join('\\s+')}\\b`)
}

export function termosDoPreFiltro(keyword: string): string[] {
  const palavras = normalize(keyword).trim().split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return []
  const significativas = palavras.filter((p) => !PALAVRAS_DE_LIGACAO.has(p))
  const maisLonga = (significativas.length > 0 ? significativas : palavras).reduce((a, b) => (b.length > a.length ? b : a))
  const formas = variacoesDaPalavra(maisLonga)
  return formas.filter((forma) => !formas.some((outra) => outra !== forma && forma.includes(outra)))
}

const TERMOS_DE_OBRA = /\b(obras?|construcao|construcoes|reforma|reformas|ampliacao|edificacao|edificacoes|engenharia)\b/
const ETAPAS_DE_OBRA = /\b(fundac\w*|alvenarias?|cobertura|instalac\w* (?:eletricas?|hidrossanitarias?|hidraulicas?|sanitarias?)|hidrossanitari\w*|impermeabiliza\w*|revestimentos?|terraplenagem|movimento de terra|drenagem|pavimentac\w*|esquadrias?|estruturas?|pinturas?|forros?|pisos?)\b/g

export function ehObraCompleta(objetoNorm: string): boolean {
  const texto = objetoNorm.replace(/\bmao de obra\b/g, ' ')
  if (!TERMOS_DE_OBRA.test(texto)) return false
  const separadores = (texto.match(/[;,]/g) ?? []).length
  const etapas = new Set(texto.match(ETAPAS_DE_OBRA) ?? []).size
  return etapas >= 4 || (separadores >= 6 && etapas >= 2)
}

export function estaDentroDeObraCompleta(objetoNorm: string, palavrasEncontradas: string[]): boolean {
  if (palavrasEncontradas.length === 0) return false
  if (palavrasEncontradas.every((palavra) => TERMOS_DE_OBRA.test(normalize(palavra)))) return false
  if (ehObraCompleta(objetoNorm)) return true
  const algumaNoObjeto = palavrasEncontradas.some((palavra) => buildKeywordRegex(palavra)?.test(objetoNorm))
  return !algumaNoObjeto && TERMOS_DE_OBRA.test(objetoNorm.replace(/\bmao de obra\b/g, ' '))
}

export interface KeywordPattern {
  keyword: string
  regex: RegExp
}

// Compila uma vez e reaproveita — antes o regex era reconstruído para cada
// item monitorado, a cada licitação avaliada.
export function compileKeywordPatterns(keywords: string[]): KeywordPattern[] {
  return keywords
    .map((keyword) => ({ keyword, regex: buildKeywordRegex(keyword) }))
    .filter((k): k is KeywordPattern => k.regex !== null)
}

export function keywordFoundIn(regex: RegExp, objetoNorm: string, itemDescsNorm: string[]): boolean {
  return regex.test(objetoNorm) || itemDescsNorm.some((d) => regex.test(d))
}

export function matchedKeywords(
  patterns: KeywordPattern[],
  objetoNorm: string,
  itemDescsNorm: string[]
): string[] {
  return patterns
    .filter(({ regex }) => keywordFoundIn(regex, objetoNorm, itemDescsNorm))
    .map(({ keyword }) => keyword)
}

// Filtro por órgão — mesmo casamento literal/borda de palavra das keywords,
// mas funciona como um portão (igual UF/modalidade): se configurado, o órgão
// da licitação precisa bater com algum dos filtros pra ela nem entrar na
// contagem de score.
export function orgaoMatches(orgaos: string[], tenderOrgao: string | null): boolean {
  if (orgaos.length === 0) return true
  if (!tenderOrgao) return false
  const orgaoNorm = normalize(tenderOrgao)
  return orgaos.some((o) => {
    const re = buildKeywordRegex(o)
    return re ? re.test(orgaoNorm) : false
  })
}

// Filtro por código UASG (unidade compradora) — só existe no sistema legado
// (ComprasNet/Lei 8.666). O PNCP (Lei 14.133) não usa UASG, então esse
// filtro não restringe candidatas do PNCP quando configurado — senão todo
// item com UASG selecionada nunca mais casaria com nada do PNCP, que é a
// fonte principal da plataforma.
export function uasgMatches(uasgCodes: string[], tenderFonte: string, tenderUnidade: string | null): boolean {
  if (uasgCodes.length === 0) return true
  if (tenderFonte !== 'COMPRASNET') return true
  return tenderUnidade !== null && uasgCodes.includes(tenderUnidade)
}

export interface Gates {
  ufs: string[]
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  valorMin: number | null
  valorMax: number | null
  raioKm: number | null
  origemLat: number | null
  origemLng: number | null
}

export interface TenderGateInput {
  fonte: string
  uf: string | null
  modalidade: string
  orgao: string | null
  unidade: string | null
  valorEstimado: number | null
  municipioLat: number | null
  municipioLng: number | null
}

export function passaNosPortoes(gates: Gates, tender: TenderGateInput): boolean {
  if (gates.ufs.length > 0 && (!tender.uf || !gates.ufs.includes(tender.uf))) return false
  if (gates.valorMin != null && tender.valorEstimado != null && gates.valorMin > tender.valorEstimado) return false
  if (gates.valorMax != null && tender.valorEstimado != null && gates.valorMax < tender.valorEstimado) return false
  if (gates.modalidades.length > 0 && !gates.modalidades.includes(tender.modalidade)) return false
  if (!orgaoMatches(gates.orgaos, tender.orgao)) return false
  if (!uasgMatches(gates.uasgCodes, tender.fonte, tender.unidade)) return false

  if (gates.raioKm != null) {
    if (
      gates.origemLat == null ||
      gates.origemLng == null ||
      tender.municipioLat == null ||
      tender.municipioLng == null
    ) {
      return false
    }
    if (
      haversineKm(gates.origemLat, gates.origemLng, tender.municipioLat, tender.municipioLng) > gates.raioKm
    ) {
      return false
    }
  }

  return true
}

export function scoreDoMatch(codeMatch: boolean): number {
  return codeMatch ? CODE_MATCH_SCORE : KEYWORD_MATCH_SCORE
}
