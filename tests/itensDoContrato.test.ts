import { describe, expect, it } from 'vitest'
import { compilarNichosParaItens, compraDoControle, itemDoPncp, linkDaCompra, nichosDoItem, separarItens, valorHomologadoDosResultados, type ItemDaCompra } from '../src/lib/itensDoContrato'
import { CATALOGO_DE_NICHOS } from '../src/lib/obrasEGanhadores'

const doCatalogo = (...ids: string[]) =>
  compilarNichosParaItens(
    ids.map((id) => {
      const n = CATALOGO_DE_NICHOS.find((x) => x.id === id)!
      return { nome: n.nome, alvos: n.alvos, exclusoes: n.exclusoes }
    })
  )

const item = (numero: number, descricao: string, extra: Partial<ItemDaCompra> = {}): ItemDaCompra => ({
  numero,
  descricao,
  complemento: null,
  quantidade: 1,
  unidade: 'UN',
  valorEstimado: 100,
  valorHomologado: null,
  temResultado: false,
  ...extra,
})

describe('compraDoControle', () => {
  it('lê o numeroControlePNCP da compra', () => {
    expect(compraDoControle('46362661000168-1-002174/2026')).toEqual({ cnpj: '46362661000168', ano: 2026, sequencial: 2174 })
    expect(linkDaCompra({ cnpj: '46362661000168', ano: 2026, sequencial: 2174 })).toBe('https://pncp.gov.br/app/editais/46362661000168/2026/2174')
  })
  it('recusa o que não é controle de compra', () => {
    expect(compraDoControle(null)).toBeNull()
    expect(compraDoControle('')).toBeNull()
    expect(compraDoControle('4636266100016-1-002174/2026')).toBeNull()
    expect(compraDoControle('46362661000168-1-000000/2026')).toBeNull()
    expect(compraDoControle('46362661000168-1-1/2026/../x')).toBeNull()
  })
})

describe('nichosDoItem', () => {
  const nichos = doCatalogo('eletrica', 'pintura', 'terraplenagem', 'paisagismo')
  it('casa pelas palavras de item do catálogo', () => {
    expect(nichosDoItem('Disjuntor termomagnético bipolar 40A', nichos)).toEqual(['Instalações elétricas'])
    expect(nichosDoItem('INSTALAÇÕES ELÉTRICAS - QUADRO DE DISTRIBUIÇÃO', nichos)).toEqual(['Instalações elétricas'])
    expect(nichosDoItem('Pintura látex acrílica em paredes, duas demãos', nichos)).toEqual(['Pintura'])
    expect(nichosDoItem('Escavação mecanizada de vala', nichos)).toEqual(['Terraplenagem e máquinas'])
  })
  it('palavra genérica de obra não marca o item', () => {
    // "construção" faz o CONTRATO aparecer para elétrica, mas o item "Construção de praça" não é elétrico.
    expect(nichosDoItem('CONSTRUCAO PRACA', doCatalogo('eletrica', 'pintura'))).toEqual([])
    expect(nichosDoItem('CONSTRUCAO PRACA', doCatalogo('paisagismo'))).toEqual(['Paisagismo e jardinagem'])
  })
  it('poste de vôlei não é item elétrico', () => {
    expect(nichosDoItem('7.2 POSTE DE VÔLEI OU PETECA OFICIAL PAR COM REDE', doCatalogo('eletrica'))).toEqual([])
    expect(nichosDoItem('8.3 REFLETOR DE LED', doCatalogo('eletrica'))).toEqual(['Instalações elétricas'])
    expect(nichosDoItem('TRAVE OFICIAL DE FUTSAL/HANDEBOL', doCatalogo('eletrica'))).toEqual([])
    expect(nichosDoItem('Tabela de basquete em acrílico', doCatalogo('eletrica'))).toEqual([])
  })
  it('poste de vôlei não é elétrico nem quando a empresa salvou "poste" no nicho', () => {
    const salvo = compilarNichosParaItens([{ nome: 'Instalações elétricas', alvos: ['poste', 'iluminacao'], exclusoes: [] }])
    expect(nichosDoItem('7.2 POSTE DE VÔLEI OU PETECA OFICIAL PAR COM REDE', salvo)).toEqual([])
    expect(nichosDoItem('POSTE DE AÇO CÔNICO CONTÍNUO RETO', salvo)).toEqual(['Instalações elétricas'])
  })
  it('poste elétrico de verdade continua elétrico', () => {
    const eletrica = doCatalogo('eletrica')
    for (const d of ['POSTE DE AÇO CÔNICO CONTÍNUO RETO', 'Poste de concreto duplo T 9 m', 'POSTE DE ILUMINAÇÃO', 'Poste para luminária', 'Poste padrão de entrada de energia']) {
      expect(nichosDoItem(d, eletrica)).toEqual(['Instalações elétricas'])
    }
  })
  it('outras palavras de duplo sentido em item', () => {
    expect(nichosDoItem('Condutor vertical de água pluvial em PVC 100 mm', doCatalogo('eletrica'))).toEqual([])
    expect(nichosDoItem('Cabo condutor de cobre 2,5 mm²', doCatalogo('eletrica'))).toEqual(['Instalações elétricas'])
    expect(nichosDoItem('LOCAÇÃO CONVENCIONAL DE OBRA, UTILIZANDO GABARITO', doCatalogo('equipamentos'))).toEqual([])
    expect(nichosDoItem('Locação de andaime metálico', doCatalogo('equipamentos'))).toEqual(['Locação de equipamentos'])
    expect(nichosDoItem('Porta-lâmpada de porcelana E27', doCatalogo('esquadrias'))).toEqual([])
    expect(nichosDoItem('Instalação de canteiro de obras', doCatalogo('paisagismo'))).toEqual([])
  })
  it('respeita exclusões do nicho', () => {
    expect(nichosDoItem('Iluminação cênica para evento', doCatalogo('eletrica'))).toEqual([])
  })
  it('nicho próprio da empresa usa as palavras dela', () => {
    const proprio = compilarNichosParaItens([{ nome: 'Poço artesiano', alvos: ['poço artesiano', 'construção'], exclusoes: [] }])
    expect(nichosDoItem('Perfuração de poço artesiano 120 m', proprio)).toEqual(['Poço artesiano'])
    expect(nichosDoItem('Construção do muro', proprio)).toEqual([])
  })
})

describe('separarItens', () => {
  it('itens do nicho primeiro, mantendo a ordem da compra', () => {
    const r = separarItens([item(1, 'Mobilização de canteiro'), item(2, 'Luminária LED 40W'), item(3, 'Tinta acrílica'), item(4, 'Administração local')], doCatalogo('eletrica'))
    expect(r.doNicho.map((i) => i.numero)).toEqual([2])
    expect(r.doNicho[0].nichos).toEqual(['Instalações elétricas'])
    expect(r.outros.map((i) => i.numero)).toEqual([1, 3, 4])
  })
  it('usa o complemento do item também', () => {
    const r = separarItens([item(1, 'Serviço comum de engenharia', { complemento: 'Instalação de eletroduto e cabos' })], doCatalogo('eletrica'))
    expect(r.doNicho).toHaveLength(1)
  })
})

describe('itemDoPncp', () => {
  it('converte o item cru do PNCP (formato real)', () => {
    expect(
      itemDoPncp({ numeroItem: 1, descricao: 'CONSTRUCAO PRACA', quantidade: 1.0, unidadeMedida: 'NAO UTILIZADO', valorTotal: 250023.17, orcamentoSigiloso: false, temResultado: true, informacaoComplementar: null })
    ).toEqual({ numero: 1, descricao: 'CONSTRUCAO PRACA', complemento: null, quantidade: 1, unidade: null, valorEstimado: 250023.17, valorHomologado: null, temResultado: true })
  })
  it('orçamento sigiloso não mostra valor; item sem descrição é descartado', () => {
    expect(itemDoPncp({ numeroItem: 2, descricao: 'Cabo', valorTotal: 10, orcamentoSigiloso: true, unidadeMedida: 'M' })?.valorEstimado).toBeNull()
    expect(itemDoPncp({ numeroItem: 3, descricao: '  ' })).toBeNull()
    expect(itemDoPncp({ descricao: 'x' })).toBeNull()
  })
})

describe('valorHomologadoDosResultados', () => {
  const resultados = [
    { niFornecedor: '11222333000181', valorTotalHomologado: 1000, dataCancelamento: null },
    { niFornecedor: '99888777000166', valorTotalHomologado: 500, dataCancelamento: null },
    { niFornecedor: '11222333000181', valorTotalHomologado: 300, dataCancelamento: '2026-01-01' },
  ]
  it('soma só o do ganhador do contrato, sem os cancelados', () => {
    expect(valorHomologadoDosResultados(resultados, '11.222.333/0001-81')).toBe(1000)
    expect(valorHomologadoDosResultados(resultados)).toBe(1500)
  })
  it('item que foi para outra empresa fica sem valor', () => {
    expect(valorHomologadoDosResultados(resultados, '00000000000191')).toBeNull()
    expect(valorHomologadoDosResultados('x')).toBeNull()
  })
})
