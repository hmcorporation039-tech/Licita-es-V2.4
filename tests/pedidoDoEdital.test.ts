import { describe, expect, it } from 'vitest'
import {
  interpretarPedidoDoEdital,
  licitacaoDaPagina,
  respostaDoPrazo,
  respostaDoResumo,
  respostaDosDocumentos,
  respostaDosRiscos,
  respostaSemAnalise,
  type AnaliseParaResposta,
} from '../web/src/lib/pedidoDoEdital'

const analise: AnaliseParaResposta = {
  resumo: 'Compra de materiais elétricos para manutenção dos prédios e da iluminação pública do município.',
  valorEstimado: 'R$ 1.454.839,05',
  dataSessao: '13/11/2026 às 09h',
  prazoEntrega: '10 dias após o pedido',
  documentosExigidos: ['Certidão negativa federal', 'Certidão do FGTS', 'Atestado de capacidade técnica'],
  riscos: [
    { titulo: 'Amostra em 2 dias', descricao: 'Exige amostra em prazo curto.', severidade: 'media' },
    { titulo: 'Marca exigida', descricao: 'Cita marca sem "ou similar".', severidade: 'alta' },
  ],
}

describe('Bela na página da licitação', () => {
  it('reconhece a página da licitação, mas não o pregão nem os documentos', () => {
    expect(licitacaoDaPagina('/tenders/abc123')).toBe('abc123')
    expect(licitacaoDaPagina('/tenders/abc123/pregao')).toBeNull()
    expect(licitacaoDaPagina('/tenders')).toBeNull()
    expect(licitacaoDaPagina(null)).toBeNull()
  })

  it('entende os pedidos sobre o edital aberto', () => {
    expect(interpretarPedidoDoEdital('me resume esse edital')).toEqual({ tipo: 'resumo' })
    expect(interpretarPedidoDoEdital('Do que se trata essa licitação?')).toEqual({ tipo: 'resumo' })
    expect(interpretarPedidoDoEdital('que documentos pede?')).toEqual({ tipo: 'documentos' })
    expect(interpretarPedidoDoEdital('tem alguma pegadinha?')).toEqual({ tipo: 'riscos' })
    expect(interpretarPedidoDoEdital('quando abre?')).toEqual({ tipo: 'prazo' })
    expect(interpretarPedidoDoEdital('quanto tempo falta')).toEqual({ tipo: 'prazo' })
    expect(interpretarPedidoDoEdital('qual o valor estimado')).toEqual({ tipo: 'valor' })
  })

  it('leva para a tela pedida', () => {
    expect(interpretarPedidoDoEdital('vamos para o pregão')).toMatchObject({ tipo: 'abrir', destino: { caminho: 'pregao' } })
    expect(interpretarPedidoDoEdital('abre o estudo de custos')).toMatchObject({ tipo: 'abrir', destino: { caminho: 'estudo' } })
    expect(interpretarPedidoDoEdital('mostra os itens')).toMatchObject({ tipo: 'abrir', destino: { aba: 'itens' } })
    // "quando abre a disputa" é pergunta de data, não pedido para abrir.
    expect(interpretarPedidoDoEdital('quando abre a disputa?')).toEqual({ tipo: 'prazo' })
  })

  it('pedido de busca continua sendo busca', () => {
    expect(interpretarPedidoDoEdital('licitação de estrutura metálica no DF')).toBeNull()
    expect(interpretarPedidoDoEdital('pregão de móveis em Brasília')).toBeNull()
    expect(interpretarPedidoDoEdital('')).toBeNull()
  })

  it('resumo usa a análise pronta e avisa dos riscos altos', () => {
    const r = respostaDoResumo(analise, 'objeto do portal')
    expect(r.texto).toContain('materiais elétricos')
    expect(r.lista).toContain('Valor estimado: R$ 1.454.839,05')
    expect(r.lista.some((l) => l.includes('Marca exigida'))).toBe(true)
    expect(r.fala).toContain('risco alto')
  })

  it('sem análise, não inventa: manda para a aba Análise', () => {
    const r = respostaSemAnalise('resumo')
    expect(r.texto).toContain('ainda não tem análise')
    expect(r.verMais).toMatchObject({ aba: 'analise' })
  })

  it('documentos e riscos', () => {
    expect(respostaDosDocumentos(analise).lista).toHaveLength(3)
    const riscos = respostaDosRiscos(analise)
    expect(riscos.lista[0]).toContain('Alto — Marca exigida')
    expect(riscos.fala).toContain('Marca exigida')
  })

  it('prazo diz quanto falta', () => {
    const agora = new Date('2026-11-10T12:00:00Z')
    const r = respostaDoPrazo(
      { fim: new Date('2026-11-13T03:00:00Z'), fimTexto: '13/11/2026 00:00', abertura: null, aberturaTexto: null, sessaoDaAnalise: null },
      agora,
    )
    expect(r.fala).toContain('Faltam 2 dias')
    const passado = respostaDoPrazo(
      { fim: new Date('2026-11-01T03:00:00Z'), fimTexto: '01/11/2026 00:00', abertura: null, aberturaTexto: null, sessaoDaAnalise: null },
      agora,
    )
    expect(passado.fala).toContain('terminou')
  })
})
