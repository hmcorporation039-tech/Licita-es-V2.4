import { describe, expect, it } from 'vitest'
import { MIN_CARACTERES_POR_PAGINA, temCamadaDeTexto } from '../src/services/pdfTextService'

// Esta é a decisão que separa o caminho barato (texto) do caro (PDF nativo).
describe('temCamadaDeTexto', () => {
  it('aceita edital com texto de verdade', () => {
    const umaPagina = 'a'.repeat(3000)
    expect(temCamadaDeTexto(umaPagina.repeat(40), 40)).toBe(true)
  })

  it('recusa PDF escaneado, que não devolve texto nenhum', () => {
    expect(temCamadaDeTexto('', 40)).toBe(false)
  })

  it('recusa PDF escaneado que devolve só sujeira', () => {
    // Cabeçalho/rodapé vetorial sobra em alguns escaneados e engana uma
    // checagem que só olhasse "o texto está vazio?".
    expect(temCamadaDeTexto('Prefeitura Municipal\n'.repeat(40), 40)).toBe(false)
  })

  it('não conta espaço em branco como texto', () => {
    expect(temCamadaDeTexto(' \n\t'.repeat(100_000), 10)).toBe(false)
  })

  it('usa o limiar por página, não o total', () => {
    const conteudo = 'a'.repeat(MIN_CARACTERES_POR_PAGINA * 10)
    expect(temCamadaDeTexto(conteudo, 10)).toBe(true)
    // O mesmo texto espalhado em 200 páginas é escaneado com um índice legível.
    expect(temCamadaDeTexto(conteudo, 200)).toBe(false)
  })

  it('não quebra com contagem de páginas inválida', () => {
    expect(temCamadaDeTexto('qualquer coisa', 0)).toBe(false)
    expect(temCamadaDeTexto('qualquer coisa', -1)).toBe(false)
  })
})
