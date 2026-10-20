import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { escaparXml, gerarPlanilhaXlsx, letraDaColuna, nomeDeAbaValido, textoSeguroParaXml } from '../src/lib/planilhaXlsx'
import {
  COLUNAS_DAS_ESCOLHIDAS,
  COLUNAS_DOS_MATCHES,
  agruparMatchesPorLicitacao,
  avisoDeListaCortada,
  cidadeEUf,
  linhaDaEscolhida,
  linhaDoMatch,
  prazoParaProposta,
  textoDaDataDaLicitacao,
  type LicitacaoDaPlanilha,
} from '../src/lib/planilhasDaEmpresa'
import { nomeDoArquivoDaPlanilha } from '../src/api/respostaDePlanilha'
import { lerPlanilha, textoDaColuna } from './helpers/planilha'

const PARTES_OBRIGATORIAS = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']

function planilhaSimples(linhas: (string | number | Date | null)[][], observacaoFinal?: string) {
  return lerPlanilha(
    gerarPlanilhaXlsx({
      nomeDaAba: 'Teste',
      colunas: [
        { titulo: 'Texto', largura: 30 },
        { titulo: 'Valor', largura: 15, tipo: 'moeda' },
        { titulo: 'Quantidade', largura: 10, tipo: 'numero' },
      ],
      linhas,
      observacaoFinal,
    })
  )
}

function licitacaoDeExemplo(campos: Partial<LicitacaoDaPlanilha> = {}): LicitacaoDaPlanilha {
  return {
    id: 'lic-1',
    fonte: 'PNCP',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'Aquisição de papel A4',
    objetoResumido: null,
    orgao: 'Prefeitura de Goiânia',
    municipio: 'Goiânia',
    uf: 'GO',
    aberturaAt: new Date('2026-10-20T12:00:00Z'),
    encerramentoAt: new Date('2026-10-30T13:00:00Z'),
    valorEstimado: new Prisma.Decimal('12345.67'),
    valorHomologado: null,
    linkEdital: 'https://pncp.gov.br/app/editais/1',
    ...campos,
  }
}

describe('gerador de planilha .xlsx', () => {
  it('gera um zip com todas as partes obrigatórias do Office Open XML', () => {
    const p = planilhaSimples([['a', 1, 2]])
    for (const parte of PARTES_OBRIGATORIAS) expect(p.partes).toContain(parte)
    for (const parte of PARTES_OBRIGATORIAS) expect(p.xml[parte].startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(p.xml['[Content_Types].xml']).toContain('PartName="/xl/workbook.xml"')
    expect(p.xml['[Content_Types].xml']).toContain('PartName="/xl/worksheets/sheet1.xml"')
    expect(p.xml['[Content_Types].xml']).toContain('PartName="/xl/styles.xml"')
    expect(p.xml['_rels/.rels']).toContain('Target="xl/workbook.xml"')
    expect(p.xml['xl/_rels/workbook.xml.rels']).toContain('Target="worksheets/sheet1.xml"')
    expect(p.xml['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"')
    expect(p.xml['xl/workbook.xml']).toContain('<sheet name="Teste" sheetId="1" r:id="rId1"/>')
  })

  it('cabeçalho em negrito com fundo azul claro, congelado e com filtro automático', () => {
    const p = planilhaSimples([
      ['a', 1, 2],
      ['b', 3, 4],
    ])
    expect(p.celulas.get('A1')).toEqual({ tipo: 'texto', valor: 'Texto', estilo: 1 })
    expect(p.celulas.get('C1')?.estilo).toBe(1)
    expect(p.xml['xl/styles.xml']).toMatch(/<font><b\/>/)
    expect(p.xml['xl/styles.xml']).toContain('<fgColor rgb="FFDDEBF7"/>')
    expect(p.xml['xl/styles.xml']).toContain('<xf numFmtId="0" fontId="1" fillId="2"')
    const aba = p.xml['xl/worksheets/sheet1.xml']
    expect(aba).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
    expect(aba).toContain('<autoFilter ref="A1:C3"/>')
    expect(aba).toContain('<col min="1" max="1" width="30" customWidth="1"/>')
    expect(aba).toContain('<col min="2" max="2" width="15" customWidth="1"/>')
    expect(aba.indexOf('<cols>')).toBeLessThan(aba.indexOf('<sheetData>'))
    expect(aba.indexOf('</sheetData>')).toBeLessThan(aba.indexOf('<autoFilter'))
    expect(p.xml['xl/workbook.xml']).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">&apos;Teste&apos;!$A$1:$C$3</definedName>`)
  })

  it('números como número e valores em reais com formato de moeda brasileira', () => {
    const p = planilhaSimples([['a', 12345.67, 3]])
    expect(p.celulas.get('B2')).toEqual({ tipo: 'numero', valor: '12345.67', estilo: 2 })
    expect(p.celulas.get('C2')).toEqual({ tipo: 'numero', valor: '3', estilo: 3 })
    expect(p.xml['xl/styles.xml']).toContain('<numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/>')
    expect(p.xml['xl/styles.xml']).toContain('<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>')
  })

  it('células vazias, nulas ou com número inválido ficam em branco', () => {
    const p = planilhaSimples([[null, Number.NaN, Number.POSITIVE_INFINITY]])
    expect(p.celulas.has('A2')).toBe(false)
    expect(p.celulas.has('B2')).toBe(false)
    expect(p.celulas.has('C2')).toBe(false)
    expect(p.xml['xl/worksheets/sheet1.xml']).toContain('<row r="2"></row>')
  })

  it('escapa caracteres especiais do XML e remove os de controle inválidos', () => {
    const texto = `Tubos & conexões <PVC> "marrom" d'água${String.fromCharCode(0)}${String.fromCharCode(7)}${String.fromCharCode(0xfffe)}\tfim\nlinha${String.fromCharCode(0xd800)}`
    const p = planilhaSimples([[texto, null, null]])
    expect(p.celulas.get('A2')?.valor).toBe(`Tubos & conexões <PVC> "marrom" d'água\tfim\nlinha`)
    expect(p.xml['xl/worksheets/sheet1.xml']).toContain('Tubos &amp; conexões &lt;PVC&gt; &quot;marrom&quot; d&apos;água')
    expect(escaparXml('a&b')).toBe('a&amp;b')
    expect(textoSeguroParaXml('ok 😀')).toBe('ok 😀')
    expect(textoSeguroParaXml(`${String.fromCharCode(1)}abc`)).toBe('abc')
  })

  it('texto que parece fórmula fica como texto puro, nunca como fórmula', () => {
    const perigosos = ['=HYPERLINK("http://mal.example","clique")', '+1+1', '-2+3', '@SUM(A1)', '=1+1']
    const p = planilhaSimples(perigosos.map((t) => [t, null, null]))
    const aba = p.xml['xl/worksheets/sheet1.xml']
    expect(aba).not.toMatch(/<f[ >]/)
    perigosos.forEach((t, i) => {
      expect(p.celulas.get(`A${i + 2}`)).toEqual({ tipo: 'texto', valor: t, estilo: 4 })
    })
    expect(p.xml['xl/styles.xml']).toContain('quotePrefix="1"')
    expect(planilhaSimples([['texto normal', null, null]]).celulas.get('A2')?.estilo).toBe(0)
  })

  it('data e hora em texto no horário de Brasília', () => {
    const p = planilhaSimples([[new Date('2026-10-20T13:30:00Z'), null, null]])
    expect(p.celulas.get('A2')).toEqual({ tipo: 'texto', valor: '20/10/2026 10:30', estilo: 0 })
    const virada = planilhaSimples([[new Date('2026-10-21T01:15:00Z'), null, null]])
    expect(virada.celulas.get('A2')?.valor).toBe('20/10/2026 22:15')
  })

  it('observação final fica depois dos dados e fora do filtro', () => {
    const p = planilhaSimples([['a', 1, 1]], 'Lista cortada')
    expect(p.celulas.get('A4')?.valor).toBe('Lista cortada')
    expect(p.xml['xl/worksheets/sheet1.xml']).toContain('<autoFilter ref="A1:C2"/>')
    expect(p.xml['xl/worksheets/sheet1.xml']).toContain('<dimension ref="A1:C4"/>')
  })

  it('nome da aba válido para o Excel e letras de coluna além do Z', () => {
    expect(nomeDeAbaValido('Matches: [GO/DF]?')).toBe('Matches GO DF')
    expect(nomeDeAbaValido('x'.repeat(40))).toHaveLength(31)
    expect(nomeDeAbaValido('')).toBe('Planilha')
    expect(letraDaColuna(0)).toBe('A')
    expect(letraDaColuna(25)).toBe('Z')
    expect(letraDaColuna(26)).toBe('AA')
    expect(letraDaColuna(701)).toBe('ZZ')
    expect(letraDaColuna(702)).toBe('AAA')
  })

  it('texto maior que o limite da célula do Excel é cortado', () => {
    const p = planilhaSimples([['a'.repeat(40_000), null, null]])
    expect(p.celulas.get('A2')?.valor).toHaveLength(32_767)
  })
})

describe('linhas das planilhas da empresa', () => {
  it('prazo para proposta: encerramento; sem ele, abertura só fora do PNCP', () => {
    const encerramento = new Date('2026-10-30T13:00:00Z')
    const abertura = new Date('2026-10-25T03:00:00Z')
    expect(prazoParaProposta({ fonte: 'PNCP', aberturaAt: abertura, encerramentoAt: encerramento })).toBe(encerramento)
    expect(prazoParaProposta({ fonte: 'PNCP', aberturaAt: abertura, encerramentoAt: null })).toBeNull()
    expect(prazoParaProposta({ fonte: 'FIEG', aberturaAt: abertura, encerramentoAt: null })).toBe(abertura)
  })

  it('datas no horário de Brasília, só o dia quando a fonte não informa hora', () => {
    const meiaNoiteDeBrasilia = new Date('2026-10-25T03:00:00Z')
    expect(textoDaDataDaLicitacao(meiaNoiteDeBrasilia, 'FIEG')).toBe('25/10/2026')
    expect(textoDaDataDaLicitacao(meiaNoiteDeBrasilia, 'PNCP')).toBe('25/10/2026 00:00')
    expect(textoDaDataDaLicitacao(new Date('2026-10-30T13:00:00Z'), 'PNCP')).toBe('30/10/2026 10:00')
    expect(textoDaDataDaLicitacao(null, 'PNCP')).toBeNull()
  })

  it('cidade/UF', () => {
    expect(cidadeEUf({ municipio: 'Goiânia', uf: 'GO' })).toBe('Goiânia/GO')
    expect(cidadeEUf({ municipio: null, uf: 'DF' })).toBe('DF')
    expect(cidadeEUf({ municipio: null, uf: null })).toBeNull()
  })

  it('agrupa os itens da mesma licitação e ordena por prazo, obra completa no fim', () => {
    const datas = (dia: number | null) => ({ fonte: 'PNCP', aberturaAt: null, encerramentoAt: dia ? new Date(`2026-11-${String(dia).padStart(2, '0')}T13:00:00Z`) : null })
    const grupos = agruparMatchesPorLicitacao([
      { tenderId: 'obra', nomeDoItem: 'Pintura', dentroDeObraCompleta: true, nota: 30, datas: datas(1) },
      { tenderId: 'tarde', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 70, datas: datas(20) },
      { tenderId: 'cedo', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 50, datas: datas(5) },
      { tenderId: 'cedo', nomeDoItem: 'Toner', dentroDeObraCompleta: true, nota: 80, datas: datas(5) },
      { tenderId: 'cedo', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 40, datas: datas(5) },
      { tenderId: 'sem-prazo', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 60, datas: datas(null) },
    ])
    expect(grupos.map((g) => g.tenderId)).toEqual(['cedo', 'tarde', 'sem-prazo', 'obra'])
    expect(grupos[0]).toMatchObject({ itens: ['Papel', 'Toner'], nota: 80, dentroDeObraCompleta: false })
    expect(grupos[3].dentroDeObraCompleta).toBe(true)
  })

  it('linha do match tem uma célula por coluna, com rótulos legíveis', () => {
    const [grupo] = agruparMatchesPorLicitacao([
      { tenderId: 'lic-1', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 72, datas: licitacaoDeExemplo() },
      { tenderId: 'lic-1', nomeDoItem: 'Envelope', dentroDeObraCompleta: false, nota: 60, datas: licitacaoDeExemplo() },
    ])
    const linha = linhaDoMatch(grupo, licitacaoDeExemplo(), 'https://app.example/tenders/lic-1')
    expect(linha).toHaveLength(COLUNAS_DOS_MATCHES.length)
    expect(linha).toEqual([
      'Aquisição de papel A4',
      'Prefeitura de Goiânia',
      'Goiânia/GO',
      'Pregão eletrônico',
      'PNCP',
      '30/10/2026 10:00',
      '30/10/2026 10:00',
      12345.67,
      'Papel; Envelope',
      72,
      'Não',
      'https://app.example/tenders/lic-1',
      'https://pncp.gov.br/app/editais/1',
    ])
  })

  it('linha da escolhida traz situação do plano e valor homologado', () => {
    const licitacao = licitacaoDeExemplo({ fonte: 'FIEG', modalidade: 'CONCORRENCIA', encerramentoAt: null, aberturaAt: new Date('2026-11-03T03:00:00Z'), valorHomologado: new Prisma.Decimal('9999.5') })
    const linha = linhaDaEscolhida('PARTICIPEI', licitacao, 'https://app.example/tenders/lic-1')
    expect(linha).toHaveLength(COLUNAS_DAS_ESCOLHIDAS.length)
    expect(linha.slice(3, 8)).toEqual(['Participei', '03/11/2026', '03/11/2026', 12345.67, 9999.5])
  })

  it('aviso de lista cortada e nome do arquivo pela data de Brasília', () => {
    expect(avisoDeListaCortada(5000, 'prazo mais próximo')).toContain('5.000')
    expect(nomeDoArquivoDaPlanilha('matches', new Date('2026-10-21T02:00:00Z'))).toBe('licita-bela-matches-2026-10-20.xlsx')
    expect(nomeDoArquivoDaPlanilha('escolhidas', new Date('2026-10-21T03:00:00Z'))).toBe('licita-bela-escolhidas-2026-10-21.xlsx')
  })

  it('planilha completa dos matches abre com as colunas certas', () => {
    const [grupo] = agruparMatchesPorLicitacao([{ tenderId: 'lic-1', nomeDoItem: 'Papel', dentroDeObraCompleta: false, nota: 72, datas: licitacaoDeExemplo() }])
    const p = lerPlanilha(gerarPlanilhaXlsx({ nomeDaAba: 'Meus matches', colunas: COLUNAS_DOS_MATCHES, linhas: [linhaDoMatch(grupo, licitacaoDeExemplo(), 'x')] }))
    expect(textoDaColuna(p, 'Valor estimado').get(2)).toBe('12345.67')
    expect(p.celulas.get('H2')?.estilo).toBe(2)
    expect(textoDaColuna(p, 'Nota de aderência').get(2)).toBe('72')
    expect(textoDaColuna(p, 'Dentro de obra completa').get(2)).toBe('Não')
  })
})
