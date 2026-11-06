// ============================================================
// lib/vitrinePublica.ts — O que pode ir para a vitrine da página inicial.
//
// A vitrine mostra licitações reais para quem ainda não entrou. Algumas compras
// públicas citam pessoas: remédio para um paciente por ordem judicial, número de
// processo, CPF. São dados públicos no PNCP, mas não servem de propaganda (LGPD):
// essas ficam fora da vitrine. A busca e o sistema logado continuam com elas.
// ============================================================

import { normalize } from './geoService'

const CITA_PESSOA_OU_PROCESSO: RegExp[] = [
  /\bpacientes?\b/,
  /\bmandados?\s+de\s+seguranca\b/,
  /\bimpetrad[oa]s?\b/,
  /\b(decisao|ordem|demanda|acao|determinacao|sentenca)\s+judicia(l|is)\b/,
  /\bjudicializad[oa]s?\b/,
  /\bautos\s+(do\s+processo\s+)?n/,
  /\bprocesso\s+judicial\b/,
  /\brequerente\b/,
  /\bbeneficiari[oa]\b/,
  /\bmunicipe\b/,
  /\bsr\.?\s+[a-z]|\bsra\.?\s+[a-z]/,
  // Número de processo judicial (CNJ): 0000000-00.0000.0.00.0000
  /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/,
  // CPF
  /\d{3}\.\d{3}\.\d{3}-\d{2}/,
]

/** A licitação cita uma pessoa ou um processo judicial e não deve ir para a vitrine pública. */
export function citaPessoaOuProcesso(texto: string): boolean {
  const t = normalize(texto)
  return CITA_PESSOA_OU_PROCESSO.some((re) => re.test(t))
}

// "[Portal de Compras Públicas] - Aquisição de ..." -> "Aquisição de ..."
export function limparObjetoDaVitrine(objeto: string): string {
  return objeto
    .replace(/\s+/g, ' ')
    .replace(/^\s*\[[^\]]{2,60}\]\s*[-–:]?\s*/, '')
    .trim()
}

// O PNCP grava muitos órgãos sem acento e em caixa alta ("MUNICIPIO DE RIO VERDE").
// Para a vitrine, só o começo mais comum ganha o acento.
export function orgaoDaVitrine(orgao: string | null): string | null {
  if (!orgao) return orgao
  return orgao.replace(/\s+/g, ' ').trim().replace(/^Municipio\b/, 'Município').replace(/^MUNICIPIO\b/, 'MUNICÍPIO')
}
