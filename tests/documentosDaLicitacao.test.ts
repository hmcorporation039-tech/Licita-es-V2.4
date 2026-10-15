import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { dadosDoCertame, dadosDoProponente, type EmpresaParaDocumento } from '../src/lib/documentosDaLicitacao/proponente'
import { propostaComercial } from '../src/lib/documentosDaLicitacao/proposta'
import { declaracoes, IDS_DE_DECLARACAO } from '../src/lib/documentosDaLicitacao/declaracoes'
import { documentoSchema } from '../src/lib/documentosDaLicitacao/modelo'
import { readequarPrecos } from '../src/lib/documentosDaLicitacao/readequacao'
import { renderizarPdf } from '../src/services/documentos/renderizarPdf'
import { renderizarDocx } from '../src/services/documentos/renderizarDocx'
import { deflateSync } from 'node:zlib'
import { dimensoesDaImagem, encaixar, imagemLegivel } from '../src/services/documentos/papelTimbrado'

const empresa: EmpresaParaDocumento = {
  name: 'H&M Engenharia e Tecnologia LTDA',
  tipo: 'PESSOA_JURIDICA',
  cnpj: '04003376000100',
  cpf: null,
  email: 'contato@hm.com.br',
  telefone: '(61) 99999-0000',
  responsavel: 'João da Silva',
  responsavelCpf: '52998224725',
  responsavelCargo: 'Sócio-administrador',
  dadosBancarios: 'Banco do Brasil, ag. 1234-5, c/c 67890-1',
  endereco: 'QNA 10',
  enderecoNumero: '12',
  enderecoComplemento: null,
  enderecoBairro: 'Taguatinga Norte',
  enderecoCidade: 'Brasília',
  enderecoUf: 'df',
  cep: '72110100',
}

const certame = dadosDoCertame({
  orgao: 'Município de São Miguel do Araguaia',
  numeroControle: '02391654000119-1-000595/2026',
  modalidade: 'PREGAO_ELETRONICO',
  objeto: 'Aquisição de carnes e derivados',
  sessao: new Date('2026-10-15T10:00:00Z'),
})

const quando = new Date('2026-10-14T15:00:00Z')

describe('dadosDoProponente', () => {
  it('usa os dados reais e formata CNPJ, CPF, endereço e cidade', () => {
    const p = dadosDoProponente(empresa)
    expect(p.razaoSocial).toBe('H&M Engenharia e Tecnologia LTDA')
    expect(p.documento).toBe('CNPJ nº 04.003.376/0001-00')
    expect(p.responsavelCpf).toBe('529.982.247-25')
    expect(p.endereco).toBe('QNA 10, 12 – Taguatinga Norte – Brasília/DF – CEP 72110-100')
    expect(p.pendencias).toEqual([])
  })

  it('nunca inventa dado: o que falta vira marcador e pendência', () => {
    const p = dadosDoProponente({ ...empresa, cnpj: null, responsavelCpf: null, endereco: null })
    expect(p.documento).toBe('[preencher: CNPJ da empresa]')
    expect(p.responsavelCpf).toBe('[preencher: CPF do responsável legal]')
    expect(p.pendencias).toEqual(expect.arrayContaining(['CNPJ da empresa', 'CPF do responsável legal', 'endereço completo da empresa']))
  })

  it('pessoa física se qualifica pelo próprio CPF e assina em nome próprio', () => {
    const p = dadosDoProponente({ ...empresa, tipo: 'PESSOA_FISICA', name: 'Maria Souza', cnpj: null, cpf: '52998224725', responsavel: null, responsavelCpf: null, responsavelCargo: null })
    expect(p.qualificacao).toBe('Maria Souza, inscrito(a) no CPF nº 529.982.247-25, residente e domiciliado(a) em QNA 10, 12 – Taguatinga Norte – Brasília/DF – CEP 72110-100')
    expect(p.responsavel).toBe('Maria Souza')
    expect(p.responsavelCpf).toBe('529.982.247-25')
    expect(p.pendencias).toEqual([])
  })

  it('pessoa física com procurador cita o representante no texto e na assinatura', () => {
    const p = dadosDoProponente({ ...empresa, tipo: 'PESSOA_FISICA', name: 'Maria Souza', cnpj: null, cpf: '52998224725', responsavel: 'Carlos Lima', responsavelCpf: null, responsavelCargo: null })
    expect(p.qualificacao).toContain('neste ato representado(a) por Carlos Lima, portador(a) do CPF nº [preencher: CPF do representante]')
    expect(p.responsavel).toBe('Carlos Lima')
    expect(p.pendencias).toEqual(['CPF do representante'])
  })
})

describe('propostaComercial', () => {
  const p = dadosDoProponente(empresa)
  const itens = [
    { numero: 1, descricao: 'ALMÔNDEGAS', unidade: 'kg', quantidade: 5440, precoUnitario: 41.5 },
    { numero: 2, descricao: 'CARNE BOVINA 1ª', unidade: 'kg', quantidade: 10, precoUnitario: null },
  ]

  it('monta a tabela com totais, valor por extenso e a qualificação real', () => {
    const r = propostaComercial(p, certame, itens, { validadeDias: 60, prazoDeEntrega: '5 dias úteis', condicoesDePagamento: '' }, quando)
    expect(r.total).toBe(225760)
    const tabela = r.documento.blocos.find((b) => b.tipo === 'tabela')
    expect(tabela && tabela.tipo === 'tabela' && tabela.linhas[0][5]).toBe('225.760,00')
    const textoTodo = JSON.stringify(r.documento)
    expect(textoTodo).toContain('duzentos e vinte e cinco mil, setecentos e sessenta reais')
    expect(textoTodo).toContain('CNPJ nº 04.003.376/0001-00')
    expect(textoTodo).toContain('Pregão Eletrônico nº 02391654000119-1-000595/2026')
    expect(textoTodo).toContain('Brasília, 14 de outubro de 2026.')
    expect(r.pendencias).toContain('preço de venda de 1 item(ns) no estudo de custos')
  })

  it('o documento gerado passa na própria validação de entrada', () => {
    const r = propostaComercial(p, certame, itens, { validadeDias: 60, prazoDeEntrega: '', condicoesDePagamento: '' }, quando)
    expect(documentoSchema.safeParse(r.documento).success).toBe(true)
  })
})

describe('declaracoes', () => {
  it('gera só as escolhidas, uma por página, com assinatura em cada', () => {
    const r = declaracoes(dadosDoProponente(empresa), certame, ['menor', 'me-epp'], quando)
    expect(r.documento.blocos.filter((b) => b.tipo === 'quebra')).toHaveLength(1)
    expect(r.documento.blocos.filter((b) => b.tipo === 'assinatura')).toHaveLength(2)
    expect(JSON.stringify(r.documento)).toContain('menor de 18 (dezoito) anos')
  })

  it('todos os modelos existem e citam a empresa', () => {
    const r = declaracoes(dadosDoProponente(empresa), certame, IDS_DE_DECLARACAO, quando)
    expect(r.documento.blocos.filter((b) => b.tipo === 'titulo')).toHaveLength(IDS_DE_DECLARACAO.length)
  })
})

describe('documentoSchema', () => {
  it('recusa documento gigante', () => {
    const blocos = Array.from({ length: 201 }, () => ({ tipo: 'paragrafo', texto: 'x' }))
    expect(documentoSchema.safeParse({ tipo: 'proposta', titulo: 'x', blocos }).success).toBe(false)
    expect(documentoSchema.safeParse({ tipo: 'proposta', titulo: 'x', blocos: [{ tipo: 'paragrafo', texto: 'x'.repeat(5001) }] }).success).toBe(false)
  })
})

describe('papel timbrado', () => {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(400, 16)
  png.writeUInt32BE(100, 20)

  it('lê as dimensões do PNG e encaixa na caixa mantendo a proporção', () => {
    expect(dimensoesDaImagem(png)).toEqual({ largura: 400, altura: 100 })
    expect(encaixar({ largura: 400, altura: 100 }, 170, 52)).toEqual({ largura: 170, altura: 43 })
  })

  it('gera PDF e Word válidos com os dados da empresa', async () => {
    const proponente = dadosDoProponente(empresa)
    const { documento } = propostaComercial(proponente, certame, [{ numero: 1, descricao: 'Item', unidade: 'un', quantidade: 2, precoUnitario: 10 }], { validadeDias: 60, prazoDeEntrega: '', condicoesDePagamento: '' }, quando)
    const timbrado = { proponente, logo: null }

    const pdf = await renderizarPdf(documento, timbrado)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    const docx = await renderizarDocx(documento, timbrado)
    const arquivos = unzipSync(new Uint8Array(docx))
    expect(Object.keys(arquivos)).toContain('word/document.xml')
    expect(strFromU8(arquivos['word/document.xml'])).toContain('PROPOSTA COMERCIAL')
    const cabecalhos = Object.keys(arquivos).filter((n) => n.startsWith('word/header'))
    expect(cabecalhos.some((n) => strFromU8(arquivos[n]).includes('H&amp;M Engenharia'))).toBe(true)
  })
})

describe('logomarca hostil', () => {
  const pedaco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4)
    tamanho.writeUInt32BE(dados.length)
    return Buffer.concat([tamanho, Buffer.from(tipo, 'latin1'), dados, Buffer.alloc(4)])
  }
  const montarPng = (largura: number, altura: number, tipoDeCor: number, idat: Buffer) => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(largura, 0)
    ihdr.writeUInt32BE(altura, 4)
    ihdr[8] = 8
    ihdr[9] = tipoDeCor
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', idat), pedaco('IEND', Buffer.alloc(0))])
  }
  const legitimo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

  it('aceita PNG íntegro e recusa, sem derrubar o processo, os PNGs que travavam o pdfkit', async () => {
    expect(imagemLegivel(legitimo)).toBe(true)
    expect(imagemLegivel(montarPng(1, 1, 6, Buffer.from('lixo-nao-zlib')))).toBe(false)
    expect(imagemLegivel(montarPng(1, 1, 6, deflateSync(Buffer.from([9, 1, 2, 3, 4]))))).toBe(false)
    expect(imagemLegivel(montarPng(60000, 60000, 6, deflateSync(Buffer.alloc(10))))).toBe(false)
    expect(imagemLegivel(montarPng(2, 1, 6, deflateSync(Buffer.alloc(3))))).toBe(false)
    expect(imagemLegivel(montarPng(1, 1, 6, deflateSync(Buffer.from([0, 1, 2, 3, 4]))))).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
  })

  it('recusa documento com quebras de página ou texto em excesso', () => {
    const base = { tipo: 'proposta' as const, titulo: 'Proposta' }
    expect(documentoSchema.safeParse({ ...base, blocos: Array.from({ length: 41 }, () => ({ tipo: 'quebra' })) }).success).toBe(false)
    expect(documentoSchema.safeParse({ ...base, blocos: Array.from({ length: 41 }, () => ({ tipo: 'paragrafo', texto: 'x'.repeat(5000) })) }).success).toBe(false)
    expect(documentoSchema.safeParse({ ...base, blocos: Array.from({ length: 8 }, () => ({ tipo: 'quebra' })) }).success).toBe(true)
  })
})

describe('proposta readequada', () => {
  const itens = [
    { id: 'a', quantidade: 10, precoBase: 3800 },
    { id: 'b', quantidade: 20, precoBase: 450 },
  ]

  it('distribui o lance global na proporção dos preços originais, sem passar do lance', () => {
    const r = readequarPrecos(itens, { global: 44_000.01, porItem: {} })
    expect(r.total).toBe(44_000)
    expect(r.precos).toEqual({ a: 3557.46, b: 421.27 })
    expect(r.pendencias).toEqual([])
  })

  it('fecha o total exato quando há item que absorve os centavos', () => {
    const r = readequarPrecos([...itens, { id: 'c', quantidade: 1, precoBase: 120 }], { global: 44_000.01, porItem: {} })
    expect(r.total).toBe(44_000.01)
  })

  it('nunca passa do lance, mesmo quando o centavo não divide', () => {
    const r = readequarPrecos([{ id: 'x', quantidade: 3, precoBase: 10 }], { global: 100, porItem: {} })
    expect(r.precos.x).toBe(33.33)
    expect(r.total).toBeLessThanOrEqual(100)
  })

  it('usa o lance de cada item quando a disputa foi por item', () => {
    const r = readequarPrecos(itens, { global: null, porItem: { a: 35_000, b: 8_000 } })
    expect(r.precos).toEqual({ a: 3500, b: 400 })
    expect(r.total).toBe(43_000)
  })

  it('aponta o que falta em vez de inventar preço', () => {
    expect(readequarPrecos(itens, { global: null, porItem: { a: 35_000 } }).pendencias).toEqual(['lance final de 1 item(ns)'])
    expect(readequarPrecos([{ id: 'x', quantidade: 1, precoBase: null }], { global: 100, porItem: {} }).pendencias[0]).toContain('preço de venda')
  })

  it('o texto da proposta diz que ela foi readequada ao lance final', () => {
    const { documento } = propostaComercial(dadosDoProponente(empresa), certame, [{ numero: 1, descricao: 'Item', unidade: 'un', quantidade: 2, precoUnitario: 49.5 }], { validadeDias: 60, prazoDeEntrega: '', condicoesDePagamento: '', lanceFinal: 99 }, quando)
    expect(documento.titulo).toBe('Proposta comercial readequada')
    expect(JSON.stringify(documento.blocos)).toContain('readequada ao valor final de R$ 99,00 (noventa e nove reais)')
  })
})
