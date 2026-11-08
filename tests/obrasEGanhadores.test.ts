import { describe, expect, it } from 'vitest'
import { CATALOGO_DE_NICHOS, compilarNichos, limparPalavras, mensagemDeApresentacao, naRegiao, nichosDoContrato, regiaoValida } from '../src/lib/obrasEGanhadores'
import { contratoParaGravar, diasParaColetar, textoParaBusca } from '../src/services/contratosPublicosColeta'
import { linkDoContrato } from '../src/api/routes/obras'
import { normalize } from '../src/lib/geoService'

const nicho = (id: string) => {
  const n = CATALOGO_DE_NICHOS.find((x) => x.id === id)!
  return compilarNichos([{ nome: n.nome, alvos: n.alvos, exclusoes: n.exclusoes }])
}
const casa = (objeto: string, id: string) => nichosDoContrato({ objetoNorm: normalize(objeto) }, nicho(id)).length > 0

describe('nichosDoContrato', () => {
  it('obra de construção pede elétrica, hidráulica e pintura', () => {
    const obra = 'CONTRATACAO DE EMPRESA ESPECIALIZADA NA EXECUCAO DE OBRA DE CONSTRUCAO DA ARENA ESPORTIVA BABILONIA'
    expect(casa(obra, 'eletrica')).toBe(true)
    expect(casa(obra, 'hidraulica')).toBe(true)
    expect(casa(obra, 'pintura')).toBe(true)
  })

  it('estrada rural casa com terraplenagem, não com climatização', () => {
    const estrada = 'Execução de obra de adequação e estabilização de estrada rural'
    expect(casa(estrada, 'terraplenagem')).toBe(true)
    expect(casa(estrada, 'climatizacao')).toBe(false)
  })

  it('terceirização de pessoal não serve, mesmo citando "saneamento" no nome do órgão', () => {
    const t = 'Contratação de empresa com dedicação exclusiva de mão de obra para apoio administrativo junto à Agência Reguladora de Energia e Saneamento, ajudante de manutenção predial'
    expect(casa(t, 'hidraulica')).toBe(false)
    expect(nichosDoContrato({ objetoNorm: normalize('Reforma da escola'), categoria: 'Mão de Obra' }, nicho('pintura'))).toEqual([])
  })

  it('"mão de obra" não é obra', () => {
    expect(casa('Prestação de serviços de mão de obra terceirizada de recepção', 'mao-de-obra')).toBe(false)
  })

  it('compra de material foi ganha por fornecedor: não serve', () => {
    expect(casa('Aquisição de materiais de construção para reforma de escolas', 'pintura')).toBe(false)
    expect(casa('Registro de Preços para eventuais aquisições de materiais básicos de construção civil', 'pintura')).toBe(false)
    expect(casa('Serviços de iluminação cênica e sonorização para eventos', 'eletrica')).toBe(false)
    expect(casa('Fornecimento e instalação de ar condicionado com reforma da rede', 'climatizacao')).toBe(true)
  })

  it('palavra de exclusão tira o contrato', () => {
    const [n] = compilarNichos([{ nome: 'Pintura', alvos: ['reforma'], exclusoes: ['telhado'] }])
    expect(nichosDoContrato({ objetoNorm: normalize('Reforma do telhado da escola') }, [n])).toEqual([])
    expect(nichosDoContrato({ objetoNorm: normalize('Reforma da escola') }, [n])).toEqual([{ nome: 'Pintura', palavras: ['reforma'] }])
  })
})

describe('região', () => {
  const vitoria = { lat: -20.3155, lng: -40.3128 }
  it('pelo raio a partir da base', () => {
    const r = naRegiao({ raioKm: 100, ufs: [], base: vitoria }, { uf: 'ES', lat: -20.67, lng: -40.5 }) // Guarapari
    expect(r.dentro).toBe(true)
    expect(r.distanciaKm).toBeGreaterThan(30)
    expect(naRegiao({ raioKm: 100, ufs: [], base: vitoria }, { uf: 'SP', lat: -23.55, lng: -46.63 }).dentro).toBe(false)
  })
  it('pelos estados, mesmo longe', () => {
    expect(naRegiao({ raioKm: 50, ufs: ['SP'], base: vitoria }, { uf: 'SP', lat: -23.55, lng: -46.63 }).dentro).toBe(true)
  })
  it('valida a configuração', () => {
    expect(regiaoValida({ raioKm: 100, ufs: [], base: null })).toMatch(/cidade da sua base/)
    expect(regiaoValida({ raioKm: null, ufs: [], base: vitoria })).toMatch(/raio/)
    expect(regiaoValida({ raioKm: null, ufs: ['ES'], base: null })).toBeNull()
  })
})

describe('limparPalavras', () => {
  it('tira repetidas, curtas e espaços', () => {
    expect(limparPalavras(['  Reforma ', 'reforma', 'ab', 'Construção', 'construcao'])).toEqual(['Reforma', 'Construção'])
  })
})

describe('mensagemDeApresentacao', () => {
  it('diz de onde veio o contato e o que a empresa oferece', () => {
    const t = mensagemDeApresentacao({
      fornecedor: 'J JUNIOR ENGENHARIA', orgao: 'Prefeitura de Valparaíso', objeto: 'Construção da arena', municipio: 'Valparaíso de Goiás', uf: 'GO',
      valor: 1215000, minhaEmpresa: 'H&M Engenharia', minhaCidade: 'Vitória/ES', meusNichos: ['Instalações elétricas'], meuContato: '(27) 99999-0000',
    })
    expect(t).toContain('Olá, equipe da J JUNIOR ENGENHARIA.')
    expect(t).toContain('em Valparaíso de Goiás/GO')
    expect(t).toMatch(/R\$\s1\.215\.000/)
    expect(t).toContain('trabalhamos com instalações elétricas')
    expect(t).toContain('Fico à disposição: (27) 99999-0000.')
  })
})

const BRUTO = {
  numeroControlePNCP: '07854402000100-2-000123/2026',
  numeroControlePncpCompra: '07854402000100-1-000050/2026',
  orgaoEntidade: { cnpj: '07854402000100', razaoSocial: 'COMANDO DA 2ª REGIÃO MILITAR' },
  unidadeOrgao: { ufSigla: 'SP', municipioNome: 'São Paulo', codigoIbge: '3550308', nomeUnidade: '2º B LOG' },
  tipoPessoa: 'PJ',
  niFornecedor: '12.345.678/0001-90',
  nomeRazaoSocialFornecedor: 'ESTEVES & AMORIM CONSTRUTORA LTDA',
  objetoContrato: 'CONTRATAÇÃO DA CONSTRUÇÃO DO PAVILHÃO DO 2º B LOG, LOCALIZADO NA AV. SD. PASSARINHO, 3900, CAMPINAS/SP',
  valorGlobal: 9121174.91,
  categoriaProcesso: { nome: 'Obras' },
  tipoContrato: { nome: 'Contrato (termo inicial)' },
  dataAssinatura: '2026-11-05',
  dataVigenciaFim: '2027-11-05',
  dataPublicacaoPncp: '2026-11-06T10:00:00',
  receita: false,
}

describe('contratoParaGravar', () => {
  it('usa a cidade citada no objeto, não a do órgão', () => {
    const c = contratoParaGravar(BRUTO)!
    expect(c.municipio).toBe('Campinas')
    expect(c.uf).toBe('SP')
    expect(c.municipioIbge).toBe('3509502')
    expect(c.lat).toBeCloseTo(-22.9, 0)
    expect(c.fornecedorNi).toBe('12345678000190')
    expect(c.objetoNorm).toContain('construcao do pavilhao')
  })
  it('sem cidade no objeto, fica a do órgão', () => {
    const c = contratoParaGravar({ ...BRUTO, objetoContrato: 'Reforma do pavilhão' })!
    expect(c.municipio).toBe('São Paulo')
    expect(c.municipioIbge).toBe('3550308')
  })
  it('descarta compra, pessoa física, valor pequeno e receita', () => {
    expect(contratoParaGravar({ ...BRUTO, categoriaProcesso: { nome: 'Compras' } })).toBeNull()
    expect(contratoParaGravar({ ...BRUTO, tipoPessoa: 'PF', niFornecedor: '12345678901' })).toBeNull()
    expect(contratoParaGravar({ ...BRUTO, valorGlobal: 1200 })).toBeNull()
    expect(contratoParaGravar({ ...BRUTO, receita: true })).toBeNull()
  })
})

describe('textoParaBusca', () => {
  it('conserta o "?" no lugar do "ã" e a terceirização deixa de casar', () => {
    const t = textoParaBusca('Contratac?o de empresa, com dedicac?o exclusiva de m?o de obra, junto à Agência de Saneamento')
    expect(t).toContain('contratacao de empresa, com dedicacao exclusiva de mao de obra')
    expect(nichosDoContrato({ objetoNorm: t }, nicho('hidraulica'))).toEqual([])
    expect(textoParaBusca('Qual o prazo? 30 dias')).toBe('qual o prazo? 30 dias')
  })
})

describe('diasParaColetar', () => {
  it('hoje e ontem sempre; antes, só o que falta', () => {
    const dias = diasParaColetar('2026-11-08', new Set(['2026-11-07', '2026-11-06', '2026-11-05']))
    expect(dias.slice(0, 3)).toEqual(['2026-11-08', '2026-11-07', '2026-11-04'])
    expect(dias).not.toContain('2026-11-06')
    expect(dias).toHaveLength(59)
  })
})

describe('linkDoContrato', () => {
  it('monta o link do PNCP', () => {
    expect(linkDoContrato('07854402000100-2-000123/2026')).toBe('https://pncp.gov.br/app/contratos/07854402000100/2026/123')
    expect(linkDoContrato('qualquer')).toBeNull()
  })
})
