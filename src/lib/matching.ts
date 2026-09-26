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

export function buildKeywordRegex(keyword: string): RegExp | null {
  const norm = normalize(keyword).trim()
  if (!norm) return null
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`)
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
