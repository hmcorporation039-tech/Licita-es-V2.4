import { describe, expect, it } from 'vitest'
import { textoLimpo } from '../src/lib/textoLimpo'

describe('textoLimpo', () => {
  it('tira tags HTML', () => {
    expect(textoLimpo('PRODUTO: 230230043 <p>Alfabeto silábico</p>')).toBe('PRODUTO: 230230043 Alfabeto silábico')
    expect(textoLimpo('Linha 1<br/>Linha 2')).toBe('Linha 1 Linha 2')
  })

  it('decodifica entidades, inclusive as que perderam o "&"', () => {
    expect(textoLimpo('Descriccedil;ao')).toBe('Descriçao')
    expect(textoLimpo('PRESTACcedil;Atilde;O DE SERVIÇO')).toBe('PRESTAÇÃO DE SERVIÇO')
    expect(textoLimpo('Aquisi&ccedil;&atilde;o de m&oacute;veis &amp; utens&iacute;lios')).toBe('Aquisição de móveis & utensílios')
    expect(textoLimpo('Preg&#227;o n&ordm; 5')).toBe('Pregão nº 5')
  })

  it('remove caractere de controle', () => {
    expect(textoLimpo('Contratação\u0013 de empresa')).toBe('Contratação de empresa')
  })

  it('não mexe em texto normal nem em "a < b"', () => {
    expect(textoLimpo('Aquisição de câmeras – lote 2 (R$ 1.000,00)')).toBe('Aquisição de câmeras – lote 2 (R$ 1.000,00)')
    expect(textoLimpo('se a < b e c > d')).toBe('se a < b e c > d')
    expect(textoLimpo(null)).toBe('')
  })
})
