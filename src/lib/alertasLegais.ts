// ============================================================
// lib/alertasLegais.ts — Alertas fixos sobre exigências de edital que parecem
// ultrapassar os limites da Lei 14.133/2021. São REGRAS EM CÓDIGO aplicadas ao
// texto que a análise por IA extraiu: a IA lê o edital, mas quem decide se algo
// passa do limite é a conta, que é previsível e testável.
//
// IMPORTANTE: é INDÍCIO para análise jurídica, nunca conclusão. O texto extraído
// pode estar incompleto e a lei admite exceções. Os artigos citados devem ser
// validados por advogado antes de virarem promessa comercial.
// ============================================================

import { normalize } from './geoService'

export type GravidadeDoAlerta = 'alta' | 'media'

export interface AlertaLegal {
  id: 'garantia-proposta' | 'garantia-contratual' | 'patrimonio-liquido' | 'visita-tecnica'
  titulo: string
  gravidade: GravidadeDoAlerta
  detalhe: string
  fundamento: string
  trecho: string
}

export interface EntradaDeAlertas {
  garantiaProposta?: string
  garantiaContratual?: string
  patrimonioLiquidoMinimo?: string
  visitaTecnica?: string
  // Valor estimado da contratação, em reais, quando conhecido.
  valorEstimado: number | null
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
}

function numero(txt: string): number {
  return Number(txt.replace(',', '.'))
}

// Percentuais citados no texto: "1%", "1,5 %", "5 (cinco) por cento", "um por cento".
export function lerPercentuais(texto: string): number[] {
  const t = normalize(texto)
  const achados: number[] = []
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)) achados.push(numero(m[1]))
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*(?:\([^)]*\)\s*)?por\s*cento/g)) achados.push(numero(m[1]))
  for (const m of t.matchAll(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s+por\s*cento/g)) {
    achados.push(NUMEROS_POR_EXTENSO[m[1]])
  }
  return achados.filter((n) => Number.isFinite(n))
}

// Valores em reais: "R$ 1.234.567,89".
export function lerValoresEmReais(texto: string): number[] {
  const achados: number[] = []
  for (const m of texto.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) achados.push(n)
  }
  return achados
}

function recorte(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > 300 ? `${t.slice(0, 300)}…` : t
}

function dizQueNaoHa(texto: string): boolean {
  const t = normalize(texto)
  return /nao\s+(sera|serao|ha|havera|se\s+aplica|especificado|exig|constam?|consta)|dispensad|sem\s+exigencia|nao\s+informad/.test(t)
}

// Só vale avaliar se há texto e ele não diz que a exigência não existe (um percentual
// escrito sempre vale, mesmo numa frase com "não").
function deveAvaliar(texto: string | undefined): texto is string {
  return !!texto && (!dizQueNaoHa(texto) || lerPercentuais(texto).length > 0)
}

// Maior valor exigido, expresso como percentual do valor estimado.
// Prefere o percentual escrito; senão converte o valor em reais quando o valor estimado é conhecido.
function maiorPercentualExigido(texto: string, valorEstimado: number | null): number | null {
  const pcts = lerPercentuais(texto)
  if (pcts.length > 0) return Math.max(...pcts)
  if (valorEstimado && valorEstimado > 0) {
    const reais = lerValoresEmReais(texto)
    if (reais.length > 0) return (Math.max(...reais) / valorEstimado) * 100
  }
  return null
}

const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export function calcularAlertasLegais(e: EntradaDeAlertas): AlertaLegal[] {
  const alertas: AlertaLegal[] = []

  // Garantia de proposta: até 1% do valor estimado (art. 58, §1º).
  if (deveAvaliar(e.garantiaProposta)) {
    const p = maiorPercentualExigido(e.garantiaProposta as string, e.valorEstimado)
    if (p !== null && p > 1.0001) {
      alertas.push({
        id: 'garantia-proposta',
        titulo: 'Garantia de proposta acima de 1%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir garantia de proposta de cerca de ${f(p)}% do valor estimado. A lei limita a 1%.`,
        fundamento: 'Lei 14.133/2021, art. 58, §1º',
        trecho: recorte(e.garantiaProposta as string),
      })
    }
  }

  // Garantia contratual: até 5%, podendo chegar a 10% se justificada (art. 98).
  if (deveAvaliar(e.garantiaContratual)) {
    const p = maiorPercentualExigido(e.garantiaContratual, e.valorEstimado)
    if (p !== null && p > 10.0001) {
      alertas.push({
        id: 'garantia-contratual',
        titulo: 'Garantia contratual acima de 10%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}% do valor do contrato, acima do máximo de 10% previsto para obras e serviços de engenharia.`,
        fundamento: 'Lei 14.133/2021, art. 98 (a regra de até 5%, ou 10% se justificada, trata de obras e serviços de engenharia; confira o regime do objeto)',
        trecho: recorte(e.garantiaContratual),
      })
    } else if (p !== null && p > 5.0001) {
      alertas.push({
        id: 'garantia-contratual',
        titulo: 'Garantia contratual acima de 5%',
        gravidade: 'media',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}%. Acima de 5% só é admitido, até 10%, com justificativa de complexidade e riscos: confira se o edital a apresenta.`,
        fundamento: 'Lei 14.133/2021, art. 98 (obras e serviços de engenharia)',
        trecho: recorte(e.garantiaContratual),
      })
    }
  }

  // Patrimônio líquido ou capital mínimo: até 10% do valor estimado (art. 69, §4º).
  if (deveAvaliar(e.patrimonioLiquidoMinimo)) {
    const p = maiorPercentualExigido(e.patrimonioLiquidoMinimo, e.valorEstimado)
    if (p !== null && p > 10.0001) {
      alertas.push({
        id: 'patrimonio-liquido',
        titulo: 'Patrimônio líquido ou capital mínimo acima de 10%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir patrimônio líquido ou capital mínimo de cerca de ${f(p)}% do valor estimado. O limite legal é 10%.`,
        fundamento: 'Lei 14.133/2021, art. 69, §4º',
        trecho: recorte(e.patrimonioLiquidoMinimo),
      })
    }
  }

  // Visita técnica obrigatória sem alternativa de declaração (art. 63, §2º).
  if (e.visitaTecnica && !dizQueNaoHa(e.visitaTecnica)) {
    const t = normalize(e.visitaTecnica)
    const obrigatoria = /obrigatori/.test(t) || /\bdeve(ra)?\s+(realizar|comparecer)|necessari[ao]\s+(a\s+)?(realizacao|visita)/.test(t)
    const temAlternativa = /declaracao|facultativ|opcional|substitu|dispens/.test(t)
    if (obrigatoria && !temAlternativa) {
      alertas.push({
        id: 'visita-tecnica',
        titulo: 'Visita técnica obrigatória sem alternativa de declaração',
        gravidade: 'media',
        detalhe:
          'O edital parece tornar a visita técnica obrigatória sem permitir que ela seja substituída por declaração do responsável técnico de que conhece as condições do local. A lei exige essa alternativa.',
        fundamento: 'Lei 14.133/2021, art. 63, §2º',
        trecho: recorte(e.visitaTecnica),
      })
    }
  }

  return alertas
}
