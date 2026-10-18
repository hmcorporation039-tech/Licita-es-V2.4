import type { FonteEnum } from '@prisma/client'
import { DESLOCAMENTO_DE_BRASILIA_MS } from './dataDeBrasilia'

export const FONTES_COM_ANO_NO_NUMERO: FonteEnum[] = ['SEST_SENAT', 'SESC_GO', 'SESC_REGIONAL', 'SISTEMA_S', 'FIEG', 'NOVACAP']

const ANO_MINIMO = 2000

const ANO_COM_QUATRO_DIGITOS_DEPOIS_DA_BARRA = /\/\s*(\d{4})(?!\d)/g
const ANO_COM_DOIS_DIGITOS_DEPOIS_DA_BARRA = /\/\s*(\d{2})(?!\d)/g
const ANO_COM_QUATRO_DIGITOS_DEPOIS_DE_SEPARADOR = /[.\-_ ](\d{4})(?!\d)/g
const ANO_COM_DOIS_DIGITOS_DEPOIS_DE_SEPARADOR = /[.\-_](\d{2})(?!\d)/g
const ANO_NO_INICIO_DO_PROCESSO_DO_SESC_GO = /^\s*(\d{2})(?!\d)/
const SEQUENCIA_DE_DIGITOS = /\d+/g
const MENOR_SEQUENCIA_COM_ANO_NO_FIM = 5
const MENOR_SEQUENCIA_COM_ANO_NO_INICIO = 7

export function anoEmBrasilia(agora: Date = new Date()): number {
  return new Date(agora.getTime() - DESLOCAMENTO_DE_BRASILIA_MS).getUTCFullYear()
}

function anoPlausivel(ano: number, anoMaximo: number): number | null {
  return ano >= ANO_MINIMO && ano <= anoMaximo ? ano : null
}

function primeiroAno(numero: string, padrao: RegExp, doisDigitos: boolean, anoMaximo: number): number | null {
  for (const encontrado of numero.matchAll(padrao)) {
    const ano = anoPlausivel((doisDigitos ? 2000 : 0) + Number(encontrado[1]), anoMaximo)
    if (ano !== null) return ano
  }
  return null
}

function anoNaSequenciaDeDigitos(numero: string, anoMaximo: number): number | null {
  for (const [sequencia] of numero.matchAll(SEQUENCIA_DE_DIGITOS)) {
    if (sequencia.length < MENOR_SEQUENCIA_COM_ANO_NO_FIM) continue
    const noFim = anoPlausivel(Number(sequencia.slice(-4)), anoMaximo)
    if (noFim !== null) return noFim
    if (sequencia.length < MENOR_SEQUENCIA_COM_ANO_NO_INICIO) continue
    const noInicio = anoPlausivel(Number(sequencia.slice(0, 4)), anoMaximo)
    if (noInicio !== null) return noInicio
  }
  return null
}

export function anoDoProcesso(fonte: FonteEnum, numeroControle: string | null | undefined, agora: Date = new Date()): number | null {
  if (!FONTES_COM_ANO_NO_NUMERO.includes(fonte)) return null
  const numero = (numeroControle ?? '').trim()
  if (!numero) return null
  const anoMaximo = anoEmBrasilia(agora) + 1

  const depoisDaBarra = primeiroAno(numero, ANO_COM_QUATRO_DIGITOS_DEPOIS_DA_BARRA, false, anoMaximo)
  if (depoisDaBarra !== null) return depoisDaBarra

  if (fonte === 'SESC_GO') {
    const inicio = numero.match(ANO_NO_INICIO_DO_PROCESSO_DO_SESC_GO)
    return inicio ? anoPlausivel(2000 + Number(inicio[1]), anoMaximo) : null
  }

  return (
    primeiroAno(numero, ANO_COM_DOIS_DIGITOS_DEPOIS_DA_BARRA, true, anoMaximo) ??
    primeiroAno(numero, ANO_COM_QUATRO_DIGITOS_DEPOIS_DE_SEPARADOR, false, anoMaximo) ??
    primeiroAno(numero, ANO_COM_DOIS_DIGITOS_DEPOIS_DE_SEPARADOR, true, anoMaximo) ??
    anoNaSequenciaDeDigitos(numero, anoMaximo)
  )
}
