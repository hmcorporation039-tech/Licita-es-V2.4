import { strToU8, zipSync } from 'fflate'
import { formatarDiaEHoraDeBrasilia } from './dataDeBrasilia'

export const TIPO_DO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type TipoDaColuna = 'texto' | 'numero' | 'moeda'

export interface ColunaDaPlanilha {
  titulo: string
  largura: number
  tipo?: TipoDaColuna
}

export type ValorDaCelula = string | number | Date | null | undefined

export interface PlanilhaParaGerar {
  nomeDaAba: string
  colunas: ColunaDaPlanilha[]
  linhas: ValorDaCelula[][]
  observacaoFinal?: string
}

const ESTILO_PADRAO = 0
const ESTILO_DO_CABECALHO = 1
const ESTILO_DE_MOEDA = 2
const ESTILO_DE_NUMERO = 3
const ESTILO_DE_TEXTO_LITERAL = 4

const MAXIMO_DE_CARACTERES_NA_CELULA = 32_767
const MAXIMO_DE_CARACTERES_NO_NOME_DA_ABA = 31
const INICIO_QUE_PARECE_FORMULA = /^[=+\-@\t\r]/
const CARACTERES_PROIBIDOS_NO_NOME_DA_ABA = /[\\/?*[\]:]/g

const NS_PLANILHA = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_RELACOES_DO_DOCUMENTO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_RELACOES_DO_PACOTE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function ehCaractereValidoNoXml(codigo: number): boolean {
  if (codigo === 0x09 || codigo === 0x0a || codigo === 0x0d) return true
  if (codigo >= 0x20 && codigo <= 0xd7ff) return true
  if (codigo >= 0xe000 && codigo <= 0xfffd) return true
  return codigo >= 0x10000 && codigo <= 0x10ffff
}

export function textoSeguroParaXml(texto: string): string {
  const pedacos: string[] = []
  let inicioDoTrechoValido = 0
  let posicao = 0
  while (posicao < texto.length) {
    const codigo = texto.codePointAt(posicao) as number
    const tamanho = codigo > 0xffff ? 2 : 1
    if (!ehCaractereValidoNoXml(codigo)) {
      pedacos.push(texto.slice(inicioDoTrechoValido, posicao))
      inicioDoTrechoValido = posicao + tamanho
    }
    posicao += tamanho
  }
  if (pedacos.length === 0) return texto
  pedacos.push(texto.slice(inicioDoTrechoValido))
  return pedacos.join('')
}

export function escaparXml(texto: string): string {
  return textoSeguroParaXml(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function letraDaColuna(indiceBaseZero: number): string {
  let resto = indiceBaseZero + 1
  let letras = ''
  while (resto > 0) {
    const posicao = (resto - 1) % 26
    letras = String.fromCharCode(65 + posicao) + letras
    resto = Math.floor((resto - 1) / 26)
  }
  return letras
}

export function nomeDeAbaValido(nome: string): string {
  const limpo = textoSeguroParaXml(nome).replace(CARACTERES_PROIBIDOS_NO_NOME_DA_ABA, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim()
  return (limpo || 'Planilha').slice(0, MAXIMO_DE_CARACTERES_NO_NOME_DA_ABA).trim()
}

function referenciaDaAba(nome: string): string {
  return `'${nome.replace(/'/g, "''")}'`
}

function celulaDeTexto(referencia: string, texto: string, estilo = ESTILO_PADRAO): string {
  const conteudo = textoSeguroParaXml(texto).slice(0, MAXIMO_DE_CARACTERES_NA_CELULA)
  const estiloFinal = estilo === ESTILO_PADRAO && INICIO_QUE_PARECE_FORMULA.test(conteudo) ? ESTILO_DE_TEXTO_LITERAL : estilo
  const atributoDeEstilo = estiloFinal === ESTILO_PADRAO ? '' : ` s="${estiloFinal}"`
  return `<c r="${referencia}" t="inlineStr"${atributoDeEstilo}><is><t xml:space="preserve">${escaparXml(conteudo)}</t></is></c>`
}

function celulaDeNumero(referencia: string, numero: number, estilo: number): string {
  return `<c r="${referencia}" s="${estilo}"><v>${numero}</v></c>`
}

function celula(referencia: string, valor: ValorDaCelula, tipo: TipoDaColuna): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : celulaDeTexto(referencia, formatarDiaEHoraDeBrasilia(valor))
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return ''
    if (tipo === 'texto') return celulaDeTexto(referencia, String(valor))
    return celulaDeNumero(referencia, valor, tipo === 'moeda' ? ESTILO_DE_MOEDA : ESTILO_DE_NUMERO)
  }
  return celulaDeTexto(referencia, valor)
}

function linhaXml(numeroDaLinha: number, conteudo: string): string {
  return `<row r="${numeroDaLinha}">${conteudo}</row>`
}

function xmlDaAba(planilha: PlanilhaParaGerar): { xml: string; intervaloDoFiltro: string } {
  const { colunas, linhas } = planilha
  const ultimaColuna = letraDaColuna(Math.max(colunas.length, 1) - 1)
  const ultimaLinhaDeDados = linhas.length + 1
  const intervaloDoFiltro = `A1:${ultimaColuna}${ultimaLinhaDeDados}`

  const cabecalho = linhaXml(1, colunas.map((c, i) => celulaDeTexto(`${letraDaColuna(i)}1`, c.titulo, ESTILO_DO_CABECALHO)).join(''))
  const dados = linhas.map((valores, indiceDaLinha) => {
    const numeroDaLinha = indiceDaLinha + 2
    const celulas = colunas.map((coluna, i) => celula(`${letraDaColuna(i)}${numeroDaLinha}`, valores[i], coluna.tipo ?? 'texto')).join('')
    return linhaXml(numeroDaLinha, celulas)
  })
  const linhaDaObservacao = ultimaLinhaDeDados + 2
  const observacao = planilha.observacaoFinal ? [linhaXml(linhaDaObservacao, celulaDeTexto(`A${linhaDaObservacao}`, planilha.observacaoFinal))] : []
  const ultimaLinha = planilha.observacaoFinal ? linhaDaObservacao : ultimaLinhaDeDados

  const larguras = colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.min(255, c.largura))}" customWidth="1"/>`)
    .join('')

  const xml =
    CABECALHO_XML +
    `<worksheet xmlns="${NS_PLANILHA}" xmlns:r="${NS_RELACOES_DO_DOCUMENTO}">` +
    `<dimension ref="A1:${ultimaColuna}${ultimaLinha}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (larguras ? `<cols>${larguras}</cols>` : '') +
    `<sheetData>${[cabecalho, ...dados, ...observacao].join('')}</sheetData>` +
    `<autoFilter ref="${intervaloDoFiltro}"/>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  return { xml, intervaloDoFiltro }
}

function xmlDoLivro(nomeDaAba: string, intervaloDoFiltro: string): string {
  const [inicio, fim] = intervaloDoFiltro.split(':')
  const absoluto = (ref: string) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')
  return (
    CABECALHO_XML +
    `<workbook xmlns="${NS_PLANILHA}" xmlns:r="${NS_RELACOES_DO_DOCUMENTO}">` +
    '<bookViews><workbookView/></bookViews>' +
    `<sheets><sheet name="${escaparXml(nomeDaAba)}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escaparXml(
      `${referenciaDaAba(nomeDaAba)}!${absoluto(inicio)}:${absoluto(fim)}`
    )}</definedName></definedNames>` +
    '</workbook>'
  )
}

const XML_DOS_ESTILOS =
  CABECALHO_XML +
  `<styleSheet xmlns="${NS_PLANILHA}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>' +
  '<fonts count="2">' +
  '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
  '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

const XML_DOS_TIPOS =
  CABECALHO_XML +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const XML_DAS_RELACOES_DO_PACOTE =
  CABECALHO_XML +
  `<Relationships xmlns="${NS_RELACOES_DO_PACOTE}">` +
  `<Relationship Id="rId1" Type="${NS_RELACOES_DO_DOCUMENTO}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const XML_DAS_RELACOES_DO_LIVRO =
  CABECALHO_XML +
  `<Relationships xmlns="${NS_RELACOES_DO_PACOTE}">` +
  `<Relationship Id="rId1" Type="${NS_RELACOES_DO_DOCUMENTO}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_RELACOES_DO_DOCUMENTO}/styles" Target="styles.xml"/>` +
  '</Relationships>'

export function gerarPlanilhaXlsx(planilha: PlanilhaParaGerar): Uint8Array {
  const nomeDaAba = nomeDeAbaValido(planilha.nomeDaAba)
  const { xml: xmlDaPrimeiraAba, intervaloDoFiltro } = xmlDaAba(planilha)
  return zipSync(
    {
      '[Content_Types].xml': strToU8(XML_DOS_TIPOS),
      '_rels/.rels': strToU8(XML_DAS_RELACOES_DO_PACOTE),
      'xl/workbook.xml': strToU8(xmlDoLivro(nomeDaAba, intervaloDoFiltro)),
      'xl/_rels/workbook.xml.rels': strToU8(XML_DAS_RELACOES_DO_LIVRO),
      'xl/worksheets/sheet1.xml': strToU8(xmlDaPrimeiraAba),
      'xl/styles.xml': strToU8(XML_DOS_ESTILOS),
    },
    { level: 6 }
  )
}
