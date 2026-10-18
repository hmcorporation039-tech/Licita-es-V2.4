import { describe, expect, it } from 'vitest'
import {
  COLUNAS_DA_LICITACAO,
  COLUNAS_DO_DOCUMENTO,
  COLUNAS_DO_EVENTO,
  DocumentoDoLicitaCon,
  EventoDoLicitaCon,
  FormatoInesperadoDoTceRs,
  LeitorDeCsv,
  LeitorDeTabela,
  LicitacaoDoLicitaCon,
  ValorDaColuna,
  anexosDoTceRs,
  anoDoFonteIdTceRs,
  chaveDoFonteIdTceRs,
  controleNoPncp,
  diaDoLicitaCon,
  documentoDaLinha,
  ehCandidataDoTceRs,
  entradasDoZip,
  eventoDaLinha,
  inicioDosDadosDaEntrada,
  licitacaoDaLinha,
  modalidadeDoLicitaCon,
  municipioDoRs,
  nomeDeMunicipioLegivel,
  orgaoDoRs,
  prefeituraDaLinha,
  situacaoDoLicitaCon,
  tenderDoTceRs,
} from '../src/services/tceRsParser'
import { arquivoDoTceRs, zipDoTceRs } from './helpers/tceRs'

const AGORA = new Date('2026-10-18T12:00:00Z')

function lerTabela<T>(nome: string, colunas: string[], converter: (valor: ValorDaColuna) => T | undefined): T[] {
  const itens: T[] = []
  const leitor = new LeitorDeTabela(colunas, (valor) => {
    const item = converter(valor)
    if (item) itens.push(item)
  })
  leitor.ler(arquivoDoTceRs(nome).toString('utf8'))
  leitor.terminar()
  return itens
}

const LICITACOES = lerTabela('licitacao.csv', COLUNAS_DA_LICITACAO, licitacaoDaLinha)
const EVENTOS = lerTabela('evento_lic.csv', COLUNAS_DO_EVENTO, eventoDaLinha)
const DOCUMENTOS = lerTabela('documento_lic.csv', COLUNAS_DO_DOCUMENTO, documentoDaLinha)
const PREFEITURAS = new Map(LICITACOES.flatMap((l) => {
  const prefeitura = prefeituraDaLinha(l.cdOrgao, l.nomeDoOrgao)
  return prefeitura ? [prefeitura] : []
}))

function licitacao(chave: string): LicitacaoDoLicitaCon {
  const achada = LICITACOES.find((l) => l.chave === chave)
  if (!achada) throw new Error(`fixture sem ${chave}`)
  return achada
}

const eventosDe = (chave: string): EventoDoLicitaCon[] => EVENTOS.filter((e) => e.chave === chave)
const documentosDe = (chave: string): DocumentoDoLicitaCon[] => DOCUMENTOS.filter((d) => d.chave === chave)

function tender(chave: string) {
  const leitura = tenderDoTceRs(licitacao(chave), eventosDe(chave), documentosDe(chave), PREFEITURAS)
  if (leitura.tipo !== 'licitacao') throw new Error(leitura.motivo)
  return leitura.tender
}

describe('TCE-RS — leitor de CSV', () => {
  const TEXTO = '﻿A,B,C\r\n1,"texto, com vírgula","aspas ""duplas"""\r\n2,"linha\r\nquebrada",fim\r\n\r\n3,,\r\n'
  const ESPERADO = [
    ['A', 'B', 'C'],
    ['1', 'texto, com vírgula', 'aspas "duplas"'],
    ['2', 'linha\r\nquebrada', 'fim'],
    ['3', '', ''],
  ]

  it('lê vírgula e aspas dentro do campo, quebra de linha no campo, BOM e linha vazia', () => {
    const linhas: string[][] = []
    const leitor = new LeitorDeCsv((campos) => linhas.push(campos))
    leitor.ler(TEXTO)
    leitor.terminar()
    expect(linhas).toEqual(ESPERADO)
  })

  it('dá o mesmo resultado com o texto chegando em pedaços de qualquer tamanho', () => {
    for (const tamanho of [1, 2, 3, 7]) {
      const linhas: string[][] = []
      const leitor = new LeitorDeCsv((campos) => linhas.push(campos))
      for (let i = 0; i < TEXTO.length; i += tamanho) leitor.ler(TEXTO.slice(i, i + tamanho))
      leitor.terminar()
      expect(linhas).toEqual(ESPERADO)
    }
  })

  it('arquivo sem a coluna obrigatória é recusado', () => {
    const leitor = new LeitorDeTabela(COLUNAS_DA_LICITACAO, () => undefined)
    expect(() => leitor.ler('CD_ORGAO,NM_ORGAO\n1,PM DE X\n')).toThrow(FormatoInesperadoDoTceRs)
  })

  it('a fixture real tem 25 licitações, com eventos e documentos', () => {
    expect(LICITACOES).toHaveLength(25)
    expect(EVENTOS.length).toBeGreaterThan(50)
    expect(DOCUMENTOS.length).toBeGreaterThan(100)
    expect(DOCUMENTOS.every((d) => d.url.startsWith('https://portal.tce.rs.gov.br/app/silicon-download/documento_licitacao/'))).toBe(true)
  })
})

describe('TCE-RS — diretório do ZIP', () => {
  it('lista as entradas do ZIP só com a cauda do arquivo e acha o início dos dados', () => {
    const zip = zipDoTceRs()
    const cauda = zip.subarray(zip.length - 4096)
    const entradas = entradasDoZip(cauda, zip.length - cauda.length)
    expect(entradas.map((e) => e.nome)).toEqual(['licitacao.csv', 'evento_lic.csv', 'documento_lic.csv'])
    expect(entradas.every((e) => e.metodo === 8 && e.tamanhoComprimido < e.tamanhoOriginal)).toBe(true)
    const licitacoes = entradas[0]
    expect(licitacoes.tamanhoOriginal).toBe(arquivoDoTceRs('licitacao.csv').length)
    expect(inicioDosDadosDaEntrada(zip.subarray(licitacoes.inicioDoCabecalho))).toBe(30 + 'licitacao.csv'.length)
  })

  it('cauda sem o fim do diretório, ou curta demais, é formato inesperado', () => {
    const zip = zipDoTceRs()
    expect(() => entradasDoZip(Buffer.alloc(100), 0)).toThrow(FormatoInesperadoDoTceRs)
    expect(() => entradasDoZip(zip.subarray(zip.length - 40), zip.length - 40)).toThrow(/diretório do ZIP maior/)
    expect(() => inicioDosDadosDaEntrada(Buffer.from('nada aqui que pareça um zip'))).toThrow(FormatoInesperadoDoTceRs)
  })
})

describe('TCE-RS — o que é oportunidade aberta', () => {
  it('só edital publicado (EPU), com disputa, sem resultado e com sessão de hoje em diante', () => {
    const candidatas = LICITACOES.filter((l) => ehCandidataDoTceRs(l, AGORA)).map((l) => l.chave)
    expect(candidatas).toEqual([
      '47700-2026-PCE-26',
      '84200-2026-PCE-10',
      '54800-2026-CCE-11',
      '50100-2026-PCP-152',
      '74500-2026-PDE-16',
      '57500-2026-CPC-3',
      '73400-2026-LEE-2',
      '68000-2026-CPP-1',
      '77000-2026-PCE-28',
      '74501-2026-PDE-1',
      '54907-2026-PCE-175',
      '88004-2026-PCE-558',
      '88216-2026-PCE-13',
      '54400-2026-PCE-28',
      '63001-2026-PCE-9',
    ])
    expect(ehCandidataDoTceRs(licitacao('54400-2026-PCE-34'), AGORA)).toBe(false)
    expect(ehCandidataDoTceRs(licitacao('79200-2026-CHP-1'), AGORA)).toBe(false)
    expect(ehCandidataDoTceRs(licitacao('88154-2026-PRD-7'), AGORA)).toBe(false)
    expect(ehCandidataDoTceRs({ ...licitacao('47700-2026-PCE-26'), resultado: 'R' }, AGORA)).toBe(false)
  })

  it('sessão no próprio dia ainda conta; no dia seguinte, não', () => {
    const portao = licitacao('54800-2026-CCE-11')
    expect(ehCandidataDoTceRs(portao, new Date('2026-10-19T23:00:00Z'))).toBe(true)
    expect(ehCandidataDoTceRs(portao, new Date('2026-10-20T03:00:00Z'))).toBe(false)
  })

  it('situação pela fase, pelo resultado e pelo último evento decisivo', () => {
    expect(situacaoDoLicitaCon(licitacao('85300-2026-PCE-2'), [])).toBe('ENCERRADA')
    expect(situacaoDoLicitaCon(licitacao('51800-2026-PCE-10'), [])).toBe('HOMOLOGADA')
    expect(situacaoDoLicitaCon(licitacao('54400-2026-PCE-28'), eventosDe('54400-2026-PCE-28'))).toBe('SUSPENSA')
    expect(situacaoDoLicitaCon(licitacao('63001-2026-PCE-9'), eventosDe('63001-2026-PCE-9'))).toBe('REVOGADA')
    expect(situacaoDoLicitaCon({ fase: 'EPU', resultado: 'N' }, [])).toBe('ANULADA')
    expect(situacaoDoLicitaCon({ fase: 'EPU', resultado: 'D' }, [])).toBe('ENCERRADA')
    expect(situacaoDoLicitaCon({ fase: 'PUB', resultado: '' }, [])).toBeUndefined()
    const suspensaEDepoisRetomada: EventoDoLicitaCon[] = [
      { chave: 'x', sequencia: 1, fase: 'EPU', tipo: 'SUO', data: '2026-10-01', veiculo: '', publicacao: '' },
      { chave: 'x', sequencia: 2, fase: 'EPU', tipo: 'REI', data: '2026-10-05', veiculo: '', publicacao: '' },
    ]
    expect(situacaoDoLicitaCon({ fase: 'EPU', resultado: '' }, suspensaEDepoisRetomada)).toBe('ABERTA')
  })

  it('modalidades do LicitaCon', () => {
    expect(['PCE', 'PCP', 'CCE', 'CCP', 'PDE', 'CPC', 'CNS', 'TMP', 'LEE', 'ESE', 'XYZ'].map(modalidadeDoLicitaCon)).toEqual([
      'PREGAO_ELETRONICO',
      'PREGAO_PRESENCIAL',
      'CONCORRENCIA',
      'CONCORRENCIA',
      'DISPENSA_COM_DISPUTA',
      'CREDENCIAMENTO',
      'CONCURSO',
      'TOMADA_DE_PRECOS',
      'OUTROS',
      'OUTROS',
      'OUTROS',
    ])
  })
})

describe('TCE-RS — município e órgão', () => {
  it('prefeitura e câmara pelo nome; autarquia pelo código da prefeitura; instituto pelo fim do nome', () => {
    expect(orgaoDoRs(74501, 'CM DE CAPITÃO', PREFEITURAS)).toMatchObject({ orgao: 'Câmara Municipal de Capitão', esfera: 'municipal', municipio: { nome: 'Capitão', codigoIbge: '4304697' } })
    expect(orgaoDoRs(54907, 'DMAE - DEP. MUNICIPAL DE ÁGUA E ESGOTOS - PORTO ALEGRE', PREFEITURAS).municipio?.codigoIbge).toBe('4314902')
    expect(orgaoDoRs(57102, 'DAE - DEP. DE ÁGUA E ESGOTOS - SANTANA DO LIVRAMENTO', PREFEITURAS)).toMatchObject({ esfera: 'municipal', municipio: { nome: "Sant'Ana do Livramento", codigoIbge: '4317103' } })
    expect(orgaoDoRs(88125, 'IPSTP - INST. PREV. DOS SERV. PÚBL. DO MUNIC. - TRÊS PASSOS', PREFEITURAS).municipio).toMatchObject({ nome: 'Três Passos', codigoIbge: '4321907' })
    expect(orgaoDoRs(88261, 'FSNH - FUND. DE SAÚDE PÚBLICA DE NOVO HAMBURGO', PREFEITURAS).municipio?.nome).toBe('Novo Hamburgo')
    expect(orgaoDoRs(88030, 'PM DE CRUZALTENSE', PREFEITURAS).municipio?.codigoIbge).toBe('4306130')
  })

  it('consórcio fica sem município; órgão do Estado fica na capital', () => {
    expect(orgaoDoRs(88216, 'CI-CS - CONS. INTERM. - CI - CENTRO SUL', PREFEITURAS)).toEqual({ orgao: 'CI-CS - CONS. INTERM. - CI - CENTRO SUL', municipio: undefined, esfera: 'regional' })
    expect(orgaoDoRs(88190, 'CONSISA - CONS. INTERM. DE SERVIÇOS DO VALE DO TAQUARI', PREFEITURAS).municipio).toBeUndefined()
    expect(orgaoDoRs(88004, 'SES - SECRETARIA DA SAÚDE DO RS', PREFEITURAS)).toMatchObject({ esfera: 'estadual', municipio: { nome: 'Porto Alegre' } })
  })

  it('nomes com hífen e apóstrofo resolvem para o IBGE', () => {
    expect(municipioDoRs('NÃO-ME-TOQUE')).toMatchObject({ nome: 'Não-Me-Toque', codigoIbge: '4312658' })
    expect(municipioDoRs('XANGRI-LÁ')?.codigoIbge).toBe('4323804')
    expect(municipioDoRs('SANTANA DO LIVRAMENTO')?.nome).toBe("Sant'Ana do Livramento")
    expect(nomeDeMunicipioLegivel('SÃO JOSÉ DOS AUSENTES')).toBe('São José dos Ausentes')
    expect(municipioDoRs('MUNICÍPIO QUE NÃO EXISTE')).toBeUndefined()
  })
})

describe('TCE-RS — licitação gravável', () => {
  it('pregão de Estrela com link do PNCP na publicação', () => {
    const t = tender('47700-2026-PCE-26')
    expect(t).toMatchObject({
      fonte: 'TCE_RS',
      fonteId: 'TCE-RS-47700-2026-PCE-26',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'RS',
      municipio: 'Estrela',
      municipioIbge: '4307807',
      orgao: 'Prefeitura Municipal de Estrela',
      valorEstimado: 178780.51,
      numeroControle: '26/2026',
    })
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-07T03:00:00.000Z')
    expect(t.linkEdital).toMatch(/^https:\/\/portal\.tce\.rs\.gov\.br\/aplicprod\/f\?p=50500:10:/)
    expect(t.rawJson).toMatchObject({ chave: '47700-2026-PCE-26', controlePncp: '87246120000151-1-000202/2026', publicadoNoPncp: true, esfera: 'municipal', processoAdministrativo: '6167/2026' })
    const anexos = t.rawJson.anexos as { uri: string; tipo: string }[]
    expect(anexos[0].tipo).toBe('EDI')
    expect(anexos.every((a) => a.uri.startsWith('https://portal.tce.rs.gov.br/'))).toBe(true)
  })

  it('orçamento sigiloso não tem valor; sessão sem hora fica à meia-noite de Brasília', () => {
    const t = tender('77000-2026-PCE-28')
    expect(t.valorEstimado).toBeUndefined()
    expect(t.rawJson.orcamentoSigiloso).toBe(true)
    expect(diaDoLicitaCon('2026-10-23')?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(diaDoLicitaCon('1800-01-01')).toBeUndefined()
    expect(diaDoLicitaCon('')).toBeUndefined()
  })

  it('consórcio sem município e órgão estadual na capital continuam graváveis', () => {
    expect(tender('88216-2026-PCE-13')).toMatchObject({ uf: 'RS', municipio: undefined, municipioIbge: undefined })
    expect(tender('88004-2026-PCE-558')).toMatchObject({ municipio: 'Porto Alegre', orgao: 'SES - SECRETARIA DA SAÚDE DO RS', rawJson: { esfera: 'estadual' } })
  })

  it('fase de publicação de dispensa não vira licitação', () => {
    expect(tenderDoTceRs(licitacao('88154-2026-PRD-7'), [], [], PREFEITURAS)).toEqual({ tipo: 'ignorado', motivo: 'fase sem situação conhecida (PUB)' })
  })

  it('anexos: edital primeiro, sem repetir endereço, até 10; publicação e esclarecimento ficam de fora', () => {
    const documento = (tipo: string, url: string, enviadoEm: string): DocumentoDoLicitaCon => ({ chave: 'x', tipo, nome: `${tipo}.pdf`, fase: 'INT', enviadoEm, url })
    const base = 'https://portal.tce.rs.gov.br/app/silicon-download/documento_licitacao/'
    const anexos = anexosDoTceRs([
      documento('OUT', `${base}1`, '20261001000000'),
      documento('EDI', `${base}2`, '20261001000000'),
      documento('EDI', `${base}3`, '20261005000000'),
      documento('PUE', `${base}4`, '20261005000000'),
      documento('ESC', `${base}5`, '20261005000000'),
      documento('EDI', `${base}3`, '20261005000000'),
      ...Array.from({ length: 12 }, (_, i) => documento('OUT', `${base}${100 + i}`, '20260901000000')),
    ])
    expect(anexos.slice(0, 3).map((a) => a.uri)).toEqual([`${base}3`, `${base}2`, `${base}1`])
    expect(anexos).toHaveLength(10)
  })

  it('link do PNCP vira o número de controle do PNCP', () => {
    const evento = (publicacao: string, sequencia: number): EventoDoLicitaCon => ({ chave: 'x', sequencia, fase: 'EPU', tipo: 'PUE', data: '2026-10-01', veiculo: 'P', publicacao })
    expect(controleNoPncp([evento('https://pncp.gov.br/app/editais/87592861000194/2026/46', 1)])).toBe('87592861000194-1-000046/2026')
    expect(controleNoPncp([evento('https://pncp.gov.br/editais/04215147000150/2026/134', 1)])).toBe('04215147000150-1-000134/2026')
    expect(controleNoPncp([evento('PNCP', 1), evento('Jornal do Comércio', 2)])).toBeUndefined()
  })

  it('fonteId estável a partir da chave do LicitaCon', () => {
    expect(chaveDoFonteIdTceRs('TCE-RS-2302-2026-RPO-9516.968627')).toBe('2302-2026-RPO-9516.968627')
    expect(chaveDoFonteIdTceRs('TCE-CE-123')).toBeUndefined()
    expect(anoDoFonteIdTceRs('TCE-RS-47700-2026-PCE-26')).toBe(2026)
  })
})
