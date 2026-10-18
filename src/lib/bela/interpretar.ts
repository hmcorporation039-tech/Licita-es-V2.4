import { MAX_PALAVRAS_NO_NOME_DE_MUNICIPIO, ufsDoMunicipio } from './municipios'

export type ModalidadeFalada =
  | 'PREGAO_ELETRONICO'
  | 'PREGAO_PRESENCIAL'
  | 'CONCORRENCIA'
  | 'DISPENSA_COM_DISPUTA'
  | 'DISPENSA_SEM_DISPUTA'
  | 'INEXIGIBILIDADE'
  | 'CREDENCIAMENTO'

export interface FiltrosDaBusca {
  q?: string
  uf?: string
  ufs?: string[]
  rotuloDoLocal?: string
  municipio?: string
  municipios?: string[]
  modalidade?: ModalidadeFalada
  modalidades?: ModalidadeFalada[]
  situacao?: 'ABERTA'
}

export type PedidoDaBela =
  | { acao: 'buscar'; filtros: FiltrosDaBusca; resumo: string }
  | { acao: 'lance'; valor: number; item: number | null; resumo: string }
  | { acao: 'desconhecida'; resumo: string }

const ESTADOS: Array<[string, string]> = [
  ['distrito federal', 'DF'], ['acre', 'AC'], ['alagoas', 'AL'], ['amapa', 'AP'], ['amazonas', 'AM'], ['bahia', 'BA'], ['ceara', 'CE'],
  ['espirito santo', 'ES'], ['goias', 'GO'], ['maranhao', 'MA'], ['mato grosso do sul', 'MS'], ['mato grosso', 'MT'], ['minas gerais', 'MG'],
  ['minas', 'MG'], ['para', 'PA'], ['paraiba', 'PB'], ['parana', 'PR'], ['pernambuco', 'PE'], ['piaui', 'PI'], ['rio de janeiro', 'RJ'],
  ['rio grande do norte', 'RN'], ['rio grande do sul', 'RS'], ['rondonia', 'RO'], ['roraima', 'RR'], ['santa catarina', 'SC'],
  ['sao paulo', 'SP'], ['sergipe', 'SE'], ['tocantins', 'TO'],
]

const CAPITAIS: Array<[string, string, string]> = [
  ['brasilia', 'Brasília', 'DF'], ['goiania', 'Goiânia', 'GO'], ['belo horizonte', 'Belo Horizonte', 'MG'], ['salvador', 'Salvador', 'BA'],
  ['fortaleza', 'Fortaleza', 'CE'], ['recife', 'Recife', 'PE'], ['manaus', 'Manaus', 'AM'], ['belem', 'Belém', 'PA'], ['curitiba', 'Curitiba', 'PR'],
  ['porto alegre', 'Porto Alegre', 'RS'], ['florianopolis', 'Florianópolis', 'SC'], ['vitoria', 'Vitória', 'ES'], ['cuiaba', 'Cuiabá', 'MT'],
  ['campo grande', 'Campo Grande', 'MS'], ['palmas', 'Palmas', 'TO'], ['teresina', 'Teresina', 'PI'], ['sao luis', 'São Luís', 'MA'],
  ['natal', 'Natal', 'RN'], ['joao pessoa', 'João Pessoa', 'PB'], ['maceio', 'Maceió', 'AL'], ['aracaju', 'Aracaju', 'SE'],
  ['porto velho', 'Porto Velho', 'RO'], ['rio branco', 'Rio Branco', 'AC'], ['boa vista', 'Boa Vista', 'RR'], ['macapa', 'Macapá', 'AP'],
]

const REGIOES: Array<[RegExp, string, string[]]> = [
  [/^centro[- ]?oeste$/, 'Centro-Oeste', ['DF', 'GO', 'MT', 'MS']],
  [/^nordeste$/, 'Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']],
  [/^sudeste$/, 'Sudeste', ['ES', 'MG', 'RJ', 'SP']],
  [/^norte$/, 'Norte', ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']],
  [/^sul$/, 'Sul', ['PR', 'RS', 'SC']],
]

const SIGLAS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
const SIGLAS_QUE_SAO_PALAVRAS = new Set(['SE', 'TO', 'MA', 'PA', 'ES'])

const MODALIDADES: Array<[RegExp, ModalidadeFalada[], string]> = [
  [/\bpregao presencial\b/, ['PREGAO_PRESENCIAL'], 'pregão presencial'],
  [/\bpregao( eletronico)?\b/, ['PREGAO_ELETRONICO'], 'pregão eletrônico'],
  [/\bconcorrencias?\b/, ['CONCORRENCIA'], 'concorrência'],
  [/\bdispensas?( de licitacao)? (com disputa|eletronicas?)\b/, ['DISPENSA_COM_DISPUTA'], 'dispensa com disputa'],
  [/\bdispensas?( de licitacao)? sem disputa\b/, ['DISPENSA_SEM_DISPUTA'], 'dispensa sem disputa'],
  [/\bdispensas?\b/, ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'], 'dispensa'],
  [/\binexigibilidades?\b/, ['INEXIGIBILIDADE'], 'inexigibilidade'],
  [/\bcredenciamentos?\b/, ['CREDENCIAMENTO'], 'credenciamento'],
]

const PALAVRAS_DE_COMANDO = new Set([
  'ok', 'oi', 'ola', 'bela', 'por', 'favor', 'preciso', 'precisamos', 'quero', 'queria', 'gostaria', 'procure', 'procura', 'procurar', 'busque',
  'busca', 'buscar', 'encontre', 'encontra', 'encontrar', 'ache', 'acha', 'achar', 'mostre', 'mostra', 'mostrar', 'me', 'ver', 'veja', 'liste',
  'lista', 'listar', 'tem', 'tenha', 'existe', 'alguma', 'algum', 'uma', 'umas', 'um', 'uns', 'as', 'os', 'a', 'o', 'de', 'da', 'do', 'das', 'dos',
  'licitacao', 'licitacoes', 'edital', 'editais', 'oportunidade', 'oportunidades', 'pra', 'para', 'sobre', 'com', 'que', 'esteja', 'estejam',
  'aberta', 'abertas', 'aberto', 'abertos', 'em', 'no', 'na', 'nos', 'nas', 'e', 'ai', 'ja', 'so', 'somente', 'apenas', 'se', 'tiver', 'tiverem',
  'houver', 'existem', 'ha', 'todas', 'todos', 'qualquer', 'aparecer', 'aparece',
])
const LIGACOES_NAS_PONTAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'em', 'no', 'na', 'e', 'a', 'o'])
const PALAVRAS_DE_COMPRA = new Set(['compra', 'compras', 'aquisicao', 'aquisicoes', 'fornecimento', 'fornecimentos', 'contratacao', 'contratacoes'])
const LIGACOES_DA_COMPRA = new Set(['de', 'do', 'da', 'dos', 'das'])

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const MIL = 1_000
const MULTIPLICADORES = new Map<string, number>([['mil', MIL], ['milhao', 1_000_000], ['milhoes', 1_000_000], ['bilhao', 1_000_000_000], ['bilhoes', 1_000_000_000]])

function numeroEscrito(bruto: string): number | null {
  const s = bruto.replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const ultimaVirgula = s.lastIndexOf(',')
  const ultimoPonto = s.lastIndexOf('.')
  let normal: string
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    normal = ultimaVirgula > ultimoPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimaVirgula > -1) {
    const variasVirgulas = s.indexOf(',') !== ultimaVirgula
    const casasDepoisDaVirgula = s.length - ultimaVirgula - 1
    if (!variasVirgulas && casasDepoisDaVirgula > 2) return null
    normal = casasDepoisDaVirgula === 3 && variasVirgulas ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (ultimoPonto > -1) {
    const partes = s.split('.')
    if (partes.length === 2 && partes[1].length > 3) return null
    normal = partes.length > 2 || partes[partes.length - 1].length === 3 ? s.replace(/\./g, '') : s
  } else {
    normal = s
  }
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

const PALAVRAS_DE_REAIS = new Set(['real', 'reais'])
const PALAVRAS_DE_CENTAVOS = new Set(['centavo', 'centavos'])
const PALAVRAS_ANTES_DO_NUMERO_DO_ITEM = new Set(['numero', 'n'])

const ehNumero = (token: string) => /^\d/.test(token)
const ehParteDoValor = (token: string) => ehNumero(token) || MULTIPLICADORES.has(token) || PALAVRAS_DE_REAIS.has(token) || PALAVRAS_DE_CENTAVOS.has(token)

function ehNumeroDoItem(tokens: string[], i: number): boolean {
  if (tokens[i - 1] === 'item') return true
  return PALAVRAS_ANTES_DO_NUMERO_DO_ITEM.has(tokens[i - 1] ?? '') && tokens[i - 2] === 'item'
}

function gruposDeValor(t: string): string[][] {
  const tokens = t.match(/\d[\d.,]*\d|\d|[a-z]+|[^\s\da-z]/g) ?? []
  const grupos: string[][] = []
  let i = 0
  while (i < tokens.length) {
    if (!ehNumero(tokens[i]) || ehNumeroDoItem(tokens, i)) {
      i++
      continue
    }
    const grupo = [tokens[i++]]
    while (i < tokens.length) {
      if (ehParteDoValor(tokens[i])) grupo.push(tokens[i++])
      else if (tokens[i] === 'e' && ehNumero(tokens[i + 1] ?? '')) i++
      else break
    }
    grupos.push(grupo)
  }
  return grupos
}

function somarTermos(partes: string[]): number | null {
  const termos: Array<{ numero: number; multiplicador: number }> = []
  for (const parte of partes) {
    if (ehNumero(parte)) {
      const numero = numeroEscrito(parte)
      if (numero === null) return null
      termos.push({ numero, multiplicador: 1 })
    } else if (MULTIPLICADORES.has(parte)) {
      const ultimo = termos[termos.length - 1]
      if (!ultimo || ultimo.multiplicador !== 1) return null
      ultimo.multiplicador = MULTIPLICADORES.get(parte)!
    } else {
      return null
    }
  }
  if (termos.length === 0) return null
  let soma = 0
  for (let i = 0; i < termos.length; i++) {
    const { numero, multiplicador } = termos[i]
    if (i < termos.length - 1 && !Number.isInteger(numero)) return null
    if (i > 0) {
      const anterior = termos[i - 1].multiplicador
      if (multiplicador >= anterior || numero * multiplicador >= anterior) return null
      if (multiplicador === 1 && anterior > MIL) return null
    }
    soma += numero * multiplicador
  }
  return soma
}

function valorDoGrupo(grupo: string[]): number | null {
  const posicaoDosReais = grupo.findIndex((p) => PALAVRAS_DE_REAIS.has(p))
  const posicaoDosCentavos = grupo.findIndex((p) => PALAVRAS_DE_CENTAVOS.has(p))
  if (grupo.filter((p) => PALAVRAS_DE_REAIS.has(p)).length > 1 || grupo.filter((p) => PALAVRAS_DE_CENTAVOS.has(p)).length > 1) return null

  let partesDosReais: string[]
  let centavos: string | null = null
  if (posicaoDosCentavos > -1) {
    if (posicaoDosCentavos !== grupo.length - 1) return null
    centavos = grupo[posicaoDosCentavos - 1]
    if (!/^\d+$/.test(centavos)) return null
    const fimDosReais = posicaoDosReais > -1 ? posicaoDosReais : posicaoDosCentavos - 1
    if (posicaoDosReais > -1 && posicaoDosReais !== posicaoDosCentavos - 2) return null
    partesDosReais = grupo.slice(0, fimDosReais)
  } else if (posicaoDosReais > -1) {
    const depois = grupo.slice(posicaoDosReais + 1)
    if (depois.length > 1 || (depois.length === 1 && !/^\d{1,2}$/.test(depois[0]))) return null
    centavos = depois[0] ?? null
    partesDosReais = grupo.slice(0, posicaoDosReais)
  } else {
    partesDosReais = grupo
  }

  const reais = partesDosReais.length > 0 ? somarTermos(partesDosReais) : 0
  if (reais === null) return null
  if (centavos !== null && partesDosReais.length > 0 && (!/^\d{1,2}$/.test(centavos) || !Number.isInteger(reais))) return null
  const valor = Math.round((reais + (centavos !== null ? Number(centavos) / 100 : 0)) * 100) / 100
  return valor > 0 ? valor : null
}

export function lerValorFalado(texto: string): number | null {
  const t = normalizar(texto).replace(/r\$\s*/g, '')
  const grupos = gruposDeValor(t)
  return grupos.length === 1 ? valorDoGrupo(grupos[0]) : null
}

function lerItem(t: string): number | null {
  const m = t.match(/\bitem\s*(?:numero\s*|n\s*)?(\d{1,4})\b/)
  return m ? Number(m[1]) : null
}

const PREPOSICAO = '(?:no|na|nos|nas|em|do|da|dos|das|de|pro|pra|para o|para a|para)'
const PREPOSICOES_DE_REGIAO = new Set(['no', 'na', 'nos', 'nas', 'em', 'pro', 'pra', 'para o', 'para a', 'para'])
const NOMES_DE_LUGAR = [...ESTADOS.map(([nome]) => nome), 'centro[- ]?oeste', 'nordeste', 'sudeste', 'norte', 'sul']
  .sort((a, b) => b.length - a.length)
  .join('|')
const UNIDADE = `(?:regiao\\s+)?(?:estado (?:de |do |da )?)?(?:${NOMES_DE_LUGAR}|[a-z]{2})`
const PRIMEIRO_LUGAR = new RegExp(`\\b(${PREPOSICAO})\\s+(${UNIDADE})\\b`, 'g')
const ESTADO_DENTRO_DA_REGIAO = new RegExp(`^\\s+(?:de|do|da)\\s+(${UNIDADE})\\b`)
const PROXIMO_LUGAR = new RegExp(`^\\s*(?:,|\\be\\b|\\bou\\b)\\s*(?:(${PREPOSICAO})\\s+)?(${UNIDADE})\\b`)
const PARA_COM_ACENTO = /(^|[^\p{L}])pará($|[^\p{L}])/iu

interface LugarFalado {
  ufs: string[]
  regiao?: string
}

function lerLugar(unidade: string, preposicao: string | undefined, continuacao: boolean, original: string): LugarFalado | null {
  const comRegiao = /^regiao\s+/.test(unidade)
  const nome = unidade.replace(/^regiao\s+/, '').replace(/^estado (?:de |do |da )?/, '')
  const regiao = REGIOES.find(([re]) => re.test(nome))
  if (regiao) {
    const preposicaoAceita = comRegiao || continuacao || (preposicao !== undefined && PREPOSICOES_DE_REGIAO.has(preposicao))
    return preposicaoAceita ? { ufs: regiao[2], regiao: regiao[1] } : null
  }
  if (comRegiao) return null
  const estado = ESTADOS.find(([n]) => n === nome)
  if (estado) {
    if (estado[1] === 'PA' && !PARA_COM_ACENTO.test(original)) return null
    return { ufs: [estado[1]] }
  }
  const sigla = nome.toUpperCase()
  if (nome.length !== 2 || !SIGLAS.has(sigla)) return null
  if (SIGLAS_QUE_SAO_PALAVRAS.has(sigla) && !new RegExp(`\\b${sigla}\\b`).test(original)) return null
  return { ufs: [sigla] }
}

function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function acharLugares(t: string, original: string): { ufs: string[]; regioes: string[]; trechos: RegExp[] } {
  const ufs: string[] = []
  const regioes: string[] = []
  const trechos: RegExp[] = []
  const somar = (lugar: LugarFalado) => {
    for (const uf of lugar.ufs) if (!ufs.includes(uf)) ufs.push(uf)
    if (lugar.regiao && !regioes.includes(lugar.regiao)) regioes.push(lugar.regiao)
  }
  const procura = new RegExp(PRIMEIRO_LUGAR.source, 'g')
  let encontrado: RegExpExecArray | null
  while ((encontrado = procura.exec(t)) !== null) {
    const primeiro = lerLugar(encontrado[2], encontrado[1], false, original)
    if (!primeiro) {
      procura.lastIndex = encontrado.index + 1
      continue
    }
    let fim = encontrado.index + encontrado[0].length
    const somarAte = (lugar: LugarFalado) => {
      const estado = lugar.regiao ? ESTADO_DENTRO_DA_REGIAO.exec(t.slice(fim)) : null
      const lugarDoEstado = estado ? lerLugar(estado[1], 'de', false, original) : null
      if (estado && lugarDoEstado && !lugarDoEstado.regiao) {
        somar(lugarDoEstado)
        fim += estado[0].length
      } else {
        somar(lugar)
      }
    }
    somarAte(primeiro)
    for (;;) {
      const proximo = PROXIMO_LUGAR.exec(t.slice(fim))
      if (!proximo) break
      const lugar = lerLugar(proximo[2], proximo[1], true, original)
      if (!lugar) break
      fim += proximo[0].length
      somarAte(lugar)
    }
    trechos.push(new RegExp(`\\b${escaparParaRegex(t.slice(encontrado.index, fim))}\\b`))
    procura.lastIndex = fim
  }
  return { ufs, regioes, trechos }
}

const CAPITAIS_QUE_SAO_PALAVRAS = new Set(['natal', 'vitoria', 'palmas', 'salvador', 'boa vista', 'campo grande', 'rio branco'])
const NOMES_DE_ESTADO = new Set(ESTADOS.map(([nome]) => nome))
const PREPOSICOES_FORTES_DE_CIDADE = new Set(['em', 'no', 'na', 'nos', 'nas'])
const LIGACOES_DE_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

const MUNICIPIOS_QUE_SAO_PALAVRAS_COMUNS = new Set([
  'agudo', 'alegre', 'alegria', 'alianca', 'almas', 'altos', 'aluminio', 'americana', 'amparo', 'angelica', 'angulo', 'antas', 'arame', 'arara',
  'araras', 'areal', 'areia', 'areias', 'ares', 'armazem', 'arraial', 'arvoredo', 'atalaia', 'aurora', 'bagre', 'balsamo', 'balsas', 'bananal',
  'bandeira', 'bandeirante', 'bandeirantes', 'barao', 'barra', 'barracao', 'barras', 'barreira', 'barreiras', 'barro', 'barrocas', 'batalha',
  'bicas', 'bocaina', 'bonfim', 'bonito', 'brasileira', 'breves', 'brejo', 'bugre', 'buriti', 'cachoeira', 'cajueiro', 'calcado', 'caldas',
  'california', 'campanario', 'campanha', 'campestre', 'canas', 'candeias', 'canela', 'canoas', 'capela', 'capim', 'capitao', 'capoeiras',
  'caridade', 'carmo', 'carneiros', 'carolina', 'carvalhos', 'casca', 'cascavel', 'caseiros', 'castanheira', 'castanheiras', 'castelo', 'catarina',
  'cedro', 'centenario', 'central', 'ceres', 'chacara', 'chale', 'chapada', 'charrua', 'chaves', 'choro', 'cipo', 'colares', 'colina', 'colinas',
  'colmeia', 'colombia', 'colorado', 'coluna', 'combinado', 'comodoro', 'conceicao', 'conchas', 'concordia', 'condado', 'conde', 'condor',
  'confins', 'congo', 'conquista', 'consolacao', 'contagem', 'contenda', 'coqueiral', 'cordeiro', 'cordeiros', 'corrente', 'correntes', 'cortes',
  'cristais', 'cristal', 'cristina', 'croata', 'cruz', 'cruzeiro', 'cunha', 'custodia', 'datas', 'delta', 'descalvado', 'descanso', 'descoberto',
  'desterro', 'diamante', 'divino', 'dobrada', 'dourado', 'dourados', 'eldorado', 'emas', 'encantado', 'encanto', 'encruzilhada', 'equador', 'ermo',
  'escada', 'esmeralda', 'esmeraldas', 'esperanca', 'esplanada', 'estacao', 'estancia', 'esteio', 'estiva', 'estreito', 'estrela', 'extrema',
  'fama', 'farol', 'fartura', 'fatima', 'feliz', 'fenix', 'ferreiros', 'ferros', 'figueira', 'flores', 'floresta', 'florestal', 'florida',
  'formiga', 'formigueiro', 'formosa', 'formoso', 'fortuna', 'franca', 'fronteira', 'fronteiras', 'gameleira', 'gameleiras', 'garca', 'gaviao',
  'gentil', 'gloria', 'goiabeira', 'graca', 'gramado', 'granito', 'granja', 'gravata', 'guarani', 'harmonia', 'horizonte', 'imigrante',
  'imperatriz', 'independencia', 'indiana', 'inga', 'inocencia', 'ipe', 'jacinto', 'jangada', 'jaqueira', 'jardim', 'jatoba', 'joia', 'juramento',
  'jurema', 'lagoa', 'lagoinha', 'laje', 'lajeado', 'lajedo', 'lajes', 'lapa', 'laranjal', 'laranjeiras', 'lastro', 'lavras', 'leme', 'liberdade',
  'limeira', 'limoeiro', 'livramento', 'logradouro', 'lontra', 'lontras', 'luz', 'macieira', 'malhada', 'malta', 'mamonas', 'manga', 'maravilha',
  'maravilhas', 'marco', 'mascote', 'mata', 'matinha', 'mercedes', 'messias', 'milagres', 'milha', 'mirante', 'modelo', 'moeda', 'montanha',
  'montanhas', 'moreno', 'morrinhos', 'morros', 'mulungu', 'mutum', 'natividade', 'navegantes', 'nazare', 'normandia', 'olaria', 'oleo', 'oliveira',
  'oriente', 'ouro', 'ouvidor', 'painel', 'palestina', 'palma', 'palmeira', 'palmeiras', 'panama', 'panelas', 'panorama', 'papagaios', 'paraiso',
  'passagem', 'passos', 'patos', 'pavao', 'pedra', 'pedreira', 'pedreiras', 'peixe', 'penha', 'pequi', 'perdizes', 'periquito', 'perola',
  'pescador', 'piedade', 'pilar', 'pimenta', 'pinhal', 'pinhao', 'pinheiro', 'pinheiros', 'piranhas', 'placas', 'planalto', 'platina', 'pombal',
  'pombos', 'pontal', 'porto', 'posse', 'pote', 'prado', 'prados', 'prainha', 'prata', 'primavera', 'princesa', 'progresso', 'pureza', 'quadra',
  'queimadas', 'queimados', 'quilombo', 'raposa', 'realeza', 'recreio', 'redencao', 'reduto', 'regeneracao', 'registro', 'remanso', 'renascenca',
  'reserva', 'restinga', 'riachao', 'riqueza', 'rodeio', 'romaria', 'rosario', 'roteiro', 'sacramento', 'salgado', 'salinas', 'salitre', 'salto',
  'santana', 'santiago', 'santos', 'saudades', 'saude', 'seara', 'segredo', 'serra', 'serrana', 'serraria', 'serrinha', 'sertao', 'sobradinho',
  'sobrado', 'socorro', 'soledade', 'solidao', 'sonora', 'sorriso', 'sossego', 'sucupira', 'tabuleiro', 'tapera', 'telha', 'tesouro', 'tiradentes',
  'tiros', 'toledo', 'torres', 'triunfo', 'trindade', 'trombas', 'tunas', 'turmalina', 'uniao', 'vacaria', 'valente', 'vargem', 'varzea', 'vazante',
  'ventania', 'vera', 'vereda', 'vertentes', 'viadutos', 'videira', 'vigia',
  'agua azul', 'agua boa', 'agua branca', 'agua clara', 'agua doce', 'agua fria', 'agua limpa', 'agua nova', 'agua preta', 'areia branca',
  'boa esperanca', 'boa hora', 'boa saude', 'boa viagem', 'bom jardim', 'bom jesus', 'bom retiro', 'bom sucesso', 'campo alegre', 'campo belo',
  'campo bom', 'campo limpo', 'campo novo', 'campo verde', 'casa nova', 'cruz alta', 'mar vermelho', 'mato verde', 'nova era', 'ouro branco',
  'ouro fino', 'ouro verde', 'pedra branca', 'pedra preta', 'ponte alta', 'porto seguro', 'rio bonito', 'rio claro', 'rio doce', 'rio negro',
  'rio novo', 'rio verde', 'terra boa', 'terra nova', 'terra rica', 'terra roxa', 'vista alegre',
])

const GRANDES_MUNICIPIOS_COM_NOME_COMUM = new Map<string, string>([
  ['santos', 'SP'], ['contagem', 'MG'], ['cascavel', 'PR'], ['canoas', 'RS'], ['franca', 'SP'], ['limeira', 'SP'], ['imperatriz', 'MA'],
  ['dourados', 'MS'], ['americana', 'SP'], ['barreiras', 'BA'], ['toledo', 'PR'], ['sorriso', 'MT'], ['lavras', 'MG'], ['patos', 'PB'],
  ['passos', 'MG'], ['breves', 'PA'], ['trindade', 'GO'], ['rio verde', 'GO'], ['rio claro', 'SP'], ['porto seguro', 'BA'],
])
const PREPOSICOES_DO_GRANDE_MUNICIPIO = new Set(['em', 'no', 'na'])

export function grandesMunicipiosComNomeComum(): ReadonlyMap<string, string> {
  return GRANDES_MUNICIPIOS_COM_NOME_COMUM
}

const PROCURA_DE_MUNICIPIO = /\b(em|no|na|nos|nas|de|do|da|dos|das|para)\s+/g
const SEQUENCIA_DE_PALAVRAS = /^[a-z0-9'’-]+(?: [a-z0-9'’-]+)*/
const ESTADO_COLADO = new RegExp(`^\\s*(?:[,/-]\\s*)?(?:(${PREPOSICAO})\\s+)?(${UNIDADE})\\b`)
const NOME_QUE_CONTINUA = /^\s+(?:da|de|do|das|dos)\s+[a-z]/
const PROXIMO_MUNICIPIO = /^\s*(?:,\s*(?:e\s+)?|\be\s+|\bou\s+)(?:(?:em|no|na|de|do|da)\s+)?/

const INTERIOR_DO_ESTADO = /\b(?:no|pelo|pro|para o)\s+interior\s+(?:de|do|da)\b/
const NO_INTERIOR = /\b(?:no|pelo|pro|para o)\s+interior\b/

interface MunicipioFalado {
  chave: string
  falado: string
  ufs: string[]
  ufColada: string | null
  inicio: number
  fim: number
}

function capitalizar(palavra: string): string {
  const apostrofo = palavra.match(/^(d['’])(.+)$/)
  if (apostrofo) return apostrofo[1] + capitalizar(apostrofo[2])
  return palavra.charAt(0).toUpperCase() + palavra.slice(1)
}

function nomeParaExibir(municipio: MunicipioFalado, uf: string | undefined): string {
  const capital = CAPITAIS.find(([chave, , ufDaCapital]) => chave === municipio.chave && (uf === undefined || uf === ufDaCapital))
  if (capital) return capital[1]
  return municipio.falado
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && LIGACOES_DE_NOME.has(normalizar(p)) ? p : p.split('-').map(capitalizar).join('-')))
    .join(' ')
}

function soComplementosDepois(resto: string): boolean {
  return resto
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => PALAVRAS_DE_COMANDO.has(palavra))
}

function grandeMunicipioNoFimDaFrase(chave: string, preposicao: string, ufs: string[], resto: string): boolean {
  const uf = GRANDES_MUNICIPIOS_COM_NOME_COMUM.get(chave)
  return uf !== undefined && ufs.includes(uf) && PREPOSICOES_DO_GRANDE_MUNICIPIO.has(preposicao) && soComplementosDepois(resto)
}

function municipioAceito(chave: string, preposicao: string, ufs: string[], ufColada: string | null, resto: string): boolean {
  if (ufColada !== null && !ufs.includes(ufColada)) return false
  const forte = PREPOSICOES_FORTES_DE_CIDADE.has(preposicao)
  if (CAPITAIS_QUE_SAO_PALAVRAS.has(chave)) return preposicao === 'em' || (forte && ufColada !== null)
  if (CAPITAIS.some(([c, , uf]) => c === chave && ufs.includes(uf))) return forte || preposicao === 'para' || ufColada !== null
  if (MUNICIPIOS_QUE_SAO_PALAVRAS_COMUNS.has(chave)) return (forte && ufColada !== null) || grandeMunicipioNoFimDaFrase(chave, preposicao, ufs, resto)
  return forte || chave.includes(' ') || ufColada !== null
}

function municipioDaListaAceito(chave: string, ufs: string[], ufColada: string | null, resto: string): boolean {
  if (ufColada !== null && !ufs.includes(ufColada)) return false
  if (!MUNICIPIOS_QUE_SAO_PALAVRAS_COMUNS.has(chave)) return true
  return ufColada !== null || grandeMunicipioNoFimDaFrase(chave, 'em', ufs, resto)
}

interface NomeDeMunicipioNoTexto {
  chave: string
  ufs: string[]
  ufColada: string | null
  fim: number
  fimComEstado: number
  resto: string
}

function nomeDeMunicipioEm(t: string, inicio: number, original: string): NomeDeMunicipioNoTexto | null {
  const palavras = (t.slice(inicio).match(SEQUENCIA_DE_PALAVRAS)?.[0] ?? '').split(' ').slice(0, MAX_PALAVRAS_NO_NOME_DE_MUNICIPIO)
  for (let k = palavras.length; k >= 1; k--) {
    const chave = palavras.slice(0, k).join(' ')
    if (NOMES_DE_ESTADO.has(chave)) return null
    const ufs = ufsDoMunicipio(chave)
    if (ufs.length === 0) continue
    const fim = inicio + chave.length
    const resto = t.slice(fim)
    const colado = ESTADO_COLADO.exec(resto)
    const lugarColado = colado ? lerLugar(colado[2], colado[1], false, original) : null
    const ufColada = lugarColado && !lugarColado.regiao && lugarColado.ufs.length === 1 ? lugarColado.ufs[0] : null
    if (ufColada === null && NOME_QUE_CONTINUA.test(resto)) return null
    const fimComEstado = ufColada !== null && colado ? fim + colado[0].length : fim
    return { chave, ufs, ufColada, fim, fimComEstado, resto: t.slice(fimComEstado) }
  }
  return null
}

function municipioFalado(nome: NomeDeMunicipioNoTexto, inicioDoNome: number, inicioDoTrecho: number, original: string): MunicipioFalado {
  const mesmoTamanho = normalizar(original).length === original.length
  return {
    chave: nome.chave,
    falado: mesmoTamanho ? original.slice(inicioDoNome, nome.fim) : nome.chave,
    ufs: nome.ufs,
    ufColada: nome.ufColada,
    inicio: inicioDoTrecho,
    fim: nome.fimComEstado,
  }
}

function acharMunicipio(t: string, original: string): MunicipioFalado | null {
  const procura = new RegExp(PROCURA_DE_MUNICIPIO.source, 'g')
  let encontrado: RegExpExecArray | null
  while ((encontrado = procura.exec(t)) !== null) {
    const inicio = encontrado.index + encontrado[0].length
    const nome = nomeDeMunicipioEm(t, inicio, original)
    if (!nome) continue
    if (municipioAceito(nome.chave, encontrado[1], nome.ufs, nome.ufColada, nome.resto)) return municipioFalado(nome, inicio, encontrado.index, original)
    procura.lastIndex = nome.fim
  }
  return null
}

function acharDemaisMunicipiosDaLista(t: string, primeiro: MunicipioFalado, original: string): MunicipioFalado[] {
  const demais: MunicipioFalado[] = []
  let fim = primeiro.fim
  for (;;) {
    const ligacao = PROXIMO_MUNICIPIO.exec(t.slice(fim))
    if (!ligacao) break
    const inicio = fim + ligacao[0].length
    const nome = nomeDeMunicipioEm(t, inicio, original)
    if (!nome || !municipioDaListaAceito(nome.chave, nome.ufs, nome.ufColada, nome.resto)) break
    demais.push(municipioFalado(nome, inicio, fim, original))
    fim = nome.fimComEstado
  }
  return demais
}

function ufDoMunicipio(municipio: MunicipioFalado, ufsFaladas: string[]): { uf: string | undefined } | null {
  if (municipio.ufColada !== null) return { uf: municipio.ufColada }
  if (ufsFaladas.length > 0) {
    const comuns = municipio.ufs.filter((uf) => ufsFaladas.includes(uf))
    if (comuns.length === 0) return null
    return { uf: comuns.length === 1 ? comuns[0] : undefined }
  }
  if (municipio.ufs.length === 1) return { uf: municipio.ufs[0] }
  const capital = CAPITAIS.find(([chave, , uf]) => chave === municipio.chave && municipio.ufs.includes(uf))
  if (capital) return { uf: capital[2] }
  const grande = GRANDES_MUNICIPIOS_COM_NOME_COMUM.get(municipio.chave)
  return { uf: grande !== undefined && municipio.ufs.includes(grande) ? grande : undefined }
}

function ufsPossiveisDoMunicipio(municipio: MunicipioFalado, ufsFaladas: string[]): string[] {
  return ufsFaladas.length > 0 ? municipio.ufs.filter((uf) => ufsFaladas.includes(uf)) : municipio.ufs
}

function juntarComE(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

function rotuloDoLugar(ufs: string[], regioes: string[]): string {
  const ufsDasRegioes = new Set(REGIOES.filter(([, nome]) => regioes.includes(nome)).flatMap(([, , siglas]) => siglas))
  const avulsas = ufs.filter((uf) => !ufsDasRegioes.has(uf))
  const partes = [regioes.length ? `no ${juntarComE(regioes)}` : '', avulsas.length ? `em ${juntarComE(avulsas)}` : ''].filter(Boolean)
  return partes.join(' e ')
}

function palavrasDoObjeto(original: string, removidos: RegExp[]): string {
  let t = normalizar(original)
  const mapa: string[] = []
  const palavrasOriginais = original.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean)
  for (const re of removidos) t = t.replace(new RegExp(re.source, 'g'), ' ')
  const restantes = t.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)
  let i = 0
  for (const p of restantes) {
    while (i < palavrasOriginais.length && normalizar(palavrasOriginais[i]) !== p) i++
    mapa.push(i < palavrasOriginais.length ? palavrasOriginais[i++] : p)
  }
  let inicio = 0
  while (inicio < mapa.length && PALAVRAS_DE_COMANDO.has(normalizar(mapa[inicio]))) inicio++
  let fim = mapa.length
  while (fim > inicio && (PALAVRAS_DE_COMANDO.has(normalizar(mapa[fim - 1])) || LIGACOES_NAS_PONTAS.has(normalizar(mapa[fim - 1])))) fim--
  while (inicio + 2 < fim && PALAVRAS_DE_COMPRA.has(normalizar(mapa[inicio])) && LIGACOES_DA_COMPRA.has(normalizar(mapa[inicio + 1]))) {
    inicio += 2
    while (inicio < fim && PALAVRAS_DE_COMANDO.has(normalizar(mapa[inicio]))) inicio++
  }
  return mapa.slice(inicio, fim).join(' ').toLowerCase().slice(0, 200)
}

export function interpretarPedido(texto: string, contexto: 'busca' | 'pregao' = 'busca'): PedidoDaBela {
  const original = texto.replace(/\s+/g, ' ').trim().slice(0, 500)
  const t = normalizar(original)
  if (!t) return { acao: 'desconhecida', resumo: 'Não ouvi nada. Tente de novo.' }

  const pareceLance = /\b(lance|melhor (?:preco|valor|oferta)|esta em|caiu para|baixou para|ta em)\b/.test(t)
  if (contexto === 'pregao' || pareceLance) {
    const valor = lerValorFalado(original)
    if (valor !== null) {
      const item = lerItem(t)
      return { acao: 'lance', valor, item, resumo: `Melhor lance${item ? ` do item ${item}` : ''}: ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` }
    }
    if (contexto === 'pregao') return { acao: 'desconhecida', resumo: 'Não entendi o valor. Diga, por exemplo: "o lance está em 180 mil".' }
  }

  const removidos: RegExp[] = []
  const filtros: FiltrosDaBusca = {}
  const partes: string[] = []

  const primeiro = acharMunicipio(t, original)
  const lista = primeiro ? [primeiro, ...acharDemaisMunicipiosDaLista(t, primeiro, original)] : []
  const trecho = lista.length > 0 ? { inicio: lista[0].inicio, fim: lista[lista.length - 1].fim } : null
  const semMunicipio = trecho ? t.slice(0, trecho.inicio) + ' '.repeat(trecho.fim - trecho.inicio) + t.slice(trecho.fim) : t
  const lugares = acharLugares(semMunicipio, original)
  removidos.push(...lugares.trechos)
  if (lugares.ufs.length > 0 && INTERIOR_DO_ESTADO.test(semMunicipio)) removidos.push(NO_INTERIOR)
  const escolhidos = lista.flatMap((municipio) => {
    const escolha = ufDoMunicipio(municipio, lugares.ufs)
    return escolha ? [{ municipio, uf: escolha.uf }] : []
  })
  if (trecho && escolhidos.length > 0) removidos.push(new RegExp(`\\b${escaparParaRegex(t.slice(trecho.inicio, trecho.fim))}(?![a-z0-9'’-])`))
  if (escolhidos.length > 1) {
    const nomes = escolhidos.map(({ municipio, uf }) => nomeParaExibir(municipio, uf))
    const ufs = [...new Set(escolhidos.flatMap(({ municipio, uf }) => (uf ? [uf] : ufsPossiveisDoMunicipio(municipio, lugares.ufs))))]
    filtros.municipios = nomes
    if (ufs.length === 1) filtros.uf = ufs[0]
    else filtros.ufs = ufs
    filtros.rotuloDoLocal = `${rotuloDoLugar(ufs, [])}, onde ficam ${juntarComE(nomes)}`
  } else if (escolhidos.length === 1 && escolhidos[0].uf) {
    filtros.municipio = nomeParaExibir(escolhidos[0].municipio, escolhidos[0].uf)
    filtros.uf = escolhidos[0].uf
  } else {
    if (escolhidos.length === 1) filtros.municipio = nomeParaExibir(escolhidos[0].municipio, undefined)
    if (lugares.ufs.length === 1 && lugares.regioes.length === 0) filtros.uf = lugares.ufs[0]
    if (lugares.ufs.length > 1 || lugares.regioes.length > 0) {
      filtros.ufs = lugares.ufs
      filtros.rotuloDoLocal = rotuloDoLugar(lugares.ufs, lugares.regioes)
    }
  }

  for (const [re, modalidades, nome] of MODALIDADES) {
    if (re.test(t)) {
      if (modalidades.length === 1) filtros.modalidade = modalidades[0]
      else filtros.modalidades = modalidades
      removidos.push(re)
      partes.push(nome)
      break
    }
  }

  const abertas = /\b(abertas?|abertos?|em aberto|recebendo propostas)\b/
  if (abertas.test(t)) {
    filtros.situacao = 'ABERTA'
    removidos.push(abertas)
  }

  const objeto = palavrasDoObjeto(original, removidos)
  if (objeto) filtros.q = objeto

  if (!filtros.q && !filtros.uf && !filtros.ufs && !filtros.modalidade && !filtros.modalidades) {
    return { acao: 'desconhecida', resumo: 'Não entendi o que buscar. Diga, por exemplo: "licitação de estrutura metálica no DF".' }
  }

  const descricao = [
    filtros.q ? `"${filtros.q}"` : 'licitações',
    partes.length ? `em ${partes.join(', ')}` : '',
    filtros.municipio ? `em ${filtros.municipio}${filtros.uf ? `/${filtros.uf}` : ''}` : filtros.rotuloDoLocal ? filtros.rotuloDoLocal : filtros.uf ? `na UF ${filtros.uf}` : '',
    filtros.situacao ? 'abertas' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return { acao: 'buscar', filtros, resumo: `Buscando ${descricao}.` }
}
