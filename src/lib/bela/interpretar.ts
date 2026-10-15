export type ModalidadeFalada = 'PREGAO_ELETRONICO' | 'PREGAO_PRESENCIAL' | 'CONCORRENCIA' | 'DISPENSA_COM_DISPUTA' | 'INEXIGIBILIDADE' | 'CREDENCIAMENTO'

export interface FiltrosDaBusca {
  q?: string
  uf?: string
  municipio?: string
  modalidade?: ModalidadeFalada
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

const SIGLAS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
const SIGLAS_QUE_SAO_PALAVRAS = new Set(['SE', 'TO', 'MA', 'PA', 'ES'])

const MODALIDADES: Array<[RegExp, ModalidadeFalada, string]> = [
  [/\bpregao presencial\b/, 'PREGAO_PRESENCIAL', 'pregão presencial'],
  [/\bpregao( eletronico)?\b/, 'PREGAO_ELETRONICO', 'pregão eletrônico'],
  [/\bconcorrencias?\b/, 'CONCORRENCIA', 'concorrência'],
  [/\bdispensas?( eletronicas?)?\b/, 'DISPENSA_COM_DISPUTA', 'dispensa eletrônica'],
  [/\binexigibilidades?\b/, 'INEXIGIBILIDADE', 'inexigibilidade'],
  [/\bcredenciamentos?\b/, 'CREDENCIAMENTO', 'credenciamento'],
]

const PALAVRAS_DE_COMANDO = new Set([
  'ok', 'oi', 'ola', 'bela', 'por', 'favor', 'preciso', 'precisamos', 'quero', 'queria', 'gostaria', 'procure', 'procura', 'procurar', 'busque',
  'busca', 'buscar', 'encontre', 'encontra', 'encontrar', 'ache', 'acha', 'achar', 'mostre', 'mostra', 'mostrar', 'me', 'ver', 'veja', 'liste',
  'lista', 'listar', 'tem', 'tenha', 'existe', 'alguma', 'algum', 'uma', 'umas', 'um', 'uns', 'as', 'os', 'a', 'o', 'de', 'da', 'do', 'das', 'dos',
  'licitacao', 'licitacoes', 'edital', 'editais', 'oportunidade', 'oportunidades', 'pra', 'para', 'sobre', 'com', 'que', 'esteja', 'estejam',
  'aberta', 'abertas', 'aberto', 'abertos', 'em', 'no', 'na', 'nos', 'nas', 'e', 'ai', 'ja',
])
const LIGACOES_NAS_PONTAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'em', 'no', 'na', 'e', 'a', 'o'])

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const MULTIPLICADORES: Record<string, number> = { mil: 1_000, milhao: 1_000_000, milhoes: 1_000_000, bilhao: 1_000_000_000, bilhoes: 1_000_000_000 }

function numeroEscrito(bruto: string): number | null {
  const s = bruto.replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const ultimaVirgula = s.lastIndexOf(',')
  const ultimoPonto = s.lastIndexOf('.')
  let normal: string
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    normal = ultimaVirgula > ultimoPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimaVirgula > -1) {
    normal = s.length - ultimaVirgula - 1 === 3 && s.indexOf(',') !== ultimaVirgula ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (ultimoPonto > -1) {
    const partes = s.split('.')
    normal = partes.length > 2 || partes[partes.length - 1].length === 3 ? s.replace(/\./g, '') : s
  } else {
    normal = s
  }
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

export function lerValorFalado(texto: string): number | null {
  const t = normalizar(texto).replace(/r\$\s*/g, '')
  const padrao = /(\d[\d.,]*\d|\d)\s*(bilhoes|bilhao|milhoes|milhao|mil\b)?(?:\s+e\s+(\d[\d.,]*)\s*(mil\b)?)?(?:\s*reais)?(?:\s+e\s+(\d{1,2})\s*centavos?)?/g
  for (const m of t.matchAll(padrao)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 6), m.index ?? 0)
    if (/\bitem\s*$/.test(antes)) continue
    const base = numeroEscrito(m[1])
    if (base === null) continue
    let valor = base * (m[2] ? MULTIPLICADORES[m[2]] : 1)
    if (m[3]) {
      const extra = numeroEscrito(m[3])
      if (extra !== null) valor += extra * (m[4] ? 1_000 : m[2] && MULTIPLICADORES[m[2]] > 1_000 ? 1_000 : 1)
    }
    if (m[5]) valor += Number(m[5]) / 100
    valor = Math.round(valor * 100) / 100
    if (valor > 0) return valor
  }
  return null
}

function lerItem(t: string): number | null {
  const m = t.match(/\bitem\s*(?:numero\s*|n\s*)?(\d{1,4})\b/)
  return m ? Number(m[1]) : null
}

function acharEstado(t: string, original: string): { uf: string; trecho: RegExp } | null {
  for (const [nome, uf] of ESTADOS) {
    const re = new RegExp(`\\b(?:no|na|em|do|da|de|pro|pra|para o|para a)\\s+(?:estado (?:de |do |da )?)?${nome}\\b`)
    if (re.test(t)) return { uf, trecho: re }
  }
  const sigla = t.match(/\b(?:no|na|em|do|da|de)\s+([a-z]{2})\b/g) ?? []
  for (const trecho of sigla) {
    const s = trecho.slice(-2).toUpperCase()
    if (!SIGLAS.has(s)) continue
    if (SIGLAS_QUE_SAO_PALAVRAS.has(s) && !new RegExp(`\\b${s}\\b`).test(original)) continue
    return { uf: s, trecho: new RegExp(`\\b${trecho.replace(/\s+/g, '\\s+')}\\b`) }
  }
  return null
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

  for (const [chave, nome, uf] of CAPITAIS) {
    const re = new RegExp(`\\b(?:em|de|da|do|no|na|para)\\s+${chave}\\b`)
    if (re.test(t)) {
      filtros.municipio = nome
      filtros.uf = uf
      removidos.push(re)
      break
    }
  }
  if (!filtros.uf) {
    const estado = acharEstado(t, original)
    if (estado) {
      filtros.uf = estado.uf
      removidos.push(estado.trecho)
    }
  }

  for (const [re, modalidade, nome] of MODALIDADES) {
    if (re.test(t)) {
      filtros.modalidade = modalidade
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

  if (!filtros.q && !filtros.uf && !filtros.modalidade) {
    return { acao: 'desconhecida', resumo: 'Não entendi o que buscar. Diga, por exemplo: "licitação de estrutura metálica no DF".' }
  }

  const descricao = [
    filtros.q ? `"${filtros.q}"` : 'licitações',
    partes.length ? `em ${partes.join(', ')}` : '',
    filtros.municipio ? `em ${filtros.municipio}/${filtros.uf}` : filtros.uf ? `na UF ${filtros.uf}` : '',
    filtros.situacao ? 'abertas' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return { acao: 'buscar', filtros, resumo: `Buscando ${descricao}.` }
}
