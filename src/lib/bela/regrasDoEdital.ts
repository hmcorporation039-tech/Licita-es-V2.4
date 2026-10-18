export type ModoDeDisputa = 'ABERTO' | 'ABERTO_E_FECHADO' | 'FECHADO_E_ABERTO' | 'FECHADO'

export interface IntervaloMinimo {
  tipo: 'PERCENTUAL' | 'REAIS'
  valor: number
  trecho: string
}

export interface ModoIdentificado {
  modo: ModoDeDisputa
  origem: 'pncp' | 'edital'
}

export const NOME_DO_MODO: Record<ModoDeDisputa, string> = {
  ABERTO: 'Aberto',
  ABERTO_E_FECHADO: 'Aberto e fechado',
  FECHADO_E_ABERTO: 'Fechado e aberto',
  FECHADO: 'Fechado',
}

export const COMO_FUNCIONA_O_MODO: Record<ModoDeDisputa, string> = {
  ABERTO:
    'Lances públicos e sucessivos. A etapa de lances dura 10 minutos e é prorrogada por mais 2 minutos sempre que alguém der lance nos últimos 2 minutos, até ninguém mais cobrir.',
  ABERTO_E_FECHADO:
    'Etapa aberta de 15 minutos. Depois do aviso do sistema, ela termina a qualquer momento em até 10 minutos (tempo aleatório). Em seguida, quem tem a melhor oferta e quem está até 10% acima dela (no mínimo os três melhores) pode dar um lance final e fechado em até 5 minutos.',
  FECHADO_E_ABERTO:
    'Primeiro cada um envia um lance fechado, que ninguém vê. Quem tem a melhor oferta e quem está até 10% acima dela (no mínimo os três melhores) passa para a etapa de lances abertos e sucessivos. Confira os tempos no edital.',
  FECHADO: 'Propostas sigilosas, sem etapa de lances abertos. Não há disputa de lances para acompanhar.',
}

export const TEXTO_DESCONHECIDO = 'não identificado — confira no edital'

const MODO_DO_PNCP: Record<number, ModoDeDisputa> = { 1: 'ABERTO', 2: 'FECHADO', 3: 'ABERTO_E_FECHADO', 6: 'FECHADO_E_ABERTO' }

const MAX_TEXTOS = 2000
const MAX_TRECHO = 300

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')
}

export function textosDaAnalise(resultado: unknown): string[] {
  const saida: string[] = []
  const visitar = (v: unknown, profundidade: number) => {
    if (saida.length >= MAX_TEXTOS || profundidade > 6) return
    if (typeof v === 'string') {
      if (v.trim()) saida.push(v)
    } else if (Array.isArray(v)) {
      for (const x of v) visitar(x, profundidade + 1)
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) visitar(x, profundidade + 1)
    }
  }
  visitar(resultado, 0)
  return saida
}

function frases(textos: string[]): { original: string; normal: string }[] {
  return textos
    .flatMap((t) => t.split(/(?<=[.;!?])\s+|\n+/))
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
    .map((f) => ({ original: f.length > MAX_TRECHO ? `${f.slice(0, MAX_TRECHO)}…` : f, normal: normalizar(f) }))
}

const PROIBICAO = String.raw`(?:vedad[oa]s?|vedacao|proibid[oa]s?|proibicao|defes[oa]|nao (?:sera|serao|e|sao|fica|ficam|se) ?(?:permitid|admitid|aceit)[oa]s?|nao (?:se )?(?:permite|admite)m?)`
const ADJETIVO_AUTOMATICO = String.raw`(?:automatic|automatizad)[oa]s?\b`
const AUTOMACAO = String.raw`(?:\brobos?\b|\bbots?\b|lances? (?:\w+ ){0,2}${ADJETIVO_AUTOMATICO}|(?:envio|registro|oferta|oferecimento|insercao) (?:\w+ ){0,2}${ADJETIVO_AUTOMATICO}|softwares?\b.{0,60}?\blances?\b|${ADJETIVO_AUTOMATICO}.{0,30}?\blances?\b)`
const VEDACAO = new RegExp(`${PROIBICAO}.{0,150}?${AUTOMACAO}|${AUTOMACAO}.{0,150}?${PROIBICAO}`)
const NEGACAO_DA_PROIBICAO = /\bnao (?:e|sera|fica|ficam|sao|serao|esta|estao) (?:vedad|proibid)/
const PERMISSAO = /(?<!nao )\b(?:e|sera|sao|serao|fica|ficam|esta|estao) (?:permitid|admitid|facultad|autorizad)\w*|(?<!nao )\bpoder(?:a|ao) (?:utilizar|usar|fazer uso|se valer)/

export function detectarVedacaoARobo(textos: string[]): { trecho: string } | null {
  for (const f of frases(textos)) {
    if (!VEDACAO.test(f.normal)) continue
    if (NEGACAO_DA_PROIBICAO.test(f.normal) || PERMISSAO.test(f.normal)) continue
    return { trecho: f.original }
  }
  return null
}

const INTERVALO = /(?:intervalo minimo|diferenca minima|decremento minimo|redutor minimo)(.{0,220}?)(?:(\d{1,2}(?:,\d{1,4})?) ?%|r\$ ?(\d{1,3}(?:\.\d{3})*,\d{2}))/

const numeroBr = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

export function lerIntervaloMinimo(textos: string[]): { intervalo: IntervaloMinimo | null; ambiguo: boolean } {
  const achados: IntervaloMinimo[] = []
  for (const f of frases(textos)) {
    const m = INTERVALO.exec(f.normal)
    if (!m || /segundo|minuto/.test(m[1])) continue
    const intervalo: IntervaloMinimo | null = m[2]
      ? { tipo: 'PERCENTUAL', valor: numeroBr(m[2]), trecho: f.original }
      : { tipo: 'REAIS', valor: numeroBr(m[3]), trecho: f.original }
    if (!Number.isFinite(intervalo.valor) || intervalo.valor <= 0) continue
    if (intervalo.tipo === 'PERCENTUAL' && intervalo.valor > 20) continue
    achados.push(intervalo)
  }
  const distintos = new Set(achados.map((a) => `${a.tipo}:${a.valor}`))
  if (distintos.size === 1) return { intervalo: achados[0], ambiguo: false }
  return { intervalo: null, ambiguo: distintos.size > 1 }
}

const MODO_NO_TEXTO = /modo (?:de )?disputa.{0,60}?\b(aberto ?(?:e|-|\/) ?fechado|fechado ?(?:e|-|\/) ?aberto|aberto|fechado)\b/

export function lerModoDeDisputa(textos: string[]): ModoDeDisputa | null {
  const achados = new Set<ModoDeDisputa>()
  for (const f of frases(textos)) {
    const m = MODO_NO_TEXTO.exec(f.normal)
    if (!m) continue
    const t = m[1]
    achados.add(/^aberto ?(?:e|-|\/)/.test(t) ? 'ABERTO_E_FECHADO' : /^fechado ?(?:e|-|\/)/.test(t) ? 'FECHADO_E_ABERTO' : t === 'aberto' ? 'ABERTO' : 'FECHADO')
  }
  return achados.size === 1 ? [...achados][0] : null
}

export function modoDoPncp(rawJson: unknown): ModoDeDisputa | null {
  if (!rawJson || typeof rawJson !== 'object') return null
  const id = Number((rawJson as Record<string, unknown>).modoDisputaId)
  return Number.isInteger(id) ? (MODO_DO_PNCP[id] ?? null) : null
}

const NAO_ESPECIFICADO = /nao (?:especificad|informad|encontrad|consta)/

export function criterioDeJulgamento(analise: unknown, criteriosDosItens: (string | null)[]): string | null {
  const daAnalise = analise && typeof analise === 'object' ? (analise as Record<string, unknown>).criterioJulgamento : null
  if (typeof daAnalise === 'string' && daAnalise.trim() && !NAO_ESPECIFICADO.test(normalizar(daAnalise))) return daAnalise.trim().slice(0, MAX_TRECHO)
  const dosItens = [...new Set(criteriosDosItens.filter((c): c is string => Boolean(c && c.trim())).map((c) => c.trim()))]
  return dosItens.length > 0 ? dosItens.slice(0, 3).join(' · ') : null
}

export interface RegrasDoEdital {
  analisado: boolean
  modoDeDisputa: ModoIdentificado | null
  intervaloMinimo: IntervaloMinimo | null
  intervaloAmbiguo: boolean
  vedacaoARobo: { trecho: string } | null
  criterioDeJulgamento: string | null
}

export function regrasDoEdital(entrada: { analise: { status: string; resultado: unknown } | null; rawJson: unknown; criteriosDosItens: (string | null)[] }): RegrasDoEdital {
  const analisado = entrada.analise?.status === 'DONE' && Boolean(entrada.analise.resultado) && typeof entrada.analise.resultado === 'object'
  const textos = analisado ? textosDaAnalise(entrada.analise!.resultado) : []
  const doPncp = modoDoPncp(entrada.rawJson)
  const doEdital = analisado ? lerModoDeDisputa(textos) : null
  const { intervalo, ambiguo } = analisado ? lerIntervaloMinimo(textos) : { intervalo: null, ambiguo: false }
  return {
    analisado,
    modoDeDisputa: doPncp ? { modo: doPncp, origem: 'pncp' } : doEdital ? { modo: doEdital, origem: 'edital' } : null,
    intervaloMinimo: intervalo,
    intervaloAmbiguo: ambiguo,
    vedacaoARobo: analisado ? detectarVedacaoARobo(textos) : null,
    criterioDeJulgamento: criterioDeJulgamento(analisado ? entrada.analise!.resultado : null, entrada.criteriosDosItens),
  }
}
