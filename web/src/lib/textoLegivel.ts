const PALAVRAS_MINUSCULAS = new Set(['a', 'as', 'o', 'os', 'e', 'de', 'da', 'das', 'do', 'dos', 'em', 'na', 'nas', 'no', 'nos', 'para', 'por', 'com'])
const SIGLAS = /^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|SESC|SESI|SENAI|SENAC|SEST|SENAT|PNCP|SRP|ME|EPP|CNPJ|CPF|UBS|UPA|SUS|TI|EPI|ARP|[A-Z]{2,}-[A-Z]{2})$/

function ehCaixaAlta(texto: string): boolean {
  const letras = texto.replace(/[^\p{L}]/gu, '')
  if (letras.length < 8) return false
  const maiusculas = letras.replace(/[^\p{Lu}]/gu, '').length
  return maiusculas / letras.length > 0.8
}

export function frasePropria(texto: string): string {
  if (!ehCaixaAlta(texto)) return texto
  const minusculo = texto.toLocaleLowerCase('pt-BR')
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1)
}

export function nomeProprio(texto: string): string {
  if (!ehCaixaAlta(texto)) return texto
  return texto
    .split(/(\s+)/)
    .map((parte, i) => {
      if (/^\s+$/.test(parte)) return parte
      const minuscula = parte.toLocaleLowerCase('pt-BR')
      if (i > 0 && PALAVRAS_MINUSCULAS.has(minuscula)) return minuscula
      if (SIGLAS.test(parte.replace(/[^\p{L}-]/gu, ''))) return parte
      return minuscula.charAt(0).toLocaleUpperCase('pt-BR') + minuscula.slice(1)
    })
    .join('')
}
