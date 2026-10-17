import { ModalidadeEnum, NormalizedTender } from '../types'
import { safeHttpUrl } from '../lib/html'
import { getMunicipioByIbge } from '../lib/geoService'
import { horaDeBrasilia } from '../lib/dataDeBrasilia'

export interface GazetaQueridoDiario {
  territory_id: string
  territory_name: string
  state_code: string
  date: string
  url: string
  txt_url?: string | null
  edition?: string | null
  is_extra_edition?: boolean | null
}

export interface ResultadoDoDiario {
  tenders: NormalizedTender[]
  avisos: number
  descartadosPorPncp: number
}

export interface BlocoDeAviso {
  texto: string
  secao?: string
}

type FamiliaDeModalidade =
  | 'PREGAO'
  | 'CONCORRENCIA'
  | 'DISPENSA'
  | 'TOMADA'
  | 'CREDENCIAMENTO'
  | 'CHAMAMENTO'
  | 'LEILAO'
  | 'CONVITE'

export interface ModalidadeIdentificada {
  familia: FamiliaDeModalidade
  modalidade: ModalidadeEnum
  rotulo: string
  numero: string
  fim: number
}

const TAMANHO_MAXIMO_DO_BLOCO = 3000
const TAMANHO_MAXIMO_DO_OBJETO = 1000
const TAMANHO_MINIMO_DO_OBJETO = 20
const TAMANHO_DO_RESUMO = 200
const TAMANHO_DO_TRECHO = 1500
const TAMANHO_DO_CABECALHO_SEM_OBJETO = 800
const TAMANHO_DO_TRECHO_APOS_O_OBJETO = 300
const TAMANHO_MAXIMO_DE_LINHA_REPETIDA = 150
const REPETICOES_DE_LINHA_DE_PAGINA = 3
const LINHAS_OLHADAS_ANTES_DO_AVISO = 8
const DIAS_MAXIMOS_ATE_A_SESSAO = 400
const DIA_MS = 86_400_000

const MESES: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
}

const MODALIDADES_DO_TITULO = String.raw`(?:LICITACAO|PREGAO|EDITAL|CHAMAMENTO|CHAMADA PUBLICA|CONTRATACAO DIRETA|DISPENSA|CREDENCIAMENTO|CONCORRENCIA|TOMADA DE PRECOS?|LEILAO|COTACAO)`
const INICIO_DE_AVISO = new RegExp(
  String.raw`^(?:(?:EXTRATO\s*(?:[-–—:]\s*|D[OE]\s+)?)?AVISO DE (?:(?:ABERTURA|PUBLICACAO|REABERTURA|REPUBLICACAO|RETOMADA) DE )?${MODALIDADES_DO_TITULO}\b|EXTRATO D[OE] EDITAL D[EO] ${MODALIDADES_DO_TITULO}\b|TERMO DE ABERTURA(?: D[EO] ${MODALIDADES_DO_TITULO}\b)?$)`
)

const COMPLEMENTO_ACEITO_EM_TITULO_MISTO = /^(?:$|\s*[-–—:(]|\s*N\s*[º°O.]|\.\s+(?:A|O|AS|OS)\s)/

const FIM_DE_BLOCO_EM_MAIUSCULAS =
  /^(?:AVISOS? DE|AVISOS?,|EXTRATOS?\b|TERMO DE|TERMO ADITIVO|TERMOS ADITIVOS|PORTARIA|DECRETO|RESULTADO|HOMOLOGA|RATIFICA|ADJUDICA|LEI N|LEI COMPLEMENTAR|LEI MUNICIPAL|EDITAL DE CONVOCA|EDITAL DE NOTIFICA|EDITAL DE CITA|ERRATA|RETIFICA|ATA DE|CONTRATO N|RESOLUCAO|DESPACHO|ATO DE|ATOS DO|NOTIFICACAO|COMUNICADO|JULGAMENTO|CONVOCACAO|PARECER|ORDEM DE SERVICO)/

const ROTULO_DE_SECAO =
  /^(?:AVISOS? DE [A-Z ]{3,40}|EXTRATOS?(?: DE [A-Z ]{0,40})?|SUSPENSAO|SUSPENSOES|REVOGACAO|ANULACAO|HOMOLOGACAO.*|ADJUDICACAO.*|RESULTADOS?.*|RATIFICACAO|RATIFICACOES|PORTARIAS?|DECRETOS?|LEIS?|RESOLUCOES?|EDITAIS|ATOS OFICIAIS|OUTROS ATOS OFICIAIS|LICITACOES E CONTRATOS|LICITACOES|CONTRATOS?|TERMOS? ADITIVOS?|ERRATAS?|CONVOCACOES|ATAS?(?: DE [A-Z ]{0,40})?|DIVERSOS)$/

const CONTRATACAO_JA_DEFINIDA = /\bRATIFIC|\bEM PROL D[AO] EMPRESA\b|\bCONTRATAD[AO]\s*:/

const SITUACAO_QUE_DESCARTA =
  /SUSPENS|REVOGA|ANULA(?:CAO|DA|DO)|ADIAMENTO|ADIAD|RESULTADO|HOMOLOGA|ADJUDICA|RETIFICA|ERRATA|DESERT|FRACASSAD|CANCELAMENTO|CANCELAD|PRORROGACAO|PRORROGAD|IMPUGNACAO|RATIFICA/

const ROTULO_DO_OBJETO = /\bOBJETO(?: DA LICITACAO| DO CERTAME| DA CONTRATACAO| DO PREGAO)?\s*[:\-–—]\s*/
const OBJETO_IMPLICITO =
  /\b(?:O OBJETO D[AE] PRESENTE [A-Z ]{3,30}? E|CUJO OBJETO(?: E| SERA| CONSISTE EM)?|TENDO (?:COMO|POR) OBJETO|COM O OBJETIVO DE|QUE OBJETIVA|OBJETIVANDO|VISANDO)\s*(?:[:\-–]\s*)?(?:(?:A|O|AS|OS|AO|AOS)\s+)?/
const OBJETO_LOGO_APOS_O_NUMERO = /^\s*(?:[:\-–—]\s*(?=\p{Lu})|(?=[“"]))/u
const OBJETO_PELA_FINALIDADE =
  /\b(?:PARA|CONVENIENCIA\s+E\s+NECESSIDADE\s+D[AEO])\s+(?:(?:O|A)\s+)?(?=(?:CREDENCIAMENTO|CONTRATACAO|AQUISICAO|PRESTACAO|EXECUCAO|FORNECIMENTO|LOCACAO|REGISTRO\s+DE\s+PRECOS?|SELECAO)\b)/
const FIM_DO_OBJETO_PELA_FINALIDADE = /,\s*(?:CONFORME|MEDIANTE|NOS TERMOS|SOLICITANDO|EM CONFORMIDADE)\b/

const ROTULOS_QUE_ENCERRAM_O_OBJETO = [
  'DATA',
  'DATAS',
  'ABERTURA',
  'EDITAL',
  'SESSAO',
  'LOCAL',
  'REALIZACAO',
  'INFORMACOES',
  'VALOR',
  'OS INTERESSADOS',
  'A SESSAO',
  'MAIS INFORMACOES',
  'RETIRADA',
  'RECEBIMENTO',
  'CREDENCIAMENTO',
  'ID DA CONTRATACAO',
  'ID CONTRATACAO',
  'INICIO',
  'PRAZO',
  'O EDITAL',
  'A INTEGRA',
  'O VALOR',
  'CRITERIO',
  'MODO DE DISPUTA',
  'TIPO',
  'ENTREGA',
  'ACOLHIMENTO',
  'HORARIO',
  'DOTACAO',
  'FUNDAMENTO',
  'BASE LEGAL',
  'PROCESSO',
  'MODALIDADE',
  'LINK',
  'ENDERECO',
  'PLATAFORMA',
  'DISPUTA',
  'DISPONIBILIDADE',
  'ESCLARECIMENTOS',
  'TELEFONE',
  'E-MAIL',
  'EMAIL',
  'CONTATO',
  'PUBLIQUE-SE',
  'CERTIFICACAO DIGITAL',
  'VERSAO ELETRONICA',
  'PREGOEIRO',
  'PREGOEIRA',
  'AGENTE DE CONTRATACAO',
]

const FIM_DO_OBJETO_POR_ROTULO = new RegExp(
  String.raw`(?:^|[.;]\s|\n|\s[-–]\s)\s*(?:${ROTULOS_QUE_ENCERRAM_O_OBJETO.map((r) => r.replace(/-/g, '\\-')).join('|')})\b`,
  'g'
)
const FIM_DO_OBJETO_POR_CAMPO =
  /[\s,](?:DATAS?|HORARIOS?|DATA\s*\/\s*HORA(?:RIO)?|DATA E HORA(?:RIO)?|ABERTURA|SESSAO(?: PUBLICA)?|LOCAL|VALOR(?: ESTIMADO| GLOBAL| MAXIMO| TOTAL)?|PRAZO|RECEBIMENTO(?: DAS PROPOSTAS)?|INFORMACOES|DISPUTA|CRITERIO(?: DE JULGAMENTO)?|MODO DE DISPUTA|TIPO(?: DE LICITACAO| DE JULGAMENTO)?)\s*:/g
const PALAVRA_SOLTA_NO_FIM = /[\s,]+(?:na|no|nas|nos|de|da|do|das|dos|e|em|para|a|o|as|os|com|ao|aos|à|às|pela|pelo)$/i

const MARCADOR_DE_NUMERO = String.raw`(?:N\s*\.?\s*[º°O]?\s*\.?\s*[º°]?\s*\.?|NUMERO|NRO\.?)?\s*:?\s*`
const NUMERO_COM_ANO = String.raw`(\d{1,3}\.\d{3}|\d{1,6})\s*[\/-]\s*(20\d{2}|\d{2})([A-Z])?(?![\d\/])`
const PALAVRAS_DO_QUALIFICADOR = [
  'ELETRONIC[OA]',
  'PRESENCIAL',
  'SRP',
  'SISTEMA DE REGISTRO DE PRECOS?',
  'PARA REGISTRO DE PRECOS?',
  'REGISTRO DE PRECOS?',
  'DE LICITACAO',
  'PUBLIC[OA]',
  'NA FORMA ELETRONICA',
  'FORMA ELETRONICA',
  'MODALIDADE',
].map((p) => p.replace(/ /g, '\\s+'))
const QUALIFICADOR = String.raw`((?:\s*[-–,]?\s*\(?\s*(?:${PALAVRAS_DO_QUALIFICADOR.join('|')})\s*\)?)*)`

const MODALIDADE_POR_EXTENSO = new RegExp(
  String.raw`\b(PREGAO|CONCORRENCIA|DISPENSA|TOMADA\s+DE\s+PRECOS?|CREDENCIAMENTO|CHAMAMENTO\s+PUBLICO|CHAMADA\s+PUBLICA|COTACAO(?:\s+DE\s+PRECOS?)?|LEILAO|CONVITE)\b${QUALIFICADOR}\s*[-–,]?\s*${MARCADOR_DE_NUMERO}${NUMERO_COM_ANO}`,
  'g'
)
const MODALIDADE_ABREVIADA = new RegExp(String.raw`\b(PE|PP)\s*${MARCADOR_DE_NUMERO}${NUMERO_COM_ANO}`, 'g')

const ID_DO_PNCP =
  /\b\d{14}\s*-\s*\d\s*-\s*\d{6}\s*\/\s*\d{4}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*-\s*\d\s*-\s*\d{6}\s*\/\s*\d{4}\b|pncp\.gov\.br\/app\/editais\/\d{14}/i

const NUCLEO_DE_ORGAO = String.raw`PREFEITURA|C[ÂA]MARA|FUNDO|SECRETARIA|AUTARQUIA|SERVI[ÇC]O|CONS[ÓO]RCIO|INSTITUTO|HOSPITAL|FUNDA[ÇC][ÃA]O|MUNIC[ÍI]PIO|SAAE|SOCIEDADE|COMPANHIA|EMPRESA MUNICIPAL|UNIVERSIDADE`
const ORGAO_DECLARADO = new RegExp(String.raw`\b(?:A|O)\s+((${NUCLEO_DE_ORGAO})\b[^,;\n()]{3,120})`, 'gi')
const ORGAO_DA_SECAO = new RegExp(String.raw`^((${NUCLEO_DE_ORGAO})\b.{3,120})$`, 'i')
const CORTE_DO_ORGAO =
  /\s+[-–—]\s+|\/|\s+(?:torna|tornam|por meio|atrav[ée]s|inscrit|pessoa jur[íi]dica|com sede|cnpj|situad|neste ato|estado d|realizar[áa]|far[áa]|comunica|avisa|informa|no uso|em cumprimento|em atendimento|de acordo|nos termos|mediante|pretende)(?!\p{L})|(?<=\p{L}{4})\.\s/iu
const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

const HOSTS_QUE_NAO_SAO_EDITAL = ['planalto.gov.br', 'in.gov.br', 'lexml.gov.br', 'queridodiario.ok.org.br']

const ROTULOS_DA_MODALIDADE: Record<FamiliaDeModalidade, string> = {
  PREGAO: 'Pregão',
  CONCORRENCIA: 'Concorrência',
  DISPENSA: 'Dispensa',
  TOMADA: 'Tomada de Preços',
  CREDENCIAMENTO: 'Credenciamento',
  CHAMAMENTO: 'Chamamento Público',
  LEILAO: 'Leilão',
  CONVITE: 'Convite',
}

export function prepararTextoDoDiario(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f\t\f\v]/g, ' ')
    .replace(/\ufb01/g, 'fi')
    .replace(/\ufb02/g, 'fl')
    .replace(/\ufb00/g, 'ff')
    .replace(/[\u200b\u00ad\ufeff]/g, '')
    .replace(/(\p{Ll})-[ ]*\n[ \n]*(\p{Ll})/gu, '$1$2')
    .replace(/(\p{Lu}{2})-[ ]*\n[ \n]*(\p{Lu}{2})/gu, '$1$2')
}

export function chaveDeBusca(texto: string): string {
  let resultado = ''
  for (const caractere of texto) {
    if (caractere.length !== 1) {
      resultado += caractere
      continue
    }
    const base = caractere.normalize('NFD')[0]
    const maiuscula = base.toUpperCase()
    resultado += maiuscula.length === 1 ? maiuscula : base
  }
  return resultado
}

function compactar(texto: string): string {
  return texto.replace(/[ ]+/g, ' ').replace(/ ?\n[\n ]*/g, '\n').trim()
}

function ehLinhaDeSumario(linha: string): boolean {
  return /(?:\.\s?){4,}/.test(linha) || /…{2,}/.test(linha) || /_{4,}/.test(linha)
}

function ehSeparador(linha: string): boolean {
  const semEspaco = linha.replace(/\s/g, '')
  return semEspaco.length >= 8 && /^[.\-_=*•~]+$/.test(semEspaco)
}

function prefixoEmMaiusculas(original: string, tamanho: number): boolean {
  const prefixo = original.slice(0, tamanho)
  return prefixo === prefixo.toUpperCase()
}

function ehInicioDeAviso(original: string, chave: string): boolean {
  const m = chave.match(INICIO_DE_AVISO)
  if (!m || ehLinhaDeSumario(original)) return false
  if (prefixoEmMaiusculas(original, m[0].length)) return true
  return COMPLEMENTO_ACEITO_EM_TITULO_MISTO.test(chave.slice(m[0].length))
}

function ehFimDeBloco(original: string, chave: string): boolean {
  if (ehSeparador(original)) return true
  const m = chave.match(FIM_DE_BLOCO_EM_MAIUSCULAS)
  if (m && prefixoEmMaiusculas(original, m[0].length)) return true
  return original.length <= 60 && !/[.,;:]$/.test(original) && ROTULO_DE_SECAO.test(chave)
}

function linhasDePagina(linhas: { original: string; chave: string }[]): Set<string> {
  const contagem = new Map<string, number>()
  for (const { original, chave } of linhas) {
    if (original.length < 4 || original.length > TAMANHO_MAXIMO_DE_LINHA_REPETIDA) continue
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  const repetidas = new Set<string>()
  for (const [chave, vezes] of contagem) {
    if (vezes >= REPETICOES_DE_LINHA_DE_PAGINA) repetidas.add(chave)
  }
  return repetidas
}

const LINHA_DE_PAGINA =
  /^(?:\d{1,4}|(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?\s+\d{1,4}|P[AÁ]GINA \d+(?: DE \d+)?|ANO [IVXLC]+\b.{0,40}|EDI[CÇ][AÃ]O N.{0,40}|(?:SEGUNDA|TER[CÇ]A|QUARTA|QUINTA|SEXTA)-FEIRA,? \d{1,2} DE \p{L}+ DE \d{4}|S[AÁ]BADO,? \d{1,2} DE \p{L}+ DE \d{4}|DOMINGO,? \d{1,2} DE \p{L}+ DE \d{4})$/iu

function ehLinhaDePagina(original: string, chave: string, repetidas: Set<string>): boolean {
  if (LINHA_DE_PAGINA.test(original)) return true
  if (!repetidas.has(chave)) return false
  if (ehInicioDeAviso(original, chave) || ehFimDeBloco(original, chave)) return false
  const orgao = ORGAO_DA_SECAO.exec(original)
  if (orgao && tipoDoOrgao(orgao[2])) return false
  if (/(?:^|\s)\p{Ll}+$/u.test(original)) return false
  if (/^(?:OBJETO|EDITAL|LOCAL|DATA|ID DA|ABERTURA|SESSAO)\b/.test(chave)) return false
  return true
}

function secaoAnterior(anteriores: string[]): string | undefined {
  for (let i = anteriores.length - 1; i >= 0; i--) {
    const linha = anteriores[i]
    if (linha.length > 120 || ehSeparador(linha)) return undefined
    if (/\d|[.,;:]$/.test(linha)) continue
    const m = ORGAO_DA_SECAO.exec(linha)
    if (m && tipoDoOrgao(m[2])) return m[1]
  }
  return undefined
}

export function separarBlocosDeAviso(texto: string): BlocoDeAviso[] {
  const linhas = prepararTextoDoDiario(texto)
    .split('\n')
    .map((l) => {
      const original = l.replace(/\s+/g, ' ').trim()
      return { original, chave: chaveDeBusca(original) }
    })
  const repetidas = linhasDePagina(linhas)
  const blocos: BlocoDeAviso[] = []
  const anteriores: string[] = []
  let atual: string[] | null = null
  let secao: string | undefined
  let tamanhoAtual = 0

  const fechar = () => {
    if (atual) blocos.push({ texto: atual.join('\n').slice(0, TAMANHO_MAXIMO_DO_BLOCO), secao })
    atual = null
    tamanhoAtual = 0
  }

  for (const { original, chave } of linhas) {
    if (original === '' || ehLinhaDePagina(original, chave, repetidas)) {
      if (atual && original === '') atual.push('')
      continue
    }

    if (ehInicioDeAviso(original, chave)) {
      fechar()
      secao = secaoAnterior(anteriores)
      atual = [original]
      tamanhoAtual = original.length
      continue
    }

    anteriores.push(original)
    if (anteriores.length > LINHAS_OLHADAS_ANTES_DO_AVISO) anteriores.shift()

    if (!atual) continue

    if (ehFimDeBloco(original, chave)) {
      fechar()
      continue
    }

    atual.push(original)
    tamanhoAtual += original.length + 1
    if (tamanhoAtual >= TAMANHO_MAXIMO_DO_BLOCO) fechar()
  }
  fechar()

  return blocos
}

function normalizarNumero(sequencia: string, ano: string, sufixo?: string): string | null {
  const seq = sequencia.replace(/\./g, '').replace(/^0+(?=\d)/, '')
  const anoCompleto = ano.length === 2 ? `20${ano}` : ano
  const anoNumerico = Number(anoCompleto)
  if (anoNumerico < 2015 || anoNumerico > new Date().getUTCFullYear() + 1) return null
  if (Number(seq) === 0) return null
  return `${seq}/${anoCompleto}${sufixo ?? ''}`
}

function familiaPorPalavra(palavra: string): FamiliaDeModalidade {
  if (palavra === 'PREGAO' || palavra === 'PE' || palavra === 'PP') return 'PREGAO'
  if (palavra === 'CONCORRENCIA') return 'CONCORRENCIA'
  if (palavra === 'DISPENSA' || palavra.startsWith('COTACAO')) return 'DISPENSA'
  if (palavra.startsWith('TOMADA')) return 'TOMADA'
  if (palavra === 'CREDENCIAMENTO') return 'CREDENCIAMENTO'
  if (palavra.startsWith('CHAMAMENTO') || palavra.startsWith('CHAMADA')) return 'CHAMAMENTO'
  if (palavra === 'LEILAO') return 'LEILAO'
  return 'CONVITE'
}

function resolverModalidade(
  familia: FamiliaDeModalidade,
  palavra: string,
  qualificador: string,
  chaveDoBloco: string
): { modalidade: ModalidadeEnum; rotulo: string } {
  switch (familia) {
    case 'PREGAO': {
      const presencial =
        palavra === 'PP' ||
        /PRESENCIAL/.test(qualificador) ||
        (!/ELETRONIC/.test(qualificador) &&
          palavra !== 'PE' &&
          /PREGAO\s*\(?\s*PRESENCIAL|FORMA PRESENCIAL|MODALIDADE PRESENCIAL/.test(chaveDoBloco))
      return presencial
        ? { modalidade: 'PREGAO_PRESENCIAL', rotulo: 'Pregão Presencial' }
        : { modalidade: 'PREGAO_ELETRONICO', rotulo: 'Pregão Eletrônico' }
    }
    case 'DISPENSA': {
      const comDisputa = /ELETRONIC|COTACAO|DISPUTA|LANCES/.test(qualificador + ' ' + chaveDoBloco)
      return { modalidade: comDisputa ? 'DISPENSA_COM_DISPUTA' : 'DISPENSA_SEM_DISPUTA', rotulo: ROTULOS_DA_MODALIDADE.DISPENSA }
    }
    case 'CONCORRENCIA':
      return { modalidade: 'CONCORRENCIA', rotulo: ROTULOS_DA_MODALIDADE.CONCORRENCIA }
    case 'TOMADA':
      return { modalidade: 'TOMADA_DE_PRECOS', rotulo: ROTULOS_DA_MODALIDADE.TOMADA }
    case 'CREDENCIAMENTO':
      return { modalidade: 'CREDENCIAMENTO', rotulo: ROTULOS_DA_MODALIDADE.CREDENCIAMENTO }
    case 'CHAMAMENTO':
      return { modalidade: 'CREDENCIAMENTO', rotulo: ROTULOS_DA_MODALIDADE.CHAMAMENTO }
    case 'CONVITE':
      return { modalidade: 'CONVITE', rotulo: ROTULOS_DA_MODALIDADE.CONVITE }
    default:
      return { modalidade: 'OUTROS', rotulo: ROTULOS_DA_MODALIDADE.LEILAO }
  }
}

export function identificarModalidade(trecho: string, chaveDoBloco: string = trecho): ModalidadeIdentificada | null {
  const candidatos: { indice: number; fim: number; palavra: string; qualificador: string; numero: string }[] = []

  for (const regex of [MODALIDADE_POR_EXTENSO, MODALIDADE_ABREVIADA]) {
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(trecho))) {
      const porExtenso = regex === MODALIDADE_POR_EXTENSO
      const palavra = m[1].replace(/\s+/g, ' ')
      const qualificador = porExtenso ? m[2] ?? '' : ''
      const [sequencia, ano, sufixo] = porExtenso ? [m[3], m[4], m[5]] : [m[2], m[3], m[4]]
      const numero = normalizarNumero(sequencia, ano, sufixo)
      if (numero) candidatos.push({ indice: m.index, fim: m.index + m[0].length, palavra, qualificador, numero })
    }
  }

  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => a.indice - b.indice)
  const escolhido = candidatos[0]
  const familia = familiaPorPalavra(escolhido.palavra)
  const { modalidade, rotulo } = resolverModalidade(familia, escolhido.palavra, escolhido.qualificador, chaveDoBloco)
  return { familia, modalidade, rotulo, numero: escolhido.numero, fim: escolhido.fim }
}

function ehFimDeFrase(original: string, indicePonto: number): boolean {
  const depois = original.slice(indicePonto + 1)
  if (depois.trim() === '') return true
  if (!/^\s+[\p{Lu}"“(]/u.test(depois)) return false
  const palavraAntes = original.slice(0, indicePonto).match(/(\p{L}+)$/u)?.[1] ?? ''
  if (palavraAntes.length === 0) return true
  if (palavraAntes.length === 1) return false
  if (palavraAntes.length <= 3 && palavraAntes !== palavraAntes.toUpperCase()) return false
  return true
}

interface InicioDoObjeto {
  rotulo: number
  texto: number
  pelaFinalidade?: boolean
}

function localizarInicioDoObjeto(chave: string, inicioForcado?: number): InicioDoObjeto | null {
  const explicito = ROTULO_DO_OBJETO.exec(chave)
  if (explicito) return { rotulo: explicito.index, texto: explicito.index + explicito[0].length }
  const implicito = OBJETO_IMPLICITO.exec(chave)
  if (implicito) return { rotulo: implicito.index, texto: implicito.index + implicito[0].length }
  const aposNumero = inicioForcado === undefined ? null : OBJETO_LOGO_APOS_O_NUMERO.exec(chave.slice(inicioForcado))
  if (aposNumero && inicioForcado !== undefined) return { rotulo: inicioForcado, texto: inicioForcado + aposNumero[0].length }
  const finalidade = OBJETO_PELA_FINALIDADE.exec(chave)
  if (finalidade) return { rotulo: finalidade.index, texto: finalidade.index + finalidade[0].length, pelaFinalidade: true }
  return null
}

function primeiroFimPorRegex(regex: RegExp, chave: string, plano: string, inicio: number, limite: number): number {
  regex.lastIndex = inicio
  let m: RegExpExecArray | null
  while ((m = regex.exec(chave))) {
    if (m.index >= limite) return -1
    const posicaoDoRotulo = m.index + m[0].search(/[A-Z]/)
    if (posicaoDoRotulo <= inicio + 5) continue
    if (!/\p{Lu}/u.test(plano[posicaoDoRotulo] ?? '')) continue
    return /^[.;]/.test(m[0]) ? m.index + 1 : m.index
  }
  return -1
}

function fimDoObjetoEntreAspas(plano: string, inicio: number, limite: number): number {
  const abertura = /^\s*([“"])/.exec(plano.slice(inicio, inicio + 5))
  if (!abertura) return -1
  const posicaoDaAbertura = inicio + abertura[0].length
  const fechamento = abertura[1] === '“' ? '”' : '"'
  const posicao = plano.indexOf(fechamento, posicaoDaAbertura)
  return posicao !== -1 && posicao < limite ? posicao : -1
}

export function extrairObjeto(
  plano: string,
  chave: string,
  inicioForcado?: number
): { objeto: string; inicio: number; fim: number } | null {
  const inicioDoObjeto = localizarInicioDoObjeto(chave, inicioForcado)
  if (!inicioDoObjeto) return null
  const inicio = inicioDoObjeto.texto
  const limite = Math.min(plano.length, inicio + TAMANHO_MAXIMO_DO_OBJETO + 200)
  const fimEntreAspas = fimDoObjetoEntreAspas(plano, inicio, limite)

  const fins = fimEntreAspas !== -1 ? [fimEntreAspas] : [
    primeiroFimPorRegex(FIM_DO_OBJETO_POR_ROTULO, chave, plano, inicio, limite),
    primeiroFimPorRegex(FIM_DO_OBJETO_POR_CAMPO, chave, plano, inicio, limite),
  ].filter((f) => f !== -1)
  let fim = fins.length > 0 ? Math.min(...fins) : -1

  for (let i = inicio + TAMANHO_MINIMO_DO_OBJETO; fimEntreAspas === -1 && i < (fim === -1 ? limite : fim); i++) {
    if (plano[i] === '.' && ehFimDeFrase(plano, i)) {
      fim = i
      break
    }
  }

  if (fim === -1) return null
  const corteDaFinalidade = inicioDoObjeto.pelaFinalidade ? FIM_DO_OBJETO_PELA_FINALIDADE.exec(chave.slice(inicio, fim)) : null
  if (corteDaFinalidade) fim = inicio + corteDaFinalidade.index

  let objeto = plano
    .slice(inicio, fim)
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—"“”'-]+/, '')
    .replace(/[\s.,;:–—"“”'-]+$/, '')
    .trim()
  while (PALAVRA_SOLTA_NO_FIM.test(objeto)) objeto = objeto.replace(PALAVRA_SOLTA_NO_FIM, '').replace(/[\s.,;:–—-]+$/, '')

  if (objeto.length < TAMANHO_MINIMO_DO_OBJETO) return null
  const letras = objeto.match(/\p{L}/gu)?.length ?? 0
  if (letras < objeto.length * 0.6) return null

  const limitado =
    objeto.length > TAMANHO_MAXIMO_DO_OBJETO ? objeto.slice(0, TAMANHO_MAXIMO_DO_OBJETO - 1).trimEnd() + '…' : objeto
  return { objeto: primeiraMaiuscula(limitado), inicio: inicioDoObjeto.rotulo, fim }
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function dataLocalParaUtc(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date | null {
  if (hora > 23 || minuto > 59) return null
  const dataSemHora = new Date(Date.UTC(ano, mes - 1, dia))
  if (dataSemHora.getUTCFullYear() !== ano || dataSemHora.getUTCMonth() !== mes - 1 || dataSemHora.getUTCDate() !== dia) {
    return null
  }
  return horaDeBrasilia(ano, mes - 1, dia, hora, minuto)
}

const DATA_POR_EXTENSO = new RegExp(
  String.raw`(?<!\d)(\d{1,2})\s*[º°O]?\s+DE\s+(${Object.keys(MESES).join('|')})\s+DE\s+(\d{4})`,
  'g'
)
const DATA_NUMERICA = /(?<![\d./])(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[/.]\s*(\d{4})(?![\d/])/g
const HORA_DEPOIS = /^[^\d]{0,50}?(?<!\d)(\d{1,2})\s*(?:H|:|HORAS?\b)\s*(\d{2})?/
const HORA_ANTES = /(?<!\d)(\d{1,2})\s*(?:H|:)\s*(\d{2})?\s*(?:MIN(?:UTOS)?)?\s*(?:DO DIA|DE|,)?\s*$/
const CONTEXTO_DE_ASSINATURA = /(?:ASSINAD|PUBLICAD|DISPONIBILIZAD|EMITID|GERAD|CERTIFICAD|IMPRESS)[^.]{0,40}$/
const CONTEXTO_DE_SESSAO =
  /(?:ABERTURA|SESSAO|DISPUTA|REALIZAR|REALIZACAO|CERTAME|LANCES|JULGAMENTO|ENVELOPES|PROPOSTAS)[^.]{0,60}$/

export function extrairAbertura(chave: string, dataDoDiario: Date): Date | undefined {
  const minimo = dataDoDiario.getTime() - DIA_MS / 2
  const maximo = dataDoDiario.getTime() + DIAS_MAXIMOS_ATE_A_SESSAO * DIA_MS
  const candidatos: { data: Date; comHora: boolean; comContexto: boolean }[] = []

  const avaliar = (indice: number, tamanho: number, ano: number, mes: number, dia: number) => {
    const depois = chave.slice(indice + tamanho, indice + tamanho + 60)
    const antes = chave.slice(Math.max(0, indice - 90), indice)
    if (CONTEXTO_DE_ASSINATURA.test(antes)) return
    const hora = HORA_DEPOIS.exec(depois) ?? HORA_ANTES.exec(antes.slice(-30))
    const h = hora ? Number(hora[1]) : 0
    const min = hora && hora[2] ? Number(hora[2]) : 0
    const comHora = Boolean(hora) && h <= 23 && min <= 59
    const data = dataLocalParaUtc(ano, mes, dia, comHora ? h : 0, comHora ? min : 0)
    if (!data) return
    if (data.getTime() < minimo || data.getTime() > maximo) return
    candidatos.push({ data, comHora, comContexto: CONTEXTO_DE_SESSAO.test(antes) })
  }

  DATA_POR_EXTENSO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATA_POR_EXTENSO.exec(chave))) {
    avaliar(m.index, m[0].length, Number(m[3]), MESES[m[2]], Number(m[1]))
  }
  DATA_NUMERICA.lastIndex = 0
  while ((m = DATA_NUMERICA.exec(chave))) {
    avaliar(m.index, m[0].length, Number(m[3]), Number(m[2]), Number(m[1]))
  }

  const comHora = candidatos.filter((c) => c.comHora)
  const escolhidos = comHora.length > 0 ? comHora : candidatos.filter((c) => c.comContexto)
  if (escolhidos.length === 0) return undefined
  return escolhidos.reduce((maior, c) => (c.data.getTime() > maior.data.getTime() ? c : maior)).data
}

function emTitulo(texto: string): string {
  if (texto !== texto.toUpperCase()) return texto
  return texto
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && PALAVRAS_MINUSCULAS.has(p) ? p : primeiraMaiuscula(p)))
    .join(' ')
}

export function tipoDoOrgao(nucleo: string): string | null {
  const chave = chaveDeBusca(nucleo)
  if (chave.startsWith('CAMARA')) return 'CAMARA'
  if (chave.startsWith('FUNDO')) return 'FUNDO'
  if (chave.startsWith('SERVICO') || chave.startsWith('SAAE')) return 'SERVICO'
  if (chave.startsWith('AUTARQUIA')) return 'AUTARQUIA'
  if (chave.startsWith('CONSORCIO')) return 'CONSORCIO'
  if (chave.startsWith('INSTITUTO')) return 'INSTITUTO'
  if (chave.startsWith('HOSPITAL')) return 'HOSPITAL'
  if (chave.startsWith('FUNDACAO')) return 'FUNDACAO'
  if (chave.startsWith('UNIVERSIDADE')) return 'UNIVERSIDADE'
  if (chave.startsWith('SOCIEDADE') || chave.startsWith('COMPANHIA') || chave.startsWith('EMPRESA')) return 'EMPRESA'
  return null
}

function limparNomeDoOrgao(nome: string): string | null {
  const corte = nome.search(CORTE_DO_ORGAO)
  const limpo = (corte > 0 ? nome.slice(0, corte) : nome).replace(/[\s,;:–—-]+$/, '').trim()
  return limpo.split(' ').length >= 2 ? emTitulo(limpo) : null
}

function orgaoDeclarado(trecho: string): RegExpExecArray | null {
  const texto = trecho.replace(/\n/g, ' ')
  ORGAO_DECLARADO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ORGAO_DECLARADO.exec(texto))) {
    if (m[0][0] === 'A' || m[0][0] === 'O') return m
  }
  return null
}

export function extrairOrgao(
  cabecalho: string,
  municipio: string,
  secao?: string,
  aposObjeto?: string
): { orgao: string; tipo: string | null } {
  const padrao = { orgao: `Prefeitura Municipal de ${municipio}`, tipo: null }
  const m = orgaoDeclarado(cabecalho) ?? (aposObjeto ? orgaoDeclarado(aposObjeto) : null)
  if (m) {
    const tipo = tipoDoOrgao(m[2])
    if (!tipo) return padrao
    const nome = limparNomeDoOrgao(m[1])
    return nome ? { orgao: nome, tipo } : padrao
  }
  if (secao) {
    const s = ORGAO_DA_SECAO.exec(secao)
    const tipo = s ? tipoDoOrgao(s[2]) : null
    const nome = s && tipo ? limparNomeDoOrgao(s[1]) : null
    if (nome && tipo) return { orgao: nome, tipo }
  }
  return padrao
}

export function primeiroLinkDoBloco(plano: string): string | undefined {
  const regex = /https?:\/\/[^\s<>"'()]+/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(plano))) {
    const url = safeHttpUrl(m[0].replace(/[.,;:]+$/, ''))
    if (!url) continue
    const host = new URL(url).hostname.toLowerCase()
    if (HOSTS_QUE_NAO_SAO_EDITAL.some((h) => host === h || host.endsWith('.' + h))) continue
    if (!/\.[a-z]{2,}$/.test(host) || (host.startsWith('www.') && host.split('.').length < 3)) continue
    return url
  }
  return undefined
}

export function temIdDoPncp(plano: string): boolean {
  return ID_DO_PNCP.test(plano)
}

export function dataDoDiario(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number)
  return horaDeBrasilia(ano, mes - 1, dia, 12)
}

export function cabecalhoDescarta(chaveDoCabecalho: string): boolean {
  return SITUACAO_QUE_DESCARTA.test(chaveDoCabecalho)
}

function resumir(texto: string): string {
  return texto.length > TAMANHO_DO_RESUMO ? texto.slice(0, TAMANHO_DO_RESUMO - 1).trimEnd() + '…' : texto
}

type AvaliacaoDoBloco =
  | { tipo: 'tender'; tender: NormalizedTender; completude: number }
  | { tipo: 'pncp'; fonteId: string }
  | { tipo: 'descartado' }

function avaliarBloco(bloco: BlocoDeAviso, gazeta: GazetaQueridoDiario, agora: Date): AvaliacaoDoBloco {
  const plano = compactar(bloco.texto)
  const chave = chaveDeBusca(plano)

  const modalidadeNoInicio = identificarModalidade(chave.slice(0, TAMANHO_DO_CABECALHO_SEM_OBJETO), chave)
  const objeto = extrairObjeto(plano, chave, modalidadeNoInicio?.fim)
  if (!objeto) return { tipo: 'descartado' }

  const fimDoCabecalho = Math.min(objeto.inicio, TAMANHO_DO_CABECALHO_SEM_OBJETO)
  const chaveDoCabecalho = chave.slice(0, fimDoCabecalho)
  if (cabecalhoDescarta(chaveDoCabecalho)) return { tipo: 'descartado' }

  const modalidade =
    identificarModalidade(chaveDoCabecalho, chave) ??
    (objeto.inicio === modalidadeNoInicio?.fim ? modalidadeNoInicio : null) ??
    identificarModalidade(chave.slice(objeto.fim, objeto.fim + TAMANHO_DO_CABECALHO_SEM_OBJETO), chave)
  if (!modalidade) return { tipo: 'descartado' }
  if (modalidade.familia === 'DISPENSA' && CONTRATACAO_JA_DEFINIDA.test(chave)) return { tipo: 'descartado' }

  const { orgao, tipo } = extrairOrgao(
    plano.slice(0, fimDoCabecalho),
    gazeta.territory_name,
    bloco.secao,
    plano.slice(objeto.fim, objeto.fim + TAMANHO_DO_TRECHO_APOS_O_OBJETO)
  )
  const numeroDoId = modalidade.numero.replace('/', '-')
  const fonteId = `QD-${gazeta.territory_id}:${modalidade.familia}:${numeroDoId}${tipo ? `:${tipo}` : ''}`

  if (temIdDoPncp(plano)) return { tipo: 'pncp', fonteId }

  const publicadoAt = dataDoDiario(gazeta.date)
  const aberturaAt = extrairAbertura(chave, publicadoAt)
  const geo = getMunicipioByIbge(gazeta.territory_id)
  const linkDoBloco = primeiroLinkDoBloco(plano)
  const linkEdital = linkDoBloco ?? safeHttpUrl(gazeta.url) ?? undefined

  const tender: NormalizedTender = {
    fonte: 'QUERIDO_DIARIO',
    fonteId,
    modalidade: modalidade.modalidade,
    situacao: !aberturaAt || aberturaAt.getTime() > agora.getTime() ? 'ABERTA' : 'ENCERRADA',
    objeto: objeto.objeto,
    objetoResumido: resumir(objeto.objeto),
    uf: gazeta.state_code,
    municipio: gazeta.territory_name,
    municipioIbge: gazeta.territory_id,
    municipioLat: geo?.lat,
    municipioLng: geo?.lng,
    orgao,
    aberturaAt,
    publicadoAt,
    linkEdital,
    numeroControle: `${modalidade.rotulo} nº ${modalidade.numero}`,
    rawJson: {
      gazetteUrl: gazeta.url,
      txtUrl: gazeta.txt_url ?? null,
      territoryId: gazeta.territory_id,
      date: gazeta.date,
      edition: gazeta.edition ?? null,
      trecho: plano.slice(0, TAMANHO_DO_TRECHO),
    },
  }

  const completude = (aberturaAt ? 2 : 0) + (linkDoBloco ? 1 : 0)
  return { tipo: 'tender', tender, completude }
}

export function parseDiarioOficial(
  gazeta: GazetaQueridoDiario,
  texto: string,
  agora: Date = new Date()
): ResultadoDoDiario {
  const blocos = separarBlocosDeAviso(texto)
  const porFonteId = new Map<string, { tender: NormalizedTender; completude: number }>()
  const doPncp = new Set<string>()

  for (const bloco of blocos) {
    const avaliacao = avaliarBloco(bloco, gazeta, agora)
    if (avaliacao.tipo === 'pncp') {
      doPncp.add(avaliacao.fonteId)
      continue
    }
    if (avaliacao.tipo !== 'tender') continue
    const existente = porFonteId.get(avaliacao.tender.fonteId)
    if (!existente || avaliacao.completude > existente.completude) {
      porFonteId.set(avaliacao.tender.fonteId, { tender: avaliacao.tender, completude: avaliacao.completude })
    }
  }

  for (const fonteId of doPncp) porFonteId.delete(fonteId)

  return {
    tenders: [...porFonteId.values()].map((v) => v.tender),
    avisos: blocos.length,
    descartadosPorPncp: doPncp.size,
  }
}
