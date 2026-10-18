import * as cheerio from 'cheerio'
import { strFromU8, unzipSync } from 'fflate'
import { ModalidadeEnum, NormalizedTender, SituacaoEnum } from '../types'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { parseDataBr, parseValorBr } from '../lib/scrapingHelpers'
import { getMunicipioByIbge, normalize } from '../lib/geoService'
import { limparTexto, truncar } from './sescRegional/tipos'
import { NOMES_DOS_MUNICIPIOS_DO_PIAUI } from './tcePiMunicipios'

export const TCE_PI_ORIGEM = 'https://sistemas.tce.pi.gov.br'
export const CAMINHO_DO_MURAL_TCE_PI = '/muralic/'
export const PREFIXO_DO_FONTE_ID_TCE_PI = 'TCE-PI-'
export const VIEW_STATE = 'javax.faces.ViewState'

const UF_DO_PIAUI = 'PI'
const IBGE_DE_TERESINA = '2211001'
const MAX_UNIDADE = 250
const MAX_PLANILHA_DESCOMPACTADA = 30 * 1024 * 1024
const DIA_MS = 86_400_000
const SUFIXO_DO_PIAUI = 'dopiaui'
const ID_NO_CAMINHO = /[?&]id=(\d+)/
const PROCESSO_ADMINISTRATIVO = /proc\.?\s*admin\.?\s*(.+)$/i
const NUMERO_DO_PROCEDIMENTO = /\bn\s*[º°o.]\s*\.?\s*(.+)$/i
const DOWNLOAD_DA_PLANILHA = /PrimeFaces\.download\(\s*'data:[^;']*;base64,([A-Za-z0-9+/=\s]+)'/
const ORGAO_DA_PREFEITURA = /^p\.?\s*m\.?\s+(?:de|do|da|dos|das)\s+/i
const ORGAO_DA_CAMARA = /^c[aâ]mara(?:\s+municipal)?\s+(?:de|do|da|dos|das)\s+/i

export class FormatoInesperadoDoTcePi extends Error {
  constructor(mensagem: string) {
    super(`TCE-PI: ${mensagem}`)
    this.name = 'FormatoInesperadoDoTcePi'
  }
}

export type CamposDoFormulario = [string, string][]

export interface FormularioDoMural {
  acao: string
  formularioDoFiltro: string
  camposDoFiltro: CamposDoFormulario
  camposDoStatus: string[]
  valorDaDivulgada: string
  botaoPesquisar: string
  camposDaLista: CamposDoFormulario
  tabela: string
  exportar: string | null
  viewState: string
}

export interface RespostaParcial {
  atualizacoes: Map<string, string>
  avaliacoes: string[]
  viewState?: string
  erro?: string
  redirecionamento?: string
}

export interface LinhaDoMuralTcePi {
  idNoMural: number
  orgao: string
  esfera: string
  controleTce: string
  procedimento: string
  processoAdministrativo?: string
  regimeJuridico?: string
  modalidade: string
  formaDeRealizacao?: string
  criterioDeJulgamento?: string
  tipoDeObjeto?: string
  objeto: string
  aberturaEm?: string
  valor?: number
  status: string
  ultimaPublicacaoEm?: string
  cadastroEm?: string
  atualizadoEm?: string
}

export interface TabelaDoMural {
  cabecalho: string[]
  total: number | null
  linhas: LinhaDoMuralTcePi[]
}

export interface PainelDinamico {
  acordeao: string
  painel: string
  indice: number
}

export interface DetalheDoTcePi {
  status: string
  aberturaEm?: string
  acao: string
  campos: CamposDoFormulario
  painelDePublicacoes: PainelDinamico | null
}

export interface PublicacaoDoTcePi {
  data?: string
  tipo: string
  meio: string
}

export interface MunicipioDoPiaui {
  nome: string
  codigoIbge: string
  lat: number
  lng: number
}

export interface LocalDoOrgao extends MunicipioDoPiaui {
  pelaSede: boolean
}

export type LeituraDoTcePi = { tipo: 'licitacao'; tender: NormalizedTender } | { tipo: 'ignorado'; motivo: string }

const CHAVES = {
  orgao: 'orgao',
  esfera: 'esfera',
  controleTce: 'n proc tce',
  procedimento: 'n procedimento',
  regimeJuridico: 'regime juridico',
  modalidade: 'modalidade',
  formaDeRealizacao: 'forma realizacao',
  criterioDeJulgamento: 'criterio julg',
  tipoDeObjeto: 'tipo objeto',
  objeto: 'objeto',
  aberturaEm: 'dt abert julg',
  valor: 'valor',
  status: 'status',
  ultimaPublicacaoEm: 'dt ult public',
  cadastroEm: 'dt cadastro',
  atualizadoEm: 'dt ult atualizacao',
  caminho: 'caminho detalhamento licitacao',
} as const

const SITUACOES: { padrao: RegExp; situacao: SituacaoEnum }[] = [
  { padrao: /^(divulgada|aberta)/, situacao: 'ABERTA' },
  { padrao: /^suspensa/, situacao: 'SUSPENSA' },
  { padrao: /^cancelada/, situacao: 'CANCELADA' },
  { padrao: /^revogada/, situacao: 'REVOGADA' },
  { padrao: /^anulada/, situacao: 'ANULADA' },
  { padrao: /^(finalizada|em homologacao|homologada|adjudicada|deserta|fracassada|encerrada|concluida)/, situacao: 'ENCERRADA' },
]

const MODALIDADES: { padrao: RegExp; modalidade: ModalidadeEnum }[] = [
  { padrao: /^concorrencia/, modalidade: 'CONCORRENCIA' },
  { padrao: /^tomada de precos?/, modalidade: 'TOMADA_DE_PRECOS' },
  { padrao: /^convite/, modalidade: 'CONVITE' },
  { padrao: /^concurso/, modalidade: 'CONCURSO' },
  { padrao: /^dialogo competitivo/, modalidade: 'DIALOGO_COMPETITIVO' },
  { padrao: /^credenciamento/, modalidade: 'CREDENCIAMENTO' },
  { padrao: /^inexigibilidade/, modalidade: 'INEXIGIBILIDADE' },
]

const MUNICIPIOS_POR_CHAVE = new Map(Object.entries(NOMES_DOS_MUNICIPIOS_DO_PIAUI).map(([codigo, nome]) => [chaveCompacta(nome), codigo]))

function chaveCompacta(texto: string): string {
  return normalize(texto).replace(/[^a-z0-9]/g, '')
}

export function chaveDoCabecalho(texto: string): string {
  return normalize(limparTexto(texto))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function fonteIdTcePi(idNoMural: number): string {
  return `${PREFIXO_DO_FONTE_ID_TCE_PI}${idNoMural}`
}

export function idNoMuralTcePi(fonteId: string): number | undefined {
  const m = fonteId.match(/^TCE-PI-(\d+)$/)
  return m ? Number(m[1]) : undefined
}

export function caminhoDoDetalheTcePi(idNoMural: number): string {
  return `/muralic/detalhelicitacao.xhtml?id=${idNoMural}`
}

export function urlDoDetalheTcePi(idNoMural: number): string {
  return `${TCE_PI_ORIGEM}${caminhoDoDetalheTcePi(idNoMural)}`
}

function caminhoDaAcao(acao: string | undefined): string {
  const caminho = (acao ?? '').split(/[;?#]/)[0]
  if (!caminho.startsWith('/')) throw new FormatoInesperadoDoTcePi('formulário sem endereço de envio')
  return caminho
}

function camposDoFormulario($: cheerio.CheerioAPI, form: cheerio.Cheerio<never>): CamposDoFormulario {
  const campos: CamposDoFormulario = []
  form.find('input[name], select[name], textarea[name]').each((_, el) => {
    const item = $(el)
    const nome = item.attr('name') ?? ''
    if (!nome || nome.endsWith('_focus')) return
    if (item.is('select')) {
      const opcao = item.find('option[selected]').first()
      campos.push([nome, (opcao.length > 0 ? opcao : item.find('option').first()).attr('value') ?? ''])
      return
    }
    if (item.is('textarea')) {
      campos.push([nome, item.text()])
      return
    }
    const tipo = (item.attr('type') ?? 'text').toLowerCase()
    if (tipo === 'submit' || tipo === 'button' || tipo === 'image' || tipo === 'file') return
    if ((tipo === 'checkbox' || tipo === 'radio') && item.attr('checked') === undefined) return
    campos.push([nome, item.attr('value') ?? ''])
  })
  return campos
}

function valorDoCampo(campos: CamposDoFormulario, nome: string): string | undefined {
  return campos.find(([n]) => n === nome)?.[1]
}

export function formularioDoMural(html: string): FormularioDoMural {
  const $ = cheerio.load(html)
  const statusDivulgada: { nome: string; valor: string }[] = []
  $('select[name]').each((_, el) => {
    const opcao = $(el)
      .find('option')
      .filter((_, o) => /^divulgada/.test(chaveDoCabecalho($(o).text())))
      .first()
    if (opcao.length > 0) statusDivulgada.push({ nome: $(el).attr('name') ?? '', valor: opcao.attr('value') ?? '' })
  })
  if (statusDivulgada.length === 0 || !statusDivulgada[0].valor) throw new FormatoInesperadoDoTcePi('filtro de status "Divulgada" não encontrado')

  const filtro = $(`select[name="${statusDivulgada[0].nome}"]`).closest('form') as cheerio.Cheerio<never>
  const botao = filtro
    .find('button[type="submit"], button[id]')
    .filter((_, b) => chaveDoCabecalho($(b).text()) === 'pesquisar')
    .first()
  const botaoPesquisar = botao.attr('id') ?? botao.attr('name')
  const tabelaEl = $('div.ui-datatable[id]')
    .filter((_, d) => $(d).find('thead th').length > 0)
    .first()
  const tabela = tabelaEl.attr('id')
  const lista = tabelaEl.closest('form') as cheerio.Cheerio<never>
  if (filtro.length === 0 || !botaoPesquisar || !tabela || lista.length === 0) throw new FormatoInesperadoDoTcePi('formulário de pesquisa fora do formato esperado')

  const camposDoFiltro = camposDoFormulario($, filtro)
  const camposDaLista = camposDoFormulario($, lista)
  const viewState = valorDoCampo(camposDoFiltro, VIEW_STATE) ?? valorDoCampo(camposDaLista, VIEW_STATE)
  if (!viewState) throw new FormatoInesperadoDoTcePi('página sem ViewState')

  const exportar = tabelaEl
    .find('a[id]')
    .filter((_, a) => /planilha|excel|xlsx/i.test(`${$(a).attr('aria-label') ?? ''} ${$(a).attr('title') ?? ''}`))
    .first()
    .attr('id')

  return {
    acao: caminhoDaAcao(filtro.attr('action')),
    formularioDoFiltro: filtro.attr('id') ?? filtro.attr('name') ?? '',
    camposDoFiltro,
    camposDoStatus: statusDivulgada.map((s) => s.nome),
    valorDaDivulgada: statusDivulgada[0].valor,
    botaoPesquisar,
    camposDaLista,
    tabela,
    exportar: exportar ?? null,
    viewState,
  }
}

function comViewState(campos: CamposDoFormulario, viewState: string): CamposDoFormulario {
  return campos.map(([nome, valor]) => [nome, nome === VIEW_STATE ? viewState : valor])
}

function requisicaoAjax(origem: string, executar: string, renderizar?: string): CamposDoFormulario {
  return [
    ['javax.faces.partial.ajax', 'true'],
    ['javax.faces.source', origem],
    ['javax.faces.partial.execute', executar],
    ...(renderizar ? [['javax.faces.partial.render', renderizar] as [string, string]] : []),
  ]
}

export function camposDaPesquisa(f: FormularioDoMural, viewState: string): CamposDoFormulario {
  const filtro = comViewState(f.camposDoFiltro, viewState).map(([nome, valor]): [string, string] => [nome, f.camposDoStatus.includes(nome) ? f.valorDaDivulgada : valor])
  return [...filtro, ...requisicaoAjax(f.botaoPesquisar, f.formularioDoFiltro, `${f.formularioDoFiltro} ${f.tabela}`), [f.botaoPesquisar, f.botaoPesquisar]]
}

export function camposDaPagina(f: FormularioDoMural, viewState: string, primeira: number, linhas: number): CamposDoFormulario {
  return [
    ...comViewState(f.camposDaLista, viewState),
    ...requisicaoAjax(f.tabela, f.tabela, f.tabela),
    [f.tabela, f.tabela],
    [`${f.tabela}_pagination`, 'true'],
    [`${f.tabela}_first`, String(primeira)],
    [`${f.tabela}_rows`, String(linhas)],
    [`${f.tabela}_skipChildren`, 'true'],
    [`${f.tabela}_encodeFeature`, 'true'],
  ]
}

export function camposDaExportacao(f: FormularioDoMural, viewState: string): CamposDoFormulario {
  if (!f.exportar) throw new FormatoInesperadoDoTcePi('lista sem botão de exportar planilha')
  return [...comViewState(f.camposDaLista, viewState), ...requisicaoAjax(f.exportar, '@all'), [f.exportar, f.exportar]]
}

function conteudoCdata(trecho: string): string {
  return [...trecho.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]).join('')
}

export function lerRespostaParcial(xml: string): RespostaParcial {
  if (!/<partial-response[\s>]/.test(xml)) throw new FormatoInesperadoDoTcePi('resposta do formulário fora do formato esperado')
  const atualizacoes = new Map<string, string>()
  for (const m of xml.matchAll(/<update id="([^"]+)">((?:\s*<!\[CDATA\[[\s\S]*?\]\]>)*)\s*<\/update>/g)) atualizacoes.set(m[1], conteudoCdata(m[2]))
  const avaliacoes = [...xml.matchAll(/<eval>((?:\s*<!\[CDATA\[[\s\S]*?\]\]>)*)\s*<\/eval>/g)].map((m) => conteudoCdata(m[1]))
  const viewState = [...atualizacoes.entries()].find(([id]) => id.includes(VIEW_STATE))?.[1]?.trim()
  const erro = xml.match(/<error-name>([\s\S]*?)<\/error-name>/)?.[1]
  const redirecionamento = xml.match(/<redirect url="([^"]*)"/)?.[1]
  return {
    atualizacoes,
    avaliacoes,
    ...(viewState ? { viewState } : {}),
    ...(erro ? { erro: limparTexto(conteudoCdata(erro) || erro) } : {}),
    ...(redirecionamento ? { redirecionamento } : {}),
  }
}

function fragmentoDeTabela(html: string): cheerio.CheerioAPI {
  return cheerio.load(/<table[\s>]/i.test(html) ? html : `<table><tbody>${html}</tbody></table>`)
}

export function cabecalhoDaTabela(html: string): string[] {
  const $ = fragmentoDeTabela(html)
  return $('thead')
    .first()
    .find('th')
    .map((_, th) => chaveDoCabecalho($(th).attr('aria-label') ?? $(th).find('.ui-column-title').text()))
    .get()
}

export function totalDaTabela(html: string): number | null {
  const bruto = html.match(/rowCount:(\d+)/)?.[1] ?? html.match(/ui-paginator-current">\s*([\d.]+)/)?.[1]?.replace(/\./g, '')
  if (bruto === undefined) return null
  const total = Number(bruto)
  return Number.isSafeInteger(total) ? total : null
}

function texto(valor: string | undefined): string | undefined {
  const limpo = limparTexto(valor)
  return limpo || undefined
}

function linhaDosCampos(campos: Map<string, string>, processoAdministrativo?: string): LinhaDoMuralTcePi | null {
  const idNoMural = Number(campos.get(CHAVES.caminho)?.match(ID_NO_CAMINHO)?.[1])
  if (!Number.isSafeInteger(idNoMural) || idNoMural <= 0) return null
  const valor = parseValorBr(campos.get(CHAVES.valor))
  return {
    idNoMural,
    orgao: limparTexto(campos.get(CHAVES.orgao)),
    esfera: limparTexto(campos.get(CHAVES.esfera)),
    controleTce: limparTexto(campos.get(CHAVES.controleTce)),
    procedimento: limparTexto(campos.get(CHAVES.procedimento)),
    processoAdministrativo: texto(processoAdministrativo),
    regimeJuridico: texto(campos.get(CHAVES.regimeJuridico)),
    modalidade: limparTexto(campos.get(CHAVES.modalidade)),
    formaDeRealizacao: texto(campos.get(CHAVES.formaDeRealizacao)),
    criterioDeJulgamento: texto(campos.get(CHAVES.criterioDeJulgamento)),
    tipoDeObjeto: texto(campos.get(CHAVES.tipoDeObjeto)),
    objeto: limparTexto(campos.get(CHAVES.objeto)),
    aberturaEm: texto(campos.get(CHAVES.aberturaEm)),
    valor: valor !== undefined && valor > 0 ? valor : undefined,
    status: limparTexto(campos.get(CHAVES.status)),
    ultimaPublicacaoEm: texto(campos.get(CHAVES.ultimaPublicacaoEm)),
    cadastroEm: texto(campos.get(CHAVES.cadastroEm)),
    atualizadoEm: texto(campos.get(CHAVES.atualizadoEm)),
  }
}

function primeiraOcorrencia(cabecalho: string[], valores: string[]): Map<string, string> {
  const campos = new Map<string, string>()
  cabecalho.forEach((chave, i) => {
    if (chave && !campos.has(chave) && valores[i] !== undefined) campos.set(chave, valores[i])
  })
  return campos
}

export function linhasDaTabela(html: string, cabecalho: string[]): LinhaDoMuralTcePi[] {
  const $ = fragmentoDeTabela(html)
  const indiceDoProcedimento = cabecalho.indexOf(CHAVES.procedimento)
  const linhas: LinhaDoMuralTcePi[] = []
  $('tr[data-ri]').each((_, tr) => {
    const celulas = $(tr).children('td')
    const valores = celulas.map((_, td) => $(td).text()).get()
    const titulo = indiceDoProcedimento >= 0 ? celulas.eq(indiceDoProcedimento).find('[title]').attr('title') : undefined
    const linha = linhaDosCampos(primeiraOcorrencia(cabecalho, valores), titulo?.match(PROCESSO_ADMINISTRATIVO)?.[1])
    if (linha) linhas.push(linha)
  })
  return linhas
}

export function tabelaDoMural(html: string): TabelaDoMural {
  const cabecalho = cabecalhoDaTabela(html)
  if (!cabecalho.includes(CHAVES.caminho) || !cabecalho.includes(CHAVES.objeto)) throw new FormatoInesperadoDoTcePi('tabela de licitações fora do formato esperado')
  return { cabecalho, total: totalDaTabela(html), linhas: linhasDaTabela(html, cabecalho) }
}

export function planilhaDaExportacao(resposta: RespostaParcial): Uint8Array {
  const base64 = resposta.avaliacoes.map((a) => a.match(DOWNLOAD_DA_PLANILHA)?.[1]).find((b) => b !== undefined)
  if (!base64) throw new FormatoInesperadoDoTcePi('exportação sem planilha')
  return new Uint8Array(Buffer.from(base64.replace(/\s+/g, ''), 'base64'))
}

function colunaDaCelula(referencia: string | undefined): string {
  return referencia?.match(/^[A-Z]+/)?.[0] ?? ''
}

function textosCompartilhados(xml: string | undefined): string[] {
  if (!xml) return []
  const $ = cheerio.load(xml, { xml: true })
  return $('si')
    .map((_, si) => $(si).find('t').map((__, t) => $(t).text()).get().join(''))
    .get()
}

export function linhasDaPlanilha(xlsx: Uint8Array): LinhaDoMuralTcePi[] {
  let arquivos: Record<string, Uint8Array>
  try {
    arquivos = unzipSync(xlsx, {
      filter: (f) => (f.name.startsWith('xl/worksheets/sheet') || f.name === 'xl/sharedStrings.xml') && f.originalSize <= MAX_PLANILHA_DESCOMPACTADA,
    })
  } catch {
    throw new FormatoInesperadoDoTcePi('planilha exportada ilegível')
  }
  const folha = Object.keys(arquivos)
    .filter((n) => n.startsWith('xl/worksheets/sheet'))
    .sort()[0]
  if (!folha) throw new FormatoInesperadoDoTcePi('planilha exportada sem folha de dados')
  const compartilhados = textosCompartilhados(arquivos['xl/sharedStrings.xml'] ? strFromU8(arquivos['xl/sharedStrings.xml']) : undefined)
  const $ = cheerio.load(strFromU8(arquivos[folha]), { xml: true })

  const tabela: Map<string, string>[] = []
  $('sheetData row').each((_, row) => {
    const celulas = new Map<string, string>()
    $(row)
      .children('c')
      .each((__, c) => {
        const celula = $(c)
        const tipo = celula.attr('t')
        const valor =
          tipo === 'inlineStr'
            ? celula.find('is t').map((___, t) => $(t).text()).get().join('')
            : tipo === 's'
              ? (compartilhados[Number(celula.children('v').text())] ?? '')
              : celula.children('v').text()
        celulas.set(colunaDaCelula(celula.attr('r')), valor)
      })
    tabela.push(celulas)
  })
  if (tabela.length === 0) return []

  const [cabecalho, ...corpo] = tabela
  const colunas = [...cabecalho.entries()].map(([coluna, titulo]) => ({ coluna, chave: chaveDoCabecalho(titulo) }))
  if (!colunas.some((c) => c.chave === CHAVES.caminho)) throw new FormatoInesperadoDoTcePi('planilha exportada fora do formato esperado')
  return corpo.flatMap((celulas) => {
    const campos = new Map<string, string>()
    for (const { coluna, chave } of colunas) if (!campos.has(chave)) campos.set(chave, celulas.get(coluna) ?? '')
    const linha = linhaDosCampos(campos)
    return linha ? [linha] : []
  })
}

function scriptsDoAcordeao(html: string): string | undefined {
  return html.match(/PrimeFaces\.cw\("AccordionPanel","[^"]*",\{id:"([^"]+)"/)?.[1]
}

export function parseDetalheTcePi(html: string): DetalheDoTcePi {
  const $ = cheerio.load(html)
  const rotulos = $('div.fundoDestaque')
  const valorDoRotulo = (padrao: RegExp): string | undefined => {
    const rotulo = rotulos.filter((_, el) => padrao.test(chaveDoCabecalho($(el).text()))).first()
    return rotulo.length > 0 ? limparTexto(rotulo.next('div').text()) : undefined
  }
  const status = valorDoRotulo(/^status licitacao$/)
  const form = $('form').first() as cheerio.Cheerio<never>
  if (!status || form.length === 0) throw new FormatoInesperadoDoTcePi('detalhe da licitação fora do formato esperado')

  const acordeao = scriptsDoAcordeao(html)
  let painelDePublicacoes: PainelDinamico | null = null
  if (acordeao) {
    const conteudos = $(`[id="${acordeao}"]`).children('.ui-accordion-content')
    const cabecalho = $(`[id="${acordeao}"]`)
      .children('.ui-accordion-header')
      .filter((_, h) => chaveDoCabecalho($(h).text()) === 'publicacoes')
      .first()
    const painel = cabecalho.attr('id')?.replace(/_header$/, '')
    const indice = painel ? conteudos.toArray().findIndex((c) => $(c).attr('id') === painel) : -1
    if (painel && indice >= 0) painelDePublicacoes = { acordeao, painel, indice }
  }

  return {
    status,
    aberturaEm: valorDoRotulo(/^data abertura$/),
    acao: caminhoDaAcao(form.attr('action')),
    campos: camposDoFormulario($, form),
    painelDePublicacoes,
  }
}

export function camposDoPainel(detalhe: DetalheDoTcePi, painel: PainelDinamico, viewState?: string): CamposDoFormulario {
  const campos = viewState ? comViewState(detalhe.campos, viewState) : detalhe.campos
  return [
    ...campos,
    ...requisicaoAjax(painel.acordeao, painel.acordeao, painel.acordeao),
    [`${painel.acordeao}_contentLoad`, 'true'],
    [`${painel.acordeao}_newTab`, painel.painel],
    [`${painel.acordeao}_tabindex`, String(painel.indice)],
  ]
}

export function publicacoesDoPainel(resposta: RespostaParcial, painel: PainelDinamico): PublicacaoDoTcePi[] {
  const html = resposta.atualizacoes.get(painel.acordeao)
  if (html === undefined) throw new FormatoInesperadoDoTcePi('painel de publicações não veio na resposta')
  const $ = fragmentoDeTabela(html)
  const cabecalho = $('thead th')
    .map((_, th) => chaveDoCabecalho($(th).attr('aria-label') ?? $(th).text()))
    .get()
  const coluna = (chave: string) => cabecalho.indexOf(chave)
  const publicacoes: PublicacaoDoTcePi[] = []
  $('tr[data-ri]').each((_, tr) => {
    const celulas = $(tr)
      .children('td')
      .map((__, td) => limparTexto($(td).text()))
      .get()
    const data = celulas[coluna('data publicacao')]
    publicacoes.push({ ...(data ? { data } : {}), tipo: celulas[coluna('tipo publicacao')] ?? '', meio: celulas[coluna('meio publicacao')] ?? '' })
  })
  return publicacoes
}

export function publicadoNoPncp(publicacoes: PublicacaoDoTcePi[]): boolean {
  return publicacoes.some((p) => /\bpncp\b|portal nacional de contrata/i.test(`${p.meio} ${p.tipo}`))
}

export function situacaoDoTcePi(status: string): SituacaoEnum | undefined {
  const chave = chaveDoCabecalho(status)
  return SITUACOES.find((s) => s.padrao.test(chave))?.situacao
}

export function modalidadeDoTcePi(modalidade: string, forma: string | undefined): ModalidadeEnum {
  const chave = chaveDoCabecalho(modalidade)
  const formaChave = chaveDoCabecalho(forma ?? '')
  if (/^pregao/.test(chave)) return /presencial/.test(chave) || formaChave === 'presencial' ? 'PREGAO_PRESENCIAL' : 'PREGAO_ELETRONICO'
  if (/^(aviso de )?dispensa/.test(chave)) return formaChave === 'eletronica' ? 'DISPENSA_COM_DISPUTA' : 'DISPENSA_SEM_DISPUTA'
  return MODALIDADES.find((m) => m.padrao.test(chave))?.modalidade ?? 'OUTROS'
}

export function municipioDoPiaui(nome: string): MunicipioDoPiaui | undefined {
  const chave = chaveCompacta(nome)
  if (!chave) return undefined
  const variacoes = [chave, `${chave}${SUFIXO_DO_PIAUI}`, chave.endsWith(SUFIXO_DO_PIAUI) ? chave.slice(0, -SUFIXO_DO_PIAUI.length) : '']
  for (const variacao of variacoes) {
    const codigo = variacao ? MUNICIPIOS_POR_CHAVE.get(variacao) : undefined
    const geo = codigo ? getMunicipioByIbge(codigo) : undefined
    if (codigo && geo) return { nome: NOMES_DOS_MUNICIPIOS_DO_PIAUI[codigo], codigoIbge: codigo, lat: geo.lat, lng: geo.lng }
  }
  return undefined
}

export function localDoOrgao(orgao: string, esfera: string): LocalDoOrgao | undefined {
  if (chaveDoCabecalho(esfera) === 'estadual') {
    const sede = municipioDoPiaui(NOMES_DOS_MUNICIPIOS_DO_PIAUI[IBGE_DE_TERESINA])
    return sede ? { ...sede, pelaSede: true } : undefined
  }
  const palavras = limparTexto(orgao).split(' ')
  for (let i = 0; i < palavras.length; i++) {
    const municipio = municipioDoPiaui(palavras.slice(i).join(' '))
    if (municipio) return { ...municipio, pelaSede: false }
  }
  return undefined
}

export function orgaoLegivel(orgao: string, local: LocalDoOrgao | undefined): string {
  const limpo = limparTexto(orgao)
  if (!local || local.pelaSede) return limpo
  if (ORGAO_DA_PREFEITURA.test(limpo)) return `Prefeitura Municipal de ${local.nome}`
  if (ORGAO_DA_CAMARA.test(limpo)) return `Câmara Municipal de ${local.nome}`
  return limpo
}

export function numeroDoProcedimento(procedimento: string): string | undefined {
  return texto(procedimento.match(NUMERO_DO_PROCEDIMENTO)?.[1])
}

export function sessaoDaLinha(linha: LinhaDoMuralTcePi): Date | undefined {
  return parseDataBr(linha.aberturaEm)
}

export function linhaComSessaoFutura(linha: LinhaDoMuralTcePi, agora: Date): boolean {
  const sessao = sessaoDaLinha(linha)
  return !!sessao && sessao.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export function cadastradaHaPouco(linha: LinhaDoMuralTcePi, agora: Date, dias: number): boolean {
  const cadastro = parseDataBr(linha.cadastroEm) ?? parseDataBr(linha.ultimaPublicacaoEm)
  return !cadastro || cadastro.getTime() >= inicioDoDiaEmBrasilia(agora).getTime() - dias * DIA_MS
}

export function assinaturaDaLinha(linha: LinhaDoMuralTcePi): string {
  return [
    linha.controleTce,
    linha.procedimento,
    normalize(linha.objeto),
    linha.modalidade,
    linha.formaDeRealizacao ?? '',
    linha.aberturaEm ?? '',
    linha.valor ?? '',
    linha.status,
    linha.atualizadoEm ?? '',
  ].join('|')
}

export function tenderDoTcePi(linha: LinhaDoMuralTcePi): LeituraDoTcePi {
  const situacao = situacaoDoTcePi(linha.status)
  if (!situacao) return { tipo: 'ignorado', motivo: `situação desconhecida (${linha.status || 'vazia'})` }
  if (!linha.objeto) return { tipo: 'ignorado', motivo: 'sem objeto' }
  const aberturaAt = sessaoDaLinha(linha)
  if (!aberturaAt) return { tipo: 'ignorado', motivo: 'sem data de abertura' }

  const local = localDoOrgao(linha.orgao, linha.esfera)
  const orgao = orgaoLegivel(linha.orgao, local)
  const numero = numeroDoProcedimento(linha.procedimento)
  const srp = /registro de pre[cç]os?/i.test(linha.objeto) ? true : undefined

  const tender: NormalizedTender = {
    fonte: 'TCE_PI',
    fonteId: fonteIdTcePi(linha.idNoMural),
    modalidade: modalidadeDoTcePi(linha.modalidade, linha.formaDeRealizacao),
    situacao,
    objeto: linha.objeto,
    objetoResumido: truncar(linha.objeto),
    valorEstimado: linha.valor,
    srp,
    uf: UF_DO_PIAUI,
    municipio: local?.nome,
    municipioIbge: local?.codigoIbge,
    municipioLat: local?.lat,
    municipioLng: local?.lng,
    orgao: orgao || undefined,
    unidade: local?.pelaSede ? truncar(limparTexto(linha.orgao), MAX_UNIDADE) : undefined,
    aberturaAt,
    publicadoAt: parseDataBr(linha.ultimaPublicacaoEm) ?? parseDataBr(linha.cadastroEm),
    linkEdital: urlDoDetalheTcePi(linha.idNoMural),
    numeroControle: numero ?? (linha.procedimento || undefined),
    rawJson: {
      idNoMural: linha.idNoMural,
      controleTce: linha.controleTce || null,
      procedimento: linha.procedimento || null,
      numero: numero ?? null,
      processoAdministrativo: linha.processoAdministrativo ?? null,
      esfera: linha.esfera || null,
      orgaoNaOrigem: linha.orgao || null,
      municipioPelaSede: local?.pelaSede ?? false,
      regimeJuridico: linha.regimeJuridico ?? null,
      modalidadeNaOrigem: linha.modalidade || null,
      formaDeRealizacao: linha.formaDeRealizacao ?? null,
      criterioDeJulgamento: linha.criterioDeJulgamento ?? null,
      tipoDeObjeto: linha.tipoDeObjeto ?? null,
      situacaoNaOrigem: linha.status || null,
      ultimaPublicacaoEm: linha.ultimaPublicacaoEm ?? null,
      cadastroEm: linha.cadastroEm ?? null,
      atualizadoEm: linha.atualizadoEm ?? null,
      assinaturaDaLista: assinaturaDaLinha(linha),
    },
  }

  return { tipo: 'licitacao', tender }
}
