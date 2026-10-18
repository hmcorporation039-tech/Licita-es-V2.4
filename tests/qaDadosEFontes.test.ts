import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dataPlausivel, limiteDeDataPlausivel } from '../src/lib/dataPlausivel'
import { DatasDaLicitacao, estaAberta } from '../src/lib/licitacaoAberta'
import { parseDataBr } from '../src/lib/scrapingHelpers'
import { horarioDeBrasilia } from '../src/services/sistemaS/comum'
import { diaDeBrasilia, sessaoDaLinha, tenderDoTceCe } from '../src/services/tceCeParser'
import { normalizarRegistroSestSenat, RegistroSestSenat } from '../src/services/sestSenatParser'
import { chaveDeBusca, extrairAbertura, objetoSemConteudo, parseDiarioOficial, GazetaQueridoDiario } from '../src/services/queridoDiarioParser'
import { anoDoProcesso } from '../src/lib/anoDoProcesso'
import { modalidadesEquivalentes } from '../src/services/queridoDiarioService'
import { RegistroDeOutraFonte, chaveDaRepeticaoTceCe, ehRepeticaoDaLicitacaoDoPncp, repeticoesDoTceCe } from '../src/services/duplicataEntreFontes'
import { MARCAS_DAS_FONTES, marcasComLicitacao, marcasDoRegistro } from '../src/lib/marcasDasFontes'
import { fontesNaFaixa } from '../web/src/lib/fontes'
import { temPalavraSignificativa } from '../src/lib/matching'

const AGORA = new Date('2026-10-18T12:00:00-03:00')
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000)

describe('N1: data impossível não mantém licitação velha aberta', () => {
  it('aceita de 2000 até 11 anos à frente (credenciamento do PNCP vai até 10 anos de vigência)', () => {
    expect(dataPlausivel(new Date('2036-12-31T03:00:00Z'), AGORA)).toEqual(new Date('2036-12-31T03:00:00Z'))
    expect(dataPlausivel(new Date('2000-01-01T00:00:00Z'), AGORA)).toBeDefined()
    expect(dataPlausivel(new Date('2087-01-05T03:00:00Z'), AGORA)).toBeUndefined()
    expect(dataPlausivel(new Date('2201-02-08T03:00:00Z'), AGORA)).toBeUndefined()
    expect(dataPlausivel(new Date('1999-12-31T00:00:00Z'), AGORA)).toBeUndefined()
    expect(dataPlausivel(new Date(Number.NaN), AGORA)).toBeUndefined()
    expect(limiteDeDataPlausivel(AGORA).toISOString()).toBe('2037-10-18T15:00:00.000Z')
  })

  it('os conversores de data dos portais descartam o ano absurdo', () => {
    expect(parseDataBr('05/01/2087')).toBeUndefined()
    expect(parseDataBr('15/10/5219 10:00')).toBeUndefined()
    expect(parseDataBr('28/10/2026 09:00')?.toISOString()).toBe('2026-10-28T12:00:00.000Z')
    expect(horarioDeBrasilia(2206, 8, 28)).toBeUndefined()
    expect(horarioDeBrasilia(2026, 8, 28)?.toISOString()).toBe('2026-08-28T03:00:00.000Z')
    expect(diaDeBrasilia('21/11/2202')).toBeUndefined()
  })

  it('SEST SENAT "003/2017" com proposta em 2087 fica sem esse prazo', () => {
    const registro = {
      empresa: 'SEST', nomeFilial: 'Filial DF', modalidade: 'Pregão', codigoEdital: '003/2017', numeroProcesso: '1', objeto: 'Aquisição de pneus',
      dataHomologacao: null, dataProposta: '05/01/2087', dataAbertura: null, valorProposta: null, valorVencido: null, situacao: 'Aberto', uf: 'DF',
    } as RegistroSestSenat
    expect(normalizarRegistroSestSenat(registro).encerramentoAt).toBeUndefined()
    expect(normalizarRegistroSestSenat({ ...registro, dataHomologacao: '10/03/2017' }).encerramentoAt?.toISOString()).toBe('2017-03-10T03:00:00.000Z')
  })

  it('TCE-CE: reabertura em 21/11/2202 (erro de digitação na origem) volta para a abertura original', () => {
    const linha = { idProcesso: 1, idLicitacao: 2, numero: '00.003/2022', municipio: 'CANINDÉ', objeto: 'Aquisição de material', aberturaEm: '21/11/2022', reaberturaEm: '21/11/2202' }
    expect(sessaoDaLinha(linha)?.toISOString()).toBe('2022-11-21T03:00:00.000Z')
    const leitura = tenderDoTceCe(linha, {
      municipio: 'CANINDÉ', ente: 'Prefeitura Municipal', numero: '00.003/2022', objeto: 'Aquisição de material de expediente', modalidade: 'Pregão Eletrônico',
      situacao: 'Aberta', aberturaEm: '21/11/2022', horaDaAbertura: '09:00', reaberturaEm: '21/11/2202', horaDaReabertura: '08:00', publicacoes: [], orgaos: [], arquivos: [],
    })
    expect(leitura.tipo).toBe('licitacao')
    if (leitura.tipo !== 'licitacao') return
    expect(leitura.tender.aberturaAt?.toISOString()).toBe('2022-11-21T12:00:00.000Z')
    expect(leitura.tender.rawJson.reaberta).toBe(false)
  })

  const base = (o: Partial<DatasDaLicitacao>): DatasDaLicitacao => ({
    fonte: 'PNCP', situacao: 'ABERTA', valorHomologado: null, encerramentoAt: null, aberturaAt: null, publicadoAt: dias(-400), createdAt: dias(-400), ...o,
  })

  it('na regra em memória, prazo além do limite conta como sem prazo', () => {
    expect(estaAberta(base({ fonte: 'SEST_SENAT', encerramentoAt: new Date('2087-01-05T03:00:00Z'), anoDoProcesso: 2017, publicadoAt: null }), AGORA)).toBe(false)
    expect(estaAberta(base({ fonte: 'SEST_SENAT', encerramentoAt: new Date('5219-10-15T03:00:00Z'), anoDoProcesso: 2019, publicadoAt: null }), AGORA)).toBe(false)
    expect(estaAberta(base({ fonte: 'TCE_CE', aberturaAt: new Date('2202-11-21T11:00:00Z'), publicadoAt: new Date('2022-11-30T03:00:00Z') }), AGORA)).toBe(false)
    expect(estaAberta(base({ fonte: 'SISTEMA_S', aberturaAt: new Date('2206-08-28T03:00:00Z'), anoDoProcesso: 2025, publicadoAt: null }), AGORA)).toBe(false)
    expect(estaAberta(base({ encerramentoAt: new Date('2102-03-01T03:00:00Z') }), AGORA)).toBe(false)
    expect(estaAberta(base({ encerramentoAt: new Date('2036-12-31T03:00:00Z') }), AGORA)).toBe(true)
  })

  it('licitação escondida por ser repetição do PNCP nunca está aberta', () => {
    expect(estaAberta(base({ fonte: 'QUERIDO_DIARIO', aberturaAt: dias(5), duplicataDe: 'id-do-pncp' }), AGORA)).toBe(false)
    expect(estaAberta(base({ fonte: 'QUERIDO_DIARIO', aberturaAt: dias(5), duplicataDe: null }), AGORA)).toBe(true)
  })
})

describe('N8: hora da sessão com "h" depois dos minutos', () => {
  const diario = new Date('2026-10-20T15:00:00Z')
  it.each([
    ['até às 09:00h do dia 28/10/2026', '2026-10-28T12:00:00.000Z'],
    ['até ás 16:00h do dia 26 de outubro de 2026', '2026-10-26T19:00:00.000Z'],
    ['sessão às 09h00 do dia 28/10/2026', '2026-10-28T12:00:00.000Z'],
    ['sessão às 9h do dia 28/10/2026', '2026-10-28T12:00:00.000Z'],
    ['abertura às 09:00 horas do dia 28/10/2026', '2026-10-28T12:00:00.000Z'],
    ['abertura às 9 horas do dia 28/10/2026', '2026-10-28T12:00:00.000Z'],
    ['abertura às 14:30hs do dia 28/10/2026', '2026-10-28T17:30:00.000Z'],
  ])('%s', (texto, esperado) => {
    expect(extrairAbertura(chaveDeBusca(texto), diario)?.toISOString()).toBe(esperado)
  })
})

function gazeta(over: Partial<GazetaQueridoDiario> = {}): GazetaQueridoDiario {
  return {
    territory_id: '2930105',
    territory_name: 'Senhor do Bonfim',
    state_code: 'BA',
    date: '2026-10-13',
    url: 'https://data.queridodiario.ok.org.br/2930105/2026-10-13/a.pdf',
    txt_url: 'https://data.queridodiario.ok.org.br/2930105/2026-10-13/a.txt',
    edition: '1',
    is_extra_edition: false,
    ...over,
  }
}

const aviso = (cabecalho: string, meio: string) => `${cabecalho}

${meio}
Data da sessão: 28/10/2026 às 09h00.
Senhor do Bonfim, 13 de outubro de 2026.
`

describe('M16: aviso sem objeto de verdade e parceria que não é licitação', () => {
  it.each(['LICITAÇÃO COMPARTILHADA', 'REPUBLICADO PÓS ALTERAÇÕES', 'Contratação do objeto abaixo descrito', 'Celebrar um Termo de Fomento'])('"%s" não é objeto', (texto) => {
    expect(objetoSemConteudo(texto)).toBe(true)
  })

  it.each(['Licitação compartilhada para aquisição de merenda escolar', 'Contratação de empresa para coleta de lixo', 'Termo de referência para aquisição de pneus'])(
    '"%s" continua sendo objeto',
    (texto) => {
      expect(objetoSemConteudo(texto)).toBe(false)
    }
  )

  const agora = new Date('2026-10-15T20:00:00Z')
  const pregao = (meio: string) => aviso('AVISO DE LICITAÇÃO\nPREGÃO ELETRÔNICO Nº 012/2026', meio)

  it('frase vaga no lugar do objeto: aproveita o objeto de verdade que vem depois, senão descarta', () => {
    const comObjetoDepois = pregao('Objeto: Contratação do objeto abaixo descrito. Objeto: Aquisição de gêneros alimentícios para a merenda escolar.')
    expect(parseDiarioOficial(gazeta(), comObjetoDepois, agora).tenders.map((t) => t.objeto)).toEqual(['Aquisição de gêneros alimentícios para a merenda escolar'])
    expect(parseDiarioOficial(gazeta(), pregao('Objeto: LICITAÇÃO COMPARTILHADA.'), agora).tenders).toEqual([])
    expect(parseDiarioOficial(gazeta(), pregao('Objeto: REPUBLICADO PÓS ALTERAÇÕES.'), agora).tenders).toEqual([])
  })

  it('termo de fomento ou de colaboração (parceria com OSC) é descartado mesmo com objeto detalhado', () => {
    const chamamento = (objeto: string) => aviso('AVISO DE CHAMAMENTO PÚBLICO Nº 03/2026', `Objeto: ${objeto}.`)
    expect(parseDiarioOficial(gazeta(), chamamento('Celebrar um Termo de Fomento'), agora).tenders).toEqual([])
    expect(parseDiarioOficial(gazeta(), chamamento('Celebrar termo de colaboração com organização da sociedade civil para oficinas de música'), agora).tenders).toEqual([])
    expect(parseDiarioOficial(gazeta(), chamamento('Credenciamento de clínicas para exames de imagem'), agora).tenders).toHaveLength(1)
  })
})

describe('N10: número do SESC regional começa pelo ano', () => {
  it.each([
    ['26/10.00383-DL', 2026],
    ['26/23.00908-CT', 2026],
    ['26/1.00915-CT', 2026],
    ['26/002-CP', 2026],
    ['26/052PGE', 2026],
    ['26/0001', 2026],
    ['66/26', 2026],
    ['39/2026', 2026],
    ['0032/26-PGE', 2026],
  ] as const)('%s -> %i', (numero, ano) => {
    expect(anoDoProcesso('SESC_REGIONAL', numero, AGORA)).toBe(ano)
  })
})

describe('N5: mesma licitação em mais de uma fonte', () => {
  it('credenciamento e inexigibilidade são a mesma família para comparar com o PNCP', () => {
    expect(modalidadesEquivalentes('CREDENCIAMENTO')).toEqual(['CREDENCIAMENTO', 'INEXIGIBILIDADE'])
    expect(modalidadesEquivalentes('INEXIGIBILIDADE')).toEqual(['CREDENCIAMENTO', 'INEXIGIBILIDADE'])
  })

  const registro = (o: Partial<RegistroDeOutraFonte>): RegistroDeOutraFonte => ({
    id: 'r', fonte: 'TCE_CE', fonteId: 'TCE-CE-1', modalidade: 'PREGAO_ELETRONICO', objeto: 'Aquisição de material de limpeza para as secretarias',
    uf: 'CE', municipio: 'Maracanaú', municipioIbge: '2307650', orgao: 'Prefeitura Municipal de Maracanaú', aberturaAt: dias(10), publicadoAt: dias(-5),
    numeroControle: '14.018/2026-PE', rawJson: {}, createdAt: dias(-5), ...o,
  })

  it('a licitação nova do PNCP reconhece o aviso de diário gravado antes dela pelos mesmos critérios da coleta do diário', () => {
    const diario = registro({ fonte: 'QUERIDO_DIARIO', fonteId: 'QD-2606200:PREGAO:31-2026', uf: 'PE', municipio: 'Gameleira', municipioIbge: '2606200', numeroControle: 'Pregão Eletrônico nº 31/2026' })
    const pncp = { fonte: 'PNCP' as const, fonteId: 'p', modalidade: 'PREGAO_ELETRONICO' as const, objeto: diario.objeto, uf: 'PE', encerramentoAt: dias(10), rawJson: { numeroCompra: '31', anoCompra: 2026 } }
    expect(ehRepeticaoDaLicitacaoDoPncp(diario, pncp, 0.95)).toBe(true)
    expect(ehRepeticaoDaLicitacaoDoPncp(diario, pncp, 0.12)).toBe(true)
    expect(ehRepeticaoDaLicitacaoDoPncp(diario, { ...pncp, rawJson: { numeroCompra: '32', anoCompra: 2026 } }, 0.12)).toBe(false)
    expect(ehRepeticaoDaLicitacaoDoPncp(diario, { ...pncp, modalidade: 'CONCORRENCIA' }, 0.95)).toBe(false)
    const credenciamento = registro({ fonte: 'DIARIO_MUNICIPAL', fonteId: 'DM-1:CREDENCIAMENTO:4-2026', modalidade: 'CREDENCIAMENTO' })
    expect(ehRepeticaoDaLicitacaoDoPncp(credenciamento, { ...pncp, modalidade: 'INEXIGIBILIDADE' }, 0.9)).toBe(true)
  })

  it('TCE-CE: a publicação repetida (mesmo município, número e ano) esconde a mais antiga e fica a mais recente', () => {
    const antiga = registro({ id: 'antiga', fonteId: 'TCE-CE-189922', numeroControle: '14.018/2026-PE (republicado)' })
    const recente = registro({ id: 'recente', fonteId: 'TCE-CE-190443' })
    expect(chaveDaRepeticaoTceCe(antiga)).toBe(chaveDaRepeticaoTceCe(recente))
    expect(repeticoesDoTceCe([recente, antiga])).toEqual([{ id: 'antiga', original: 'recente' }])
  })

  it('TCE-CE: número igual de outra modalidade, outro órgão, outro ano ou outro objeto não é repetição', () => {
    const recente = registro({ id: 'recente', fonteId: 'TCE-CE-190443' })
    expect(repeticoesDoTceCe([recente, registro({ id: 'cc', fonteId: 'TCE-CE-1', modalidade: 'CONCORRENCIA' })])).toEqual([])
    expect(repeticoesDoTceCe([recente, registro({ id: 'camara', fonteId: 'TCE-CE-1', orgao: 'Câmara Municipal de Maracanaú' })])).toEqual([])
    expect(repeticoesDoTceCe([recente, registro({ id: 'ano', fonteId: 'TCE-CE-1', numeroControle: '14.018/2025-PE' })])).toEqual([])
    expect(repeticoesDoTceCe([recente, registro({ id: 'objeto', fonteId: 'TCE-CE-1', objeto: 'Construção de praça no bairro Pajuçara' })])).toEqual([])
  })
})

describe('N12: fontes contadas pela marca mostrada na página', () => {
  it('junta as fontes da mesma marca e separa o Sistema S pela entidade', () => {
    expect(marcasDoRegistro('SESC_GO', null)).toEqual(['SESC'])
    expect(marcasDoRegistro('SESC_REGIONAL', null)).toEqual(['SESC'])
    expect(marcasDoRegistro('SISTEMA_S', 'SESI/SENAI-BA')).toEqual(['SENAI', 'SESI'])
    expect(marcasDoRegistro('SISTEMA_S', 'FIEC')).toEqual([])
    expect(marcasDoRegistro('COMPRASNET', null)).toEqual([])
    expect(
      marcasComLicitacao([
        { fonte: 'PNCP', orgao: null },
        { fonte: 'SESC_GO', orgao: null },
        { fonte: 'SESC_REGIONAL', orgao: null },
        { fonte: 'QUERIDO_DIARIO', orgao: null },
        { fonte: 'DIARIO_MUNICIPAL', orgao: null },
        { fonte: 'SISTEMA_S', orgao: 'SENAC-PE' },
      ])
    ).toEqual(['PNCP', 'SESC', 'SENAC', 'Querido Diário', 'Diários municipais'])
  })

  it('a faixa de logos mostra só as marcas com licitação aberta e usa os mesmos nomes da API', () => {
    const componente = readFileSync(join(__dirname, '..', 'web', 'src', 'components', 'entrada', 'FaixaDeFontes.tsx'), 'utf8')
    const nomesNaFaixa = [...componente.matchAll(/\{ nome: '([^']+)'/g)].map((m) => m[1])
    expect(nomesNaFaixa).toEqual([...MARCAS_DAS_FONTES])
    const faixa = nomesNaFaixa.map((nome) => ({ nome }))
    expect(fontesNaFaixa(faixa, ['PNCP', 'SESC']).map((f) => f.nome)).toEqual(['PNCP', 'SESC'])
    expect(fontesNaFaixa(faixa, ['PNCP', 'SESC']).some((f) => f.nome === 'Infraero')).toBe(false)
    expect(fontesNaFaixa(faixa, undefined)).toHaveLength(MARCAS_DAS_FONTES.length)
    expect(fontesNaFaixa(faixa, [])).toHaveLength(MARCAS_DAS_FONTES.length)
  })
})

describe('N15: busca sem palavra significativa', () => {
  it('"de", "para" e afins sozinhos não contam', () => {
    expect(temPalavraSignificativa('de')).toBe(false)
    expect(temPalavraSignificativa('de para')).toBe(false)
    expect(temPalavraSignificativa('de cimento')).toBe(true)
  })
})
