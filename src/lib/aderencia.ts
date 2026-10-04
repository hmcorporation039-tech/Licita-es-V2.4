// ============================================================
// lib/aderencia.ts — Nota de aderência (0 a 100) de uma licitação a um item
// monitorado, com o motivo de cada critério. Regra pura: sem banco, sem I/O.
//
// Só pontua o que o sistema consegue MEDIR hoje. Os critérios do manual de
// agentes que dependem do perfil do cliente (capacidade técnica e financeira
// comprovadas, histórico do órgão, competitividade) ficam de fora até existirem
// os dados — não se inventa nota para o que não se mede.
//
// Os portões (UF, valor, modalidade, órgão, UASG, raio) continuam decidindo SE
// há match; a nota decide o quão BOM ele é, e por isso só varia dentro do que
// já passou nos portões.
//
//   Objeto       50  código CATMAT/CATSER igual (50) > palavras-chave (20 a 35)
//   Prazo        20  quanto tempo ainda há para propor
//   Valor        15  valor dentro da faixa que o cliente definiu
//   Localização  15  proximidade (raio) ou UF desejada
// ============================================================

import { haversineKm } from './geoService'

export interface CriterioDeAderencia {
  id: 'objeto' | 'prazo' | 'valor' | 'localizacao'
  rotulo: string
  pontos: number
  maximo: number
  motivo: string
}

export type FaixaDeAderencia = 'alta' | 'boa' | 'media' | 'baixa'

export interface Aderencia {
  nota: number
  faixa: FaixaDeAderencia
  criterios: CriterioDeAderencia[]
}

export interface EntradaDeAderencia {
  porCodigo: boolean
  palavrasEncontradas: number
  palavrasTotal: number
  item: {
    ufs: string[]
    valorMin: number | null
    valorMax: number | null
    raioKm: number | null
    origemLat: number | null
    origemLng: number | null
  }
  tender: {
    uf: string | null
    valorEstimado: number | null
    encerramentoAt: Date | null
    municipioLat: number | null
    municipioLng: number | null
  }
  agora?: Date
}

const MS_DIA = 24 * 60 * 60 * 1000

export function faixaDaNota(nota: number): FaixaDeAderencia {
  if (nota >= 80) return 'alta'
  if (nota >= 60) return 'boa'
  if (nota >= 40) return 'media'
  return 'baixa'
}

function critObjeto(e: EntradaDeAderencia): CriterioDeAderencia {
  const base = { id: 'objeto' as const, rotulo: 'Objeto', maximo: 50 }
  if (e.porCodigo) {
    return { ...base, pontos: 50, motivo: 'Código CATMAT/CATSER igual ao de um item da licitação.' }
  }
  const total = Math.max(e.palavrasTotal, 1)
  const encontradas = Math.min(e.palavrasEncontradas, total)
  const pontos = Math.round(20 + 15 * (encontradas / total))
  return { ...base, pontos, motivo: `Palavras-chave encontradas no texto: ${encontradas} de ${total}.` }
}

function critPrazo(e: EntradaDeAderencia, agora: Date): CriterioDeAderencia {
  const base = { id: 'prazo' as const, rotulo: 'Prazo', maximo: 20 }
  const fim = e.tender.encerramentoAt
  if (!fim) return { ...base, pontos: 12, motivo: 'Sem data de encerramento informada (comum em dispensas).' }

  const dias = (fim.getTime() - agora.getTime()) / MS_DIA
  if (dias < 0) return { ...base, pontos: 0, motivo: 'O prazo para propostas já encerrou.' }
  const arred = Math.floor(dias)
  const quando = dias < 1 ? 'menos de 1 dia' : `${arred} dia(s)`
  if (dias >= 15) return { ...base, pontos: 20, motivo: `Faltam ${quando}: tempo de sobra para preparar a proposta.` }
  if (dias >= 7) return { ...base, pontos: 16, motivo: `Faltam ${quando}.` }
  if (dias >= 3) return { ...base, pontos: 10, motivo: `Faltam ${quando}: prazo apertado.` }
  if (dias >= 1) return { ...base, pontos: 5, motivo: `Faltam ${quando}: prazo muito curto.` }
  return { ...base, pontos: 2, motivo: `Faltam ${quando}: encerra quase agora.` }
}

function critValor(e: EntradaDeAderencia): CriterioDeAderencia {
  const base = { id: 'valor' as const, rotulo: 'Valor', maximo: 15 }
  const { valorMin, valorMax } = e.item
  const valor = e.tender.valorEstimado
  const temFaixa = valorMin != null || valorMax != null

  if (!temFaixa) return { ...base, pontos: 8, motivo: 'Você não definiu faixa de valor para este item.' }
  if (valor == null) return { ...base, pontos: 6, motivo: 'A licitação não informa o valor estimado.' }
  const dentro = (valorMin == null || valor >= valorMin) && (valorMax == null || valor <= valorMax)
  return dentro
    ? { ...base, pontos: 15, motivo: 'Valor estimado dentro da faixa que você definiu.' }
    : { ...base, pontos: 0, motivo: 'Valor estimado fora da faixa que você definiu.' }
}

function critLocalizacao(e: EntradaDeAderencia): CriterioDeAderencia {
  const base = { id: 'localizacao' as const, rotulo: 'Localização', maximo: 15 }
  const { raioKm, origemLat, origemLng, ufs } = e.item
  const { municipioLat, municipioLng, uf } = e.tender

  if (raioKm != null && raioKm > 0 && origemLat != null && origemLng != null && municipioLat != null && municipioLng != null) {
    const km = haversineKm(origemLat, origemLng, municipioLat, municipioLng)
    if (km > raioKm) return { ...base, pontos: 0, motivo: `A ${Math.round(km)} km: fora do raio de ${raioKm} km.` }
    // 8 pontos na borda do raio, 15 quando é praticamente no mesmo lugar.
    const pontos = Math.round(8 + 7 * (1 - km / raioKm))
    return { ...base, pontos, motivo: `A ${Math.round(km)} km da sua cidade de referência (raio de ${raioKm} km).` }
  }
  if (ufs.length > 0) {
    return uf && ufs.includes(uf)
      ? { ...base, pontos: 12, motivo: `Está em ${uf}, uma das UFs que você escolheu.` }
      : { ...base, pontos: 0, motivo: 'Fora das UFs que você escolheu.' }
  }
  return { ...base, pontos: 8, motivo: 'Busca nacional: você não restringiu a região.' }
}

export function calcularAderencia(entrada: EntradaDeAderencia): Aderencia {
  const agora = entrada.agora ?? new Date()
  const criterios = [critObjeto(entrada), critPrazo(entrada, agora), critValor(entrada), critLocalizacao(entrada)]
  const nota = Math.max(0, Math.min(100, criterios.reduce((s, c) => s + c.pontos, 0)))
  return { nota, faixa: faixaDaNota(nota), criterios }
}
