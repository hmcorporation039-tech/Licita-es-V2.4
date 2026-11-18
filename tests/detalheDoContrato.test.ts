import { beforeEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'

// PNCP e leitura de PDF simulados: nada aqui sai para a rede.
const pncp = vi.hoisted(() => ({
  itens: vi.fn(),
  resultados: vi.fn(),
  arquivos: vi.fn(),
  baixar: vi.fn(),
}))

vi.mock('../src/services/pncpItemsService', () => ({ fetchPNCPItensBrutos: pncp.itens, fetchPNCPResultadosDoItem: pncp.resultados }))
vi.mock('../src/services/pncpDocumentsService', async (original) => ({
  ...(await original<typeof import('../src/services/pncpDocumentsService')>()),
  listPNCPDocuments: pncp.arquivos,
  downloadPNCPDocument: pncp.baixar,
}))
// "PDF" de teste: o texto vem depois do cabeçalho %PDF-, com páginas longas o bastante.
vi.mock('../src/services/pdfTextService', async (original) => ({
  ...(await original<typeof import('../src/services/pdfTextService')>()),
  extractPdf: vi.fn(async (b: Buffer) => {
    const texto = b.toString('utf8').slice(5)
    return { texto: texto + ' '.repeat(10) + 'x'.repeat(300), paginas: 1, textoComPaginas: texto }
  }),
}))

import { baseDaCompra, homologadosDosItens, limparCacheDoDetalhe, textosDoArquivo } from '../src/services/detalheDoContrato'

const compra = { cnpj: '46362661000168', ano: 2026, sequencial: 2174 }
const pdf = (texto: string) => Buffer.from(`%PDF-${texto}`)
const arquivo = (n: number, titulo: string) => ({ uri: `https://pncp.gov.br/pncp-api/v1/orgaos/x/arquivos/${n}`, titulo, sequencialDocumento: n, tipoDocumentoNome: 'Outros Documentos', statusAtivo: true })

beforeEach(() => {
  limparCacheDoDetalhe()
  vi.clearAllMocks()
  pncp.itens.mockResolvedValue({ itens: [{ numeroItem: 2, descricao: 'Luminária LED', valorTotal: 10, temResultado: true }, { numeroItem: 1, descricao: 'Mobilização', valorTotal: 5 }], completo: true })
})

describe('baseDaCompra', () => {
  it('junta itens e regra; para no primeiro arquivo que decide; guarda em cache', async () => {
    pncp.arquivos.mockResolvedValue([arquivo(1, 'Anexo I - Planilha'), arquivo(2, 'Edital'), arquivo(3, 'Termo de Referência')])
    pncp.baixar.mockImplementation(async (uri: string) =>
      uri.endsWith('/2') ? pdf('Sem regra aqui. Prazo de 120 dias.') : uri.endsWith('/3') ? pdf('5.1. É permitida a subcontratação parcial até 30% do valor total do contrato.') : pdf('Planilha.')
    )
    const r = await baseDaCompra(compra)
    expect(r.itens.map((i) => i.numero)).toEqual([1, 2])
    expect(r.regra).toMatchObject({ situacao: 'permite', limite: 'até 30% do valor do contrato', documento: 'Termo de Referência' })
    // Edital primeiro (prioridade), depois o termo de referência; a planilha nem precisou ser baixada.
    expect(r.documentosLidos).toEqual(['Edital', 'Termo de Referência'])
    expect(r.parcial).toBe(false)

    await baseDaCompra(compra)
    expect(pncp.itens).toHaveBeenCalledTimes(1)
    expect(pncp.arquivos).toHaveBeenCalledTimes(1)
  })

  it('PNCP lento: devolve no prazo o que chegou, marcado como parcial', async () => {
    pncp.arquivos.mockImplementation(() => new Promise(() => undefined))
    const inicio = Date.now()
    const r = await baseDaCompra(compra, 200)
    expect(Date.now() - inicio).toBeLessThan(1500)
    expect(r.parcial).toBe(true)
    expect(r.itens).toHaveLength(2)
    expect(r.regra.situacao).toBe('nao_encontrei')
  })

  it('itens falhando não derrubam a regra', async () => {
    pncp.itens.mockRejectedValue(new Error('500'))
    pncp.arquivos.mockResolvedValue([arquivo(1, 'Edital')])
    pncp.baixar.mockResolvedValue(pdf('Não será admitida a subcontratação do objeto contratual.'))
    const r = await baseDaCompra(compra)
    expect(r.itensFalharam).toBe(true)
    expect(r.regra.situacao).toBe('proibe')
  })

  it('arquivos falhando: não encontrei, com aviso', async () => {
    pncp.arquivos.mockRejectedValue(new Error('timeout'))
    const r = await baseDaCompra(compra)
    expect(r.arquivosFalharam).toBe(true)
    expect(r.regra.situacao).toBe('nao_encontrei')
  })
})

describe('textosDoArquivo', () => {
  it('lê os PDFs de dentro do zip, edital primeiro', async () => {
    const zip = Buffer.from(
      zipSync({
        'RelacaoItens.pdf': strToU8('%PDF-Relação de itens'),
        'Edital e lauda.pdf': strToU8('%PDF-É vedada a subcontratação.'),
        'foto.jpg': strToU8('nada'),
      })
    )
    const textos = await textosDoArquivo('09010203900032026000', zip)
    expect(textos.map((t) => t.nome)).toEqual(['09010203900032026000 › Edital e lauda.pdf', '09010203900032026000 › RelacaoItens.pdf'])
    expect(textos[0].texto).toContain('vedada a subcontratação')
  })
  it('arquivo que não é PDF nem zip: nada', async () => {
    expect(await textosDoArquivo('x', Buffer.from('Rar!\x1a\x07'))).toEqual([])
  })
})

describe('homologadosDosItens', () => {
  it('busca só itens com resultado, do ganhador, e guarda', async () => {
    pncp.resultados.mockResolvedValue([{ niFornecedor: '11222333000181', valorTotalHomologado: 9 }])
    const itens = [
      { numero: 2, descricao: 'Luminária', complemento: null, quantidade: 1, unidade: null, valorEstimado: 10, valorHomologado: null, temResultado: true },
      { numero: 3, descricao: 'Cabo', complemento: null, quantidade: 1, unidade: null, valorEstimado: 10, valorHomologado: null, temResultado: false },
    ]
    const v = await homologadosDosItens(compra, 'c1', '11222333000181', itens)
    expect([...v.entries()]).toEqual([[2, 9]])
    await homologadosDosItens(compra, 'c1', '11222333000181', itens)
    expect(pncp.resultados).toHaveBeenCalledTimes(1)
  })
})
