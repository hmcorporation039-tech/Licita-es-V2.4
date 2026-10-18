import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ListaDaFamemIlegivel,
  MateriaDaFamem,
  PublicacaoDaFamem,
  avaliarPublicacao,
  avisosDaPublicacao,
  lerListaDaFamem,
  lerPublicacaoDaFamem,
  municipioDaPublicacao,
  textoParaOParser,
  textoSemDadosPessoais,
  urlDaPublicacao,
} from '../src/services/famemParser'
import { NOMES_DOS_MUNICIPIOS_DO_MARANHAO } from '../src/services/famemMunicipios'

const PASTA = join(__dirname, 'fixtures', 'famem')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const AGORA = new Date('2026-10-18T15:00:00Z')

const LISTA = lerListaDaFamem(fixture('lista-de-publicacoes.json'))
const publicacao = (id: string): PublicacaoDaFamem => LISTA.publicacoes.find((p) => p.id === id)!
const materia = (id: string): MateriaDaFamem => lerPublicacaoDaFamem(fixture(`publicacao-${id}.html`))!

function avisosDaFixture(id: string, agora: Date = AGORA) {
  const pub = publicacao(id)
  return avisosDaPublicacao(materia(id), pub, municipioDaPublicacao(pub.entidade)!, agora)
}

describe('FAMEM — lista de publicações', () => {
  it('lê as publicações do JSON do DataTables', () => {
    expect(LISTA.total).toBe(11)
    expect(LISTA.publicacoes).toHaveLength(11)
    expect(publicacao('713794')).toEqual({
      id: '713794',
      publicadaEm: '2026-10-16',
      edicao: '3959',
      titulo: 'AVISO DE LICITAÇÃO PREGÃO ELETRÔNICO Nº 010/2026 - SRP',
      categoria: 'AVISO DE LICITAÇÃO',
      entidade: 'Prefeitura Municipal de Feira Nova Do Maranhão',
    })
  })

  it('a lista vazia que o site devolve sem a sessão é lida como vazia', () => {
    expect(lerListaDaFamem('{"draw":"1","recordsTotal":0,"recordsFiltered":0,"data":[]}')).toEqual({ publicacoes: [], total: 0 })
  })

  it('resposta que não é a lista (página de bloqueio, JSON diferente) é recusada', () => {
    expect(() => lerListaDaFamem('<html><body>Acesso negado</body></html>')).toThrow(ListaDaFamemIlegivel)
    expect(() => lerListaDaFamem('{"erro":"x"}')).toThrow(ListaDaFamemIlegivel)
  })

  it('ignora linhas sem identificador numérico ou sem data', () => {
    const lista = lerListaDaFamem({ recordsTotal: 3, data: [{ TDC_ID: 'abc', TDO_DT_GERACAO: '2026-10-16 05:00:01' }, { TDC_ID: '1', TDO_DT_GERACAO: '' }, null] })
    expect(lista.publicacoes).toEqual([])
  })
})

describe('FAMEM — escolha das publicações pela categoria e pelo título', () => {
  it('avisos de pregão, concorrência e credenciamento são lidos', () => {
    for (const id of ['713794', '713802', '713878', '713683']) expect(avaliarPublicacao(publicacao(id))).toBe('aviso')
  })

  it('dispensa e contratação direta ficam de fora sem baixar a matéria', () => {
    expect(avaliarPublicacao(publicacao('713901'))).toBe('contratacaoDireta')
    expect(avaliarPublicacao(publicacao('712885'))).toBe('contratacaoDireta')
  })

  it('ratificação, portaria, extrato e resenha de termo não são avisos', () => {
    for (const id of ['713797', '713809', '713785', '713124']) expect(avaliarPublicacao(publicacao(id))).toBe('outroAto')
    expect(avaliarPublicacao({ categoria: 'AVISO DE HOMOLOGAÇÃO', titulo: 'PREGÃO ELETRÔNICO Nº 12/2026' })).toBe('outroAto')
    expect(avaliarPublicacao({ categoria: 'AVISO DE SUSPENSÃO ', titulo: 'AVISO DE SUSPENSÃO DO PREGÃO Nº 3/2026' })).toBe('outroAto')
  })
})

describe('FAMEM — município pelo IBGE com o nome oficial', () => {
  it('troca o nome da entidade pelo nome oficial do IBGE', () => {
    expect(municipioDaPublicacao('Prefeitura Municipal de Feira Nova Do Maranhão')).toEqual({ ibge: '2104073', nome: 'Feira Nova do Maranhão' })
    expect(municipioDaPublicacao('Prefeitura Municipal de São João Do Paraíso')).toEqual({ ibge: '2111052', nome: 'São João do Paraíso' })
    expect(municipioDaPublicacao('Câmara Municipal de Balsas')).toEqual({ ibge: '2101400', nome: 'Balsas' })
  })

  it('consórcio e entidade sem município ficam sem município', () => {
    expect(municipioDaPublicacao('Consórcio Intermunicipal de Saúde da Região Tocantina')).toBeNull()
    expect(municipioDaPublicacao('Federação dos Municípios do Estado do Maranhão')).toBeNull()
  })

  it('a tabela tem os 217 municípios do Maranhão', () => {
    const codigos = Object.keys(NOMES_DOS_MUNICIPIOS_DO_MARANHAO)
    expect(codigos).toHaveLength(217)
    expect(codigos.every((c) => /^21\d{5}$/.test(c))).toBe(true)
  })
})

describe('FAMEM — página da publicação', () => {
  it('lê entidade, edição, data, código identificador, título e corpo', () => {
    const lida = materia('713794')
    expect(lida).toMatchObject({
      entidade: 'Prefeitura Municipal de Feira Nova Do Maranhão',
      titulo: 'AVISO DE LICITAÇÃO PREGÃO ELETRÔNICO Nº 010/2026 - SRP',
      publicadaEm: '2026-10-16',
      edicao: '3959',
      codigoIdentificador: 'b641ef2995693148acdb51d79524543b',
    })
    expect(lida.texto).toContain('Abertura no dia 04 de novembro de 2026 às 08h10m')
    expect(lida.texto).not.toContain('Código Identificador')
  })

  it('a página de um identificador que não existe não vira matéria', () => {
    expect(lerPublicacaoDaFamem(fixture('publicacao-inexistente.html'))).toBeNull()
    expect(lerPublicacaoDaFamem('<html><body>manutenção</body></html>')).toBeNull()
  })
})

describe('FAMEM — dados pessoais', () => {
  it('tira e-mail, telefone e a assinatura depois da data do fecho', () => {
    const godofredo = textoSemDadosPessoais(materia('713802').texto)
    expect(godofredo).not.toMatch(/FULANO|exemplo\.com|0000-0000/)
    expect(godofredo).toContain('às 10:00 horas do dia 29 de outubro de 2026')
    expect(godofredo.trimEnd().endsWith('Godofredo Viana (MA), 14 de outubro de 2026.')).toBe(true)

    const balsas = textoSemDadosPessoais(materia('713878').texto)
    expect(balsas).not.toMatch(/Fulana|Secretária Municipal de Licitações e Contratos$|exemplo\.com/)
    expect(balsas).toContain('10 de dezembro de 2026, às 09h00min')
  })

  it('tira CPF e telefone com rótulo', () => {
    const texto = 'Pregoeiro CPF 123.456.789-09, telefone: (98) 3521-1234 e Fone 9821095400. Sessão em 30/10/2026 às 9h.'
    const limpo = textoSemDadosPessoais(texto)
    expect(limpo).not.toMatch(/123\.456|3521|9821095400/)
    expect(limpo).toContain('Sessão em 30/10/2026 às 9h.')
  })

  it('numa matéria com vários avisos, tira a assinatura de cada um', () => {
    const texto =
      'AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 40/2026. Objeto: gêneros alimentícios. Sessão em 26/10/2026 às 09h. Penalva/MA, 08 de outubro de 2026. Fulana de Tal/Pregoeira.\n' +
      'AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 41/2026. Objeto: coleta de resíduos. Sessão em 29/10/2026 às 11h. Penalva/MA, 08 de outubro de 2026. Fulana de Tal/Pregoeira.'
    const limpo = textoSemDadosPessoais(texto)
    expect(limpo).not.toContain('Fulana')
    expect(limpo).toContain('PREGÃO ELETRÔNICO Nº 41/2026')
    expect(limpo.match(/Penalva\/MA, 08 de outubro de 2026\./g)).toHaveLength(2)
  })

  it('fecho com data numérica ou "aos N dias de" também corta a assinatura', () => {
    const numerica = textoSemDadosPessoais('Sessão em 23/10/2026 às 09h30.\nCajari (MA), 09/10/2026.\nFulana de Tal\nSecretária Municipal de Administração\nDecreto nº 58/2022')
    expect(numerica).toBe('Sessão em 23/10/2026 às 09h30.\nCajari (MA), 09/10/2026.')
    const porExtenso = textoSemDadosPessoais('Sessão em 30/10/2026 às 9h. Carolina - MA, aos 05 dias de outubro de 2026.\nFulano de Tal\nPregoeiro')
    expect(porExtenso).toBe('Sessão em 30/10/2026 às 9h. Carolina - MA, aos 05 dias de outubro de 2026.')
  })

  it('não corta o texto quando depois da data ainda vem horário', () => {
    const texto = 'AVISO DE LICITAÇÃO\nPregão nº 1/2026. Objeto: compra de pneus. Abertura - 30 de outubro de 2026, às 9h00, no site.'
    expect(textoSemDadosPessoais(texto)).toBe(texto)
  })
})

describe('FAMEM — avisos da publicação', () => {
  it('pregão eletrônico em um parágrafo só (Feira Nova do Maranhão)', () => {
    const r = avisosDaFixture('713794')
    expect(r).toMatchObject({ descartadosPorPncp: 0, semDataDaSessao: 0, sessaoJaPassou: 0, contratacoesDiretas: 0 })
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t).toMatchObject({
      fonte: 'FAMEM',
      fonteId: 'FAMEM-2104073:PREGAO:10-2026',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'MA',
      municipio: 'Feira Nova do Maranhão',
      municipioIbge: '2104073',
      orgao: 'Prefeitura Municipal de Feira Nova do Maranhão',
      numeroControle: 'Pregão Eletrônico nº 10/2026',
      linkEdital: 'https://feiranovadomaranhao.ma.gov.br/',
    })
    expect(t.objeto).toMatch(/^Registro de preços para futura e eventual Contratação de empresa especializada em serviço de engenharia/)
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-04T11:10:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-16T15:00:00.000Z')
    expect(t.rawJson).toMatchObject({ publicacao: '713794', codigoIdentificador: 'b641ef2995693148acdb51d79524543b', categoria: 'AVISO DE LICITAÇÃO', gazetteUrl: urlDaPublicacao('713794') })
  })

  it('número depois de dois-pontos ("PREGÃO ELETRÔNICO: Nº 018/2026") e assinatura com nome (Godofredo Viana)', () => {
    const [t] = avisosDaFixture('713802').tenders
    expect(t).toMatchObject({ fonteId: 'FAMEM-2104305:PREGAO:18-2026', modalidade: 'PREGAO_ELETRONICO', municipio: 'Godofredo Viana', linkEdital: 'https://www.comprasgodofredoviana.com.br/' })
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-29T13:00:00.000Z')
    expect(JSON.stringify(t)).not.toMatch(/FULANO|exemplo\.com|0000-0000/)
  })

  it('concorrência presencial com sessão em dezembro (Balsas)', () => {
    const [t] = avisosDaFixture('713878').tenders
    expect(t).toMatchObject({ fonteId: 'FAMEM-2101400:CONCORRENCIA:14-2026', modalidade: 'CONCORRENCIA', municipio: 'Balsas', numeroControle: 'Concorrência nº 14/2026' })
    expect(t.objeto).toMatch(/^Contratação de 01 \(uma\) agência de propaganda/)
    expect(t.aberturaAt?.toISOString()).toBe('2026-12-10T12:00:00.000Z')
    expect(t.linkEdital).toBe(urlDaPublicacao('713878'))
    expect(JSON.stringify(t)).not.toMatch(/Fulana|exemplo\.com/)
  })

  it('número antes do cabeçalho "AVISO DE LICITAÇÃO" e link genérico do gov.br ignorado (Riachão)', () => {
    const [t] = avisosDaFixture('713683').tenders
    expect(t).toMatchObject({ fonteId: 'FAMEM-2109502:PREGAO:90020-2026', modalidade: 'PREGAO_ELETRONICO', municipio: 'Riachão', linkEdital: 'https://www.riachao.ma.gov.br/licitacoes/' })
    expect(t.objeto).toMatch(/^AQUISIÇÃO DE TRATORES E IMPLEMENTOS AGRÍCOLAS/)
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-04T12:00:00.000Z')
    expect(JSON.stringify(t)).not.toMatch(/FULANA|exemplo\.com/)
  })

  it('sessão que já passou não entra como aberta', () => {
    const r = avisosDaFixture('713794', new Date('2026-11-05T12:00:00Z'))
    expect(r.tenders).toEqual([])
    expect(r.sessaoJaPassou).toBe(1)
  })

  it('a sessão de hoje ainda entra, mesmo depois do horário', () => {
    const r = avisosDaFixture('713794', new Date('2026-11-04T20:00:00Z'))
    expect(r.tenders).toHaveLength(1)
    expect(r.tenders[0].situacao).toBe('ENCERRADA')
  })

  it('aviso sem data da sessão e dispensa no texto ficam de fora', () => {
    const pub = publicacao('713794')
    const municipio = municipioDaPublicacao(pub.entidade)!
    const base = materia('713794')
    const semData = avisosDaPublicacao(
      { ...base, texto: 'AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 11/2026\nObjeto: aquisição de material de expediente para as secretarias municipais. O edital está no site.' },
      pub,
      municipio,
      AGORA
    )
    expect(semData).toMatchObject({ semDataDaSessao: 1, tenders: [] })

    const dispensa = avisosDaPublicacao(
      { ...base, titulo: 'AVISO DE DISPENSA ELETRÔNICA Nº 3/2026', texto: 'AVISO DE DISPENSA ELETRÔNICA Nº 3/2026\nObjeto: aquisição de gêneros alimentícios para a merenda escolar. Disputa no dia 30/10/2026 às 09h00.' },
      { ...pub, titulo: 'AVISO DE DISPENSA ELETRÔNICA Nº 3/2026', categoria: 'Aviso de dispensa eletrônica' },
      municipio,
      AGORA
    )
    expect(dispensa).toMatchObject({ contratacoesDiretas: 1, tenders: [] })
  })

  it('o título vira cabeçalho uma vez só, e linhas de cabeçalho no corpo não partem o aviso', () => {
    const texto = textoParaOParser('PREGÃO ELETRÔNICO Nº. 90020/2026\nPROCESSO Nº 1/2026\nAVISO DE LICITAÇÃO\nObjeto: compra.', { titulo: 'PREGÃO ELETRÔNICO Nº. 90020/2026', categoria: 'AVISO DE LICITAÇÃO' }, 'PREGÃO ELETRÔNICO Nº. 90020/2026')
    expect(texto).toBe('AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº. 90020/2026\n\nPROCESSO Nº 1/2026\n· AVISO DE LICITAÇÃO\nObjeto: compra.')
  })

  it('matéria com dois avisos continua com dois blocos', () => {
    const texto = 'AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 1/2026\nObjeto: compra de pneus.\nAVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 2/2026\nObjeto: compra de óleo.'
    expect(textoParaOParser(texto, { titulo: 'AVISOS', categoria: 'AVISO DE LICITAÇÃO' }, 'AVISOS')).toBe(texto)
  })
})
