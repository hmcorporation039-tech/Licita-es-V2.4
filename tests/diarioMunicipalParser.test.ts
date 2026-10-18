import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ASSOCIACOES_SIGPUB,
  CartaoDeMateria,
  MateriaSigpub,
  avisosDaMateria,
  chaveDaMateria,
  lerMateria,
  lerPaginaDeBusca,
  municipioDaEntidade,
  nomeLegivel,
  tituloDeAviso,
  urlDaMateria,
} from '../src/services/diarioMunicipalParser'
import { chaveDeBusca, identificarModalidade } from '../src/services/queridoDiarioParser'
import { equivalenteNoQueridoDiario, janelaDoDiarioMunicipal, parametrosDaBusca } from '../src/services/diarioMunicipalService'
import { ehMesmaLicitacaoDoPncp, mesmoNumeroDoPncp, numeroDoAviso } from '../src/services/queridoDiarioService'
import { dataDaSessao } from '../src/lib/dataDaSessao'

const PASTA = join(__dirname, 'fixtures', 'sigpub')
const pagina = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const AGORA = new Date('2026-10-17T15:00:00Z')
const FAMUP = ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famup')!
const FAMEP = ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famep')!

function cartao(over: Partial<CartaoDeMateria> = {}): CartaoDeMateria {
  return { codigo: '3D2DAFAD', titulo: 'AVISO DE LICITAÇÃO', entidade: 'Município de Caaporã', orgao: 'Licitação', trecho: '', circulacao: '2026-10-16', edicao: '4230', ...over }
}

function materia(arquivo: string, codigo: string): MateriaSigpub {
  const lida = lerMateria(pagina(arquivo), codigo)
  if (!lida) throw new Error(`fixture ${arquivo} sem matéria`)
  return lida
}

describe('SIGPub — associações', () => {
  it('cobre as 13 associações, cada uma com sua UF, na ordem de prioridade pela lacuna de cobertura', () => {
    expect(ASSOCIACOES_SIGPUB.map((a) => a.slug)).toEqual([
      'famup', 'famep', 'amm-mt', 'femurn', 'appm', 'aam', 'arom', 'ama', 'aprece', 'amupe', 'famurs', 'amp', 'amm-mg',
    ])
    expect(new Set(ASSOCIACOES_SIGPUB.map((a) => a.uf)).size).toBe(13)
    expect(ASSOCIACOES_SIGPUB.reduce((soma, a) => soma + a.entidades, 0)).toBe(2645)
  })

  it('monta a URL e a chave da memória pela associação e pelo código da matéria', () => {
    expect(urlDaMateria(FAMEP, 'E4F6493E')).toBe('https://www.diariomunicipal.com.br/famep/materia/E4F6493E')
    expect(chaveDaMateria(FAMEP, 'E4F6493E')).toBe('famep:E4F6493E')
  })
})

describe('SIGPub — página de busca real', () => {
  it('lê os 25 cartões da primeira página com título, entidade, órgão, circulação, edição e código', () => {
    const resultado = lerPaginaDeBusca(pagina('busca-famup-pagina-1.html'))
    expect(resultado.total).toBe(58)
    expect(resultado.temProxima).toBe(true)
    expect(resultado.cartoes).toHaveLength(25)
    expect(resultado.cartoes[0]).toEqual({
      codigo: '3D2DAFAD',
      titulo: 'AVISO DE LICITAÇÃO',
      entidade: 'Município de Caaporã',
      orgao: 'Licitação',
      trecho: expect.stringContaining('PREGÃO ELETRÔNICO Nº 00020/2026'),
      circulacao: '2026-10-16',
      edicao: '4230',
    })
    expect(new Set(resultado.cartoes.map((c) => c.codigo)).size).toBe(25)
  })

  it('reconhece a última página, sem link de próxima', () => {
    const resultado = lerPaginaDeBusca(pagina('busca-famup-pagina-3.html'))
    expect(resultado.total).toBe(58)
    expect(resultado.temProxima).toBe(false)
    expect(resultado.cartoes).toHaveLength(8)
    expect(resultado.cartoes.at(-1)).toMatchObject({ codigo: '21A226F8', circulacao: '2026-10-13', edicao: '4227' })
  })

  it('busca sem resultado devolve lista vazia e total zero', () => {
    expect(lerPaginaDeBusca(pagina('busca-amm-mt-sem-resultado.html'))).toEqual({ cartoes: [], total: 0, temProxima: false })
  })

  it('o filtro pelo título descarta resultado, homologação, adiamento, retificação, ata e fracassada, e mantém os avisos', () => {
    const { cartoes } = lerPaginaDeBusca(pagina('busca-famup-pagina-1.html'))
    const descartados = cartoes.filter((c) => !tituloDeAviso(c.titulo)).map((c) => c.codigo)
    expect(descartados).toEqual(['9CAF21A3', 'E1409E86', 'D1183947', '7B4BD5D3', 'EEA67195', 'A024E566'])
    expect(tituloDeAviso('PREGÃO ELETRÔNICO 033/2026 - PROCESSO ADMINISTRATIVO 130/2026')).toBe(true)
    expect(tituloDeAviso('AVISO DE PRETENSA CONTRATAÇÃO DIRETA')).toBe(true)
    expect(tituloDeAviso('EXTRATO DO EDITAL DO PREGÃO ELETRÔNICO Nº 12/2026')).toBe(true)
    expect(tituloDeAviso('EXTRATO DE CONTRATO Nº 45/2026')).toBe(false)
    expect(tituloDeAviso('PORTARIA Nº 120/2026')).toBe(false)
    expect(tituloDeAviso('AVISO DE SUSPENSÃO DE LICITAÇÃO')).toBe(false)
    expect(tituloDeAviso('EDITAL Nº 01/2026 – PROCESSO SELETIVO SIMPLIFICADO')).toBe(false)
  })
})

describe('SIGPub — página da matéria real', () => {
  it('lê entidade, órgão, data, edição e o texto sem a assinatura da plataforma', () => {
    const lida = materia('materia-famup-3D2DAFAD.html', '3D2DAFAD')
    expect(lida).toMatchObject({
      codigo: '3D2DAFAD',
      entidade: 'MUNICÍPIO DE CAAPORÃ',
      orgao: 'Licitação',
      publicadaEm: '2026-10-16',
      diario: 'Diário Oficial dos Municípios do Estado da Paraíba',
      edicao: '4230',
    })
    expect(lida.texto).toContain('AVISO DE LICITAÇÃO\n\nPREGÃO ELETRÔNICO Nº 00020/2026')
    expect(lida.texto).toContain('Abertura da sessão pública: 30 de outubro de 2026, às 9:30')
    expect(lida.texto).not.toContain('Publicado por')
    expect(lida.texto).not.toContain('Código Identificador')
  })

  it('recusa página de outra matéria ou sem corpo', () => {
    expect(lerMateria(pagina('materia-famup-3D2DAFAD.html'), 'E4F6493E')).toBeNull()
    expect(lerMateria(pagina('busca-famup-pagina-1.html'), '3D2DAFAD')).toBeNull()
  })
})

describe('SIGPub — município da entidade', () => {
  it.each([
    ['Município de Caaporã', 'PB', '2503001', 'Caaporã'],
    ['PREFEITURA MUNICIPAL DE CACIMBA DE AREIA', 'PB', '2503407', 'Cacimba de Areia'],
    ["Município de Olho d'Água", 'PB', '2510402', "Olho d'Água"],
    ['Prefeitura Municipal de Igarapé-Miri', 'PA', '1503309', 'Igarapé-Miri'],
    ['Prefeitura Municipal Salgado de São Félix', 'PB', '2513109', 'Salgado de São Félix'],
    ['PREFEITURA MUNICIPAL DE JURIPIRANGA-PB', 'PB', '2507903', 'Juripiranga'],
    ['Câmara Municipal de Patos', 'PB', '2510808', 'Patos'],
    ['Fundo Municipal de Saúde de Marabá', 'PA', '1504208', 'Marabá'],
    ['Prefeitura de São José dos Cordeiros', 'PB', '2514800', 'São José dos Cordeiros'],
  ])('%s/%s → %s', (entidade, uf, ibge, nome) => {
    expect(municipioDaEntidade(entidade, uf)).toEqual({ ibge, nome })
  })

  it('entidade que não é de um município, ou de outra UF, fica sem município', () => {
    expect(municipioDaEntidade('Federação das Associações de Municípios da Paraíba - FAMUP', 'PB')).toBeNull()
    expect(municipioDaEntidade('Consorcio Publico Intermunicpal de Segurança Pública da Paraíba – UNISEG', 'PB')).toBeNull()
    expect(municipioDaEntidade('Município de Caaporã', 'PA')).toBeNull()
    expect(municipioDaEntidade('', 'PB')).toBeNull()
  })

  it('deixa legível o nome em maiúsculas', () => {
    expect(nomeLegivel('SÃO JOSÉ DE ESPINHARAS')).toBe('São José de Espinharas')
    expect(nomeLegivel("OLHO D'ÁGUA")).toBe("Olho d'Água")
    expect(nomeLegivel('Caaporã')).toBe('Caaporã')
  })
})

describe('SIGPub — avisos pelo parser compartilhado dos diários', () => {
  it('pregão eletrônico de Caaporã: objeto, sessão em hora de Brasília, órgão e identificador da fonte', () => {
    const r = avisosDaMateria(materia('materia-famup-3D2DAFAD.html', '3D2DAFAD'), cartao(), FAMUP, AGORA)
    expect(r.semMunicipio).toBe(false)
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t).toMatchObject({
      fonte: 'DIARIO_MUNICIPAL',
      fonteId: 'DM-2503001:PREGAO:20-2026',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: 'AQUISIÇÃO DE VEÍCULOS TIPO PASSEIO',
      uf: 'PB',
      municipio: 'Caaporã',
      municipioIbge: '2503001',
      numeroControle: 'Pregão Eletrônico nº 20/2026',
      linkEdital: 'https://www.diariomunicipal.com.br/famup/materia/3D2DAFAD',
    })
    expect(t.orgao).toMatch(/^(?:Município|Prefeitura Municipal) de Caaporã/)
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-30T12:30:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-16T15:00:00.000Z')
    expect(t.rawJson).toMatchObject({
      gazetteUrl: 'https://www.diariomunicipal.com.br/famup/materia/3D2DAFAD',
      date: '2026-10-16',
      edition: '4230',
      codigo: '3D2DAFAD',
      associacao: 'famup',
      entidade: 'Município de Caaporã',
    })
    expect(dataDaSessao({ fonte: t.fonte, aberturaAt: t.aberturaAt ?? null, encerramentoAt: null })).toEqual(t.aberturaAt)
  })

  it('número com sigla do órgão (PE-007-PMO/2026) e link do edital no texto', () => {
    const r = avisosDaMateria(
      materia('materia-famep-E4F6493E.html', 'E4F6493E'),
      cartao({ codigo: 'E4F6493E', titulo: 'AVISO DE LICITAÇÃO PREGÃO ELETRÔNICO PE-007-PMO/2026', entidade: 'Prefeitura Municipal de Oriximiná' }),
      FAMEP,
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    expect(r.tenders[0]).toMatchObject({
      fonteId: 'DM-1505304:PREGAO:7-2026',
      uf: 'PA',
      municipio: 'Oriximiná',
      linkEdital: 'https://www.licitanet.com.br/',
      situacao: 'ABERTA',
    })
    expect(r.tenders[0].objeto).toMatch(/^Aquisição de 5\.500 \(cinco mil e quinhentos\) kits de cestas de alimentos/)
    expect(r.tenders[0].aberturaAt?.toISOString()).toBe('2026-10-29T12:00:00.000Z')
  })

  it('aviso de suspensão não vira licitação', () => {
    const r = avisosDaMateria(
      materia('materia-famep-2B62550B-suspensao.html', '2B62550B'),
      cartao({ codigo: '2B62550B', titulo: 'AVISO DE SUSPENSÃO DE LICITAÇÃO', entidade: 'Prefeitura Municipal de Portel' }),
      FAMEP,
      AGORA
    )
    expect(r.tenders).toEqual([])
    expect(r.semMunicipio).toBe(false)
  })

  it('"AVISO DE LICITAÇÕES" sob um título só com a modalidade também é lido', () => {
    const r = avisosDaMateria(
      materia('materia-famup-58A1B376.html', '58A1B376'),
      cartao({ codigo: '58A1B376', titulo: 'PREGÃO ELETRÔNICO 033/2026 - PROCESSO ADMINISTRATIVO 130/2026', entidade: 'PREFEITURA MUNICIPAL DE ITAPORANGA' }),
      FAMUP,
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    expect(r.tenders[0]).toMatchObject({ fonteId: 'DM-2507002:PREGAO:33-2026', municipio: 'Itaporanga', modalidade: 'PREGAO_ELETRONICO' })
    expect(r.tenders[0].aberturaAt?.toISOString()).toBe('2026-11-03T12:10:00.000Z')
  })

  it('sem a linha de aviso no corpo, usa o título da matéria como cabeçalho', () => {
    const base = materia('materia-famup-58A1B376.html', '58A1B376')
    const semCabecalho = { ...base, texto: base.texto.replace('AVISO DE LICITAÇÕES\n', '') }
    const titulo = 'PREGÃO ELETRÔNICO 033/2026 - PROCESSO ADMINISTRATIVO 130/2026'
    const r = avisosDaMateria(semCabecalho, cartao({ codigo: '58A1B376', titulo, entidade: 'PREFEITURA MUNICIPAL DE ITAPORANGA' }), FAMUP, AGORA)
    expect(r.tenders.map((t) => t.fonteId)).toEqual(['DM-2507002:PREGAO:33-2026'])

    const semModalidadeNoTitulo = avisosDaMateria(
      semCabecalho,
      cartao({ codigo: '58A1B376', titulo: 'COMUNICADO', entidade: 'PREFEITURA MUNICIPAL DE ITAPORANGA' }),
      FAMUP,
      AGORA
    )
    expect(semModalidadeNoTitulo.tenders).toEqual([])
  })

  it('sessão já passada entra como encerrada; entidade do cartão sem município cai no cabeçalho da matéria', () => {
    const depois = avisosDaMateria(materia('materia-famup-3D2DAFAD.html', '3D2DAFAD'), cartao(), FAMUP, new Date('2026-11-02T12:00:00Z'))
    expect(depois.tenders[0].situacao).toBe('ENCERRADA')

    const consorcio = avisosDaMateria(
      materia('materia-famup-3D2DAFAD.html', '3D2DAFAD'),
      cartao({ entidade: 'Consorcio Publico Intermunicpal de Segurança Pública da Paraíba – UNISEG' }),
      FAMUP,
      AGORA
    )
    expect(consorcio.tenders.map((t) => t.municipioIbge)).toEqual(['2503001'])
  })

  it('sem município no cartão nem no cabeçalho, a matéria fica de fora', () => {
    const consorcio = avisosDaMateria(
      { ...materia('materia-famup-3D2DAFAD.html', '3D2DAFAD'), entidade: 'CONSÓRCIO INTERMUNICIPAL' },
      cartao({ entidade: 'Consorcio Publico Intermunicpal de Segurança Pública da Paraíba – UNISEG' }),
      FAMUP,
      AGORA
    )
    expect(consorcio).toEqual({ tenders: [], avisos: 0, descartadosPorPncp: 0, semMunicipio: true })
  })
})

describe('Diários — números de aviso que o SIGPub publica', () => {
  it.each([
    ['DISPENSA DE LICITAÇÃO Nº 66/2026/CPL/DGLC/PMM', '66/2026'],
    ['CONCORRÊNCIA PÚBLICA CP015/2026', '15/2026'],
    ['PREGÃO ELETRÔNICO PE-007-PMO/2026', '7/2026'],
    ['PREGÃO ELETRÔNICO (SRP) Nº 044/2026-SESMAB', '44/2026'],
    ['PREGÃO ELETRÔNICO Nº 00014/2026Q', '14/2026Q'],
  ])('%s → %s', (texto, numero) => {
    expect(identificarModalidade(chaveDeBusca(texto))).toMatchObject({ numero })
  })

  it('não confunde lei nem data com o número do aviso', () => {
    expect(identificarModalidade(chaveDeBusca('DISPENSA DE LICITAÇÃO, LEI 14.133/2021'))).toBeNull()
    expect(identificarModalidade(chaveDeBusca('PREGÃO 15/10/2026'))).toBeNull()
  })
})

describe('Diários — duplicidade com o PNCP pelo número', () => {
  it('extrai número e ano do identificador do aviso', () => {
    expect(numeroDoAviso('DM-2503001:PREGAO:20-2026')).toEqual({ sequencial: 20, ano: '2026' })
    expect(numeroDoAviso('QD-2503001:PREGAO:20-2026:CAMARA')).toEqual({ sequencial: 20, ano: '2026' })
    expect(numeroDoAviso('DM-2508406:PREGAO:14-2026Q')).toEqual({ sequencial: 14, ano: '2026' })
    expect(numeroDoAviso('INFRAERO-178262')).toBeNull()
    expect(numeroDoAviso(undefined)).toBeNull()
  })

  it('compara com o número da compra do PNCP mesmo com zeros, sigla ou texto em volta', () => {
    const numero = { sequencial: 27, ano: '2026' }
    expect(mesmoNumeroDoPncp(numero, { aberturaAt: null, encerramentoAt: null, similaridade: 0, numeroCompra: '027/2026-CEC/SEMUS', anoCompra: 2026 })).toBe(true)
    expect(mesmoNumeroDoPncp(numero, { aberturaAt: null, encerramentoAt: null, similaridade: 0, numeroCompra: 'PREGÃO ELETRÔNICO Nº 27', anoCompra: '2026' })).toBe(true)
    expect(mesmoNumeroDoPncp(numero, { aberturaAt: null, encerramentoAt: null, similaridade: 0, numeroCompra: '027', anoCompra: '2025' })).toBe(false)
    expect(mesmoNumeroDoPncp(numero, { aberturaAt: null, encerramentoAt: null, similaridade: 0, numeroCompra: '270', anoCompra: '2026' })).toBe(false)
    expect(mesmoNumeroDoPncp(numero, { aberturaAt: null, encerramentoAt: null, similaridade: 0, numeroCompra: null, anoCompra: '2026' })).toBe(false)
  })

  it('mesmo número e ano com objeto um pouco parecido é a mesma licitação; sem semelhança nenhuma, não', () => {
    const tender = { fonteId: 'DM-2508406:PREGAO:14-2026', aberturaAt: undefined }
    const candidato = { aberturaAt: null, encerramentoAt: null, numeroCompra: '00014', anoCompra: '2026' }
    expect(ehMesmaLicitacaoDoPncp(tender, { ...candidato, similaridade: 0.15 })).toBe(true)
    expect(ehMesmaLicitacaoDoPncp(tender, { ...candidato, similaridade: 0.05 })).toBe(false)
    expect(ehMesmaLicitacaoDoPncp({ aberturaAt: undefined }, { ...candidato, similaridade: 0.15 })).toBe(false)
  })

  it('o equivalente no Querido Diário troca só o prefixo', () => {
    expect(equivalenteNoQueridoDiario('DM-2503001:PREGAO:20-2026')).toBe('QD-2503001:PREGAO:20-2026')
    expect(equivalenteNoQueridoDiario('QD-2503001:PREGAO:20-2026')).toBeNull()
  })
})

describe('SIGPub — parâmetros da busca', () => {
  it('janela dos últimos 5 dias no calendário de Brasília', () => {
    expect(janelaDoDiarioMunicipal(new Date('2026-10-18T01:00:00Z'))).toEqual({ dataInicio: '2026-10-13', dataFim: '2026-10-17' })
    expect(janelaDoDiarioMunicipal(new Date('2026-10-18T04:00:00Z'))).toEqual({ dataInicio: '2026-10-14', dataFim: '2026-10-18' })
    expect(janelaDoDiarioMunicipal(new Date('2026-10-18T04:00:00Z'), 1)).toEqual({ dataInicio: '2026-10-18', dataFim: '2026-10-18' })
  })

  it('usa os nomes de campo do formulário de busca avançada', () => {
    expect(parametrosDaBusca('aviso de licitação', { dataInicio: '2026-10-12', dataFim: '2026-10-17' }, 2)).toEqual({
      'busca_avancada[texto]': 'aviso de licitação',
      'busca_avancada[dataInicio]': '2026-10-12',
      'busca_avancada[dataFim]': '2026-10-17',
      'busca_avancada[ordenacao]': 'recente',
      'busca_avancada[pagina]': '2',
    })
  })
})
