// ============================================================
// lib/alertasLegais.ts — Alertas fixos sobre exigências de edital que parecem
// ultrapassar os limites da Lei 14.133/2021. São REGRAS EM CÓDIGO aplicadas ao
// texto que a análise por IA extraiu: a IA lê o edital, mas quem decide se algo
// passa do limite é a conta, que é previsível e testável.
//
// IMPORTANTE: é INDÍCIO para análise jurídica, nunca conclusão. O texto extraído
// pode estar incompleto e a lei admite exceções. Os artigos citados devem ser
// validados por advogado antes de virarem promessa comercial.
// ============================================================

import { normalize } from './geoService'

export type GravidadeDoAlerta = 'alta' | 'media'

export type IdDoAlerta =
  | 'garantia-proposta'
  | 'garantia-contratual'
  | 'patrimonio-liquido'
  | 'visita-tecnica'
  | 'indice-contabil'
  | 'faturamento-minimo'
  | 'atestado-quantitativo'
  | 'atestado-tempo-local'
  | 'propriedade-ou-sede'
  | 'documento-fora-do-rol'

export interface AlertaLegal {
  id: IdDoAlerta
  chave: string
  titulo: string
  gravidade: GravidadeDoAlerta
  detalhe: string
  fundamento: string
  trecho: string
  local?: string
}

export interface ExigenciaParaAlertas {
  texto: string
  local?: string
}

export interface EntradaDeAlertas {
  garantiaProposta?: string
  garantiaContratual?: string
  patrimonioLiquidoMinimo?: string
  visitaTecnica?: string
  // Valor estimado da contratação, em reais, quando conhecido.
  valorEstimado: number | null
  exigencias?: ExigenciaParaAlertas[]
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
}

function numero(txt: string): number {
  return Number(txt.replace(',', '.'))
}

// Percentuais citados no texto: "1%", "1,5 %", "5 (cinco) por cento", "um por cento".
export function lerPercentuais(texto: string): number[] {
  const t = normalize(texto)
  const achados: number[] = []
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)) achados.push(numero(m[1]))
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*(?:\([^)]*\)\s*)?por\s*cento/g)) achados.push(numero(m[1]))
  for (const m of t.matchAll(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s+por\s*cento/g)) {
    achados.push(NUMEROS_POR_EXTENSO[m[1]])
  }
  return achados.filter((n) => Number.isFinite(n))
}

// Valores em reais: "R$ 1.234.567,89".
export function lerValoresEmReais(texto: string): number[] {
  const achados: number[] = []
  for (const m of texto.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) achados.push(n)
  }
  return achados
}

function recorte(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > 300 ? `${t.slice(0, 300)}…` : t
}

function dizQueNaoHa(texto: string): boolean {
  const t = normalize(texto)
  return /nao\s+(sera|serao|ha|havera|se\s+aplica|especificado|exig|constam?|consta)|dispensad|sem\s+exigencia|nao\s+informad/.test(t)
}

// Só vale avaliar se há texto e ele não diz que a exigência não existe (um percentual
// escrito sempre vale, mesmo numa frase com "não").
function deveAvaliar(texto: string | undefined): texto is string {
  return !!texto && (!dizQueNaoHa(texto) || lerPercentuais(texto).length > 0)
}

// Maior valor exigido, expresso como percentual do valor estimado.
// Prefere o percentual escrito; senão converte o valor em reais quando o valor estimado é conhecido.
function maiorPercentualExigido(texto: string, valorEstimado: number | null): number | null {
  const pcts = lerPercentuais(texto)
  if (pcts.length > 0) return Math.max(...pcts)
  if (valorEstimado && valorEstimado > 0) {
    const reais = lerValoresEmReais(texto)
    if (reais.length > 0) return (Math.max(...reais) / valorEstimado) * 100
  }
  return null
}

const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export const VALOR_MINIMO_DE_GRANDE_VULTO = 200_000_000
const FUNDAMENTO_DA_GARANTIA_CONTRATUAL =
  'Lei 14.133/2021, art. 98 (obras, serviços e fornecimentos: até 5% do valor do contrato, ou até 10% com justificativa de complexidade técnica e riscos) e art. 99 (obras e serviços de engenharia de grande vulto: até 30%, com cláusula de retomada pela seguradora)'
const CONFIRA_COM_O_ADVOGADO = 'Verifique com seu advogado antes de impugnar.'

export function calcularAlertasLegais(e: EntradaDeAlertas): AlertaLegal[] {
  const alertas: AlertaLegal[] = []

  // Garantia de proposta: até 1% do valor estimado (art. 58, §1º).
  if (deveAvaliar(e.garantiaProposta)) {
    const p = maiorPercentualExigido(e.garantiaProposta as string, e.valorEstimado)
    if (p !== null && p > 1.0001) {
      alertas.push({
        id: 'garantia-proposta',
        chave: 'garantia-proposta',
        titulo: 'Garantia de proposta acima de 1%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir garantia de proposta de cerca de ${f(p)}% do valor estimado. A lei limita a 1%.`,
        fundamento: 'Lei 14.133/2021, art. 58, §1º',
        trecho: recorte(e.garantiaProposta as string),
      })
    }
  }

  // Garantia contratual: até 5%, podendo chegar a 10% se justificada (art. 98).
  if (deveAvaliar(e.garantiaContratual)) {
    const p = maiorPercentualExigido(e.garantiaContratual, e.valorEstimado)
    const abaixoDoGrandeVulto = e.valorEstimado !== null && e.valorEstimado > 0 && e.valorEstimado < VALOR_MINIMO_DE_GRANDE_VULTO
    const base = { id: 'garantia-contratual' as const, chave: 'garantia-contratual', fundamento: FUNDAMENTO_DA_GARANTIA_CONTRATUAL, trecho: recorte(e.garantiaContratual) }
    if (p !== null && p > 30.0001) {
      alertas.push({
        ...base,
        titulo: 'Garantia contratual acima de 30%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}% do valor do contrato, acima até do teto de 30% que a lei admite para obras e serviços de engenharia de grande vulto. ${CONFIRA_COM_O_ADVOGADO}`,
      })
    } else if (p !== null && p > 10.0001 && abaixoDoGrandeVulto) {
      alertas.push({
        ...base,
        titulo: 'Garantia contratual acima de 10%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}% do valor do contrato. A regra geral é até 5%, ou até 10% com justificativa; acima disso, só obras e serviços de engenharia de grande vulto, e o valor estimado desta licitação fica abaixo desse patamar. ${CONFIRA_COM_O_ADVOGADO}`,
      })
    } else if (p !== null && p > 10.0001) {
      alertas.push({
        ...base,
        titulo: 'Garantia contratual acima de 10%',
        gravidade: 'media',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}% do valor do contrato. A regra geral é até 5%, ou até 10% com justificativa; até 30% só é admitido em obras e serviços de engenharia de grande vulto: confira se é de grande vulto e se o edital traz a cláusula de retomada pela seguradora. ${CONFIRA_COM_O_ADVOGADO}`,
      })
    } else if (p !== null && p > 5.0001) {
      alertas.push({
        ...base,
        titulo: 'Garantia contratual acima de 5%',
        gravidade: 'media',
        detalhe: `O edital parece exigir garantia contratual de cerca de ${f(p)}%. Acima de 5% só é admitido, até 10%, com justificativa de complexidade técnica e riscos: confira se o edital a apresenta. ${CONFIRA_COM_O_ADVOGADO}`,
      })
    }
  }

  // Patrimônio líquido ou capital mínimo: até 10% do valor estimado (art. 69, §4º).
  if (deveAvaliar(e.patrimonioLiquidoMinimo)) {
    const p = maiorPercentualExigido(e.patrimonioLiquidoMinimo, e.valorEstimado)
    if (p !== null && p > 10.0001) {
      alertas.push({
        id: 'patrimonio-liquido',
        chave: 'patrimonio-liquido',
        titulo: 'Patrimônio líquido ou capital mínimo acima de 10%',
        gravidade: 'alta',
        detalhe: `O edital parece exigir patrimônio líquido ou capital mínimo de cerca de ${f(p)}% do valor estimado. O limite legal é 10%.`,
        fundamento: 'Lei 14.133/2021, art. 69, §4º',
        trecho: recorte(e.patrimonioLiquidoMinimo),
      })
    }
  }

  // Visita técnica obrigatória sem alternativa de declaração (art. 63, §2º).
  if (e.visitaTecnica && !dizQueNaoHa(e.visitaTecnica)) {
    const t = normalize(e.visitaTecnica)
    const obrigatoria = /obrigatori/.test(t) || /\bdeve(ra)?\s+(realizar|comparecer)|necessari[ao]\s+(a\s+)?(realizacao|visita)/.test(t)
    const temAlternativa = /declaracao|facultativ|opcional|substitu|dispens/.test(t)
    if (obrigatoria && !temAlternativa) {
      alertas.push({
        id: 'visita-tecnica',
        chave: 'visita-tecnica',
        titulo: 'Visita técnica obrigatória sem alternativa de declaração',
        gravidade: 'media',
        detalhe:
          'O edital parece tornar a visita técnica obrigatória sem permitir que ela seja substituída por declaração do responsável técnico de que conhece as condições do local. A lei exige essa alternativa.',
        fundamento: 'Lei 14.133/2021, art. 63, §2º',
        trecho: recorte(e.visitaTecnica),
      })
    }
  }

  return [...alertas, ...alertasDasExigencias(e.exigencias ?? [])]
}

const FUNDAMENTO_DO_ROL = 'Lei 14.133/2021, arts. 62 a 70 (rol de documentos de habilitação) e jurisprudência do TCU'

type AchadoDaRegra = Pick<AlertaLegal, 'titulo' | 'gravidade' | 'detalhe' | 'fundamento'>

interface RegraDeExigencia {
  id: IdDoAlerta
  avaliar: (t: string) => AchadoDaRegra | null
}

const mencionaAtestado = (t: string) => /atestad|capacidade tecnica|capacitacao tecnic|acervo tecnico/.test(t)

function maiorIndiceExigido(t: string): number | null {
  const padrao =
    /\b(ilg|ilc|isg|lg|lc|sg|liquidez geral|liquidez corrente|solvencia geral)\b[^.;]{0,60}?(?:>=|=>|>|igua(?:l|is) ou superior(?:es)? a|igua(?:l|is) ou maior(?:es)? (?:que|a|do que)|superior(?:es)? a|maior(?:es)? (?:ou igua(?:l|is) )?(?:que|a|do que)|minimo de|no minimo|nao inferior(?:es)? a)\s*(\d+(?:[.,]\d+)?)(?![\d.,]*\s*(?:%|por\s*cento))/g
  let maior: number | null = null
  for (const m of t.matchAll(padrao)) {
    const v = Number(m[2].replace(',', '.'))
    if (Number.isFinite(v) && v <= 5 && (maior === null || v > maior)) maior = v
  }
  return maior
}

const DOCUMENTOS_FORA_DO_ROL: Array<[RegExp, string]> = [
  [/certidao\s+(?:negativa\s+)?de\s+protestos?/, 'Certidão negativa de protesto'],
  [/(?:quitacao|adimplencia|em dia)\b[^.;]{0,50}(?:anuidade|crea|cau|cra|crc|crq|conselho regional)|anuidades?[^.;]{0,30}(?:quitad|paga|em dia)/, 'Prova de quitação de anuidade com conselho profissional'],
  [/\biso\s?-?\s?(?:9001|14001|45001|27001)|certificac\w*\s+(?:de\s+)?(?:qualidade\s+)?iso\b/, 'Certificação ISO como requisito de habilitação'],
  [/carta\s+de\s+(?:solidariedade|credenciamento)|declaracao\s+(?:do|de)\s+fabricante|(?:revendedor|distribuidor|representante)\s+autorizad/, 'Carta ou declaração do fabricante'],
  [/alvara\s+de\s+(?:funcionamento|localizacao)/, 'Alvará de funcionamento'],
]

const REGRAS_DE_EXIGENCIA: RegraDeExigencia[] = [
  {
    id: 'indice-contabil',
    avaliar: (t) => {
      const v = maiorIndiceExigido(t)
      if (v === null || v <= 1.0001) return null
      return {
        titulo: `Índice contábil exigido acima do usual (${f(v)})`,
        gravidade: v >= 2 ? 'alta' : 'media',
        detalhe: `O edital parece exigir índice de liquidez ou solvência de ${f(v)}. O usual é 1,0; acima disso o processo precisa justificar o valor com parâmetros de mercado e as características do objeto.`,
        fundamento: 'Lei 14.133/2021, art. 69, e Súmula 289 do TCU',
      }
    },
  },
  {
    id: 'faturamento-minimo',
    avaliar: (t) => {
      const faturamento = /faturamento\s+(?:bruto\s+|anual\s+|medio\s+)*(?:minimo|igual ou superior|de no minimo|nao inferior|superior a)/.test(t)
      const rentabilidade = /indices?\s+de\s+(?:rentabilidade|lucratividade)|margem\s+de\s+lucro\s+minima/.test(t)
      if (!faturamento && !rentabilidade) return null
      return {
        titulo: faturamento ? 'Exigência de faturamento mínimo' : 'Exigência de índice de rentabilidade ou lucratividade',
        gravidade: 'alta',
        detalhe: 'A lei veda exigir valores mínimos de faturamento anterior e índices de rentabilidade ou lucratividade na habilitação econômico-financeira.',
        fundamento: 'Lei 14.133/2021, art. 69, e Súmula 289 do TCU',
      }
    },
  },
  {
    id: 'atestado-quantitativo',
    avaliar: (t) => {
      if (!mencionaAtestado(t)) return null
      const pcts = lerPercentuais(t).filter((p) => p > 50.0001 && p <= 100)
      if (pcts.length === 0) return null
      const p = Math.max(...pcts)
      return {
        titulo: `Atestado com ${f(p)}% da quantidade`,
        gravidade: 'alta',
        detalhe: `O edital parece exigir atestado de capacidade técnica com ${f(p)}% do quantitativo. A lei admite no máximo 50% das parcelas de maior relevância.`,
        fundamento: 'Lei 14.133/2021, art. 67, §2º',
      }
    },
  },
  {
    id: 'atestado-tempo-local',
    avaliar: (t) => {
      if (!mencionaAtestado(t)) return null
      const tempo = /\b(?:nos|dos)\s+ultimos\s+\d+\s*(?:\([^)]*\)\s*)?(?:anos|meses)|emitid[oa]s?\s+(?:a partir|apos|nos ultimos)/.test(t)
      const local = /executad[oa]s?\s+(?:no|na|em)\s+(?:estado|municipio|regiao|cidade)|\b(?:no|na|deste|desta)\s+(?:mesmo\s+)?(?:estado|regiao|municipio)\s+(?:de|do|da)\b/.test(t)
      if (!tempo && !local) return null
      return {
        titulo: `Atestado limitado por ${tempo && local ? 'tempo e local' : tempo ? 'tempo' : 'local'}`,
        gravidade: 'media',
        detalhe: 'O edital parece aceitar só atestados de um período ou de um local específico. A lei veda limitações de tempo e de locais específicos para os atestados.',
        fundamento: 'Lei 14.133/2021, art. 67, §2º',
      }
    },
  },
  {
    id: 'propriedade-ou-sede',
    avaliar: (t) => {
      const propriedade = /(?:propriedade|posse)\s+(?:previa\s+)?(?:de|do|da|dos|das)\s+(?:\w+\s+){0,2}(?:equipamento|veiculo|maquin|usina|caminh|frota|imove|instalac)/.test(t)
      const sede = /(?:possuir|manter|dispor de|ter)\s+(?:sede|escritorio|filial|estabelecimento|deposito|loja)\s+(?:\w+\s+){0,3}(?:no|na|em|dentro)\s+(?:o\s+|a\s+)?(?:municipio|cidade|estado|raio|regiao)/.test(t)
      const depoisDoContrato = /(?:apos|depois)\s+(?:a\s+)?(?:assinatura|contratacao|homologacao)|contad[oa]s?\s+da\s+assinatura/.test(t)
      if ((!propriedade && !sede) || depoisDoContrato) return null
      return {
        titulo: propriedade ? 'Exigência de propriedade de equipamentos ou instalações' : 'Exigência de sede ou escritório no local',
        gravidade: 'media',
        detalhe: 'Se exigido já na habilitação, obriga o licitante a ter custos antes de saber se vai contratar. O correto é pedir declaração de disponibilidade e cobrar só de quem for contratado.',
        fundamento: 'Súmula 272 do TCU e Lei 14.133/2021, art. 67',
      }
    },
  },
  {
    id: 'documento-fora-do-rol',
    avaliar: (t) => {
      const achado = DOCUMENTOS_FORA_DO_ROL.find(([re]) => re.test(t))
      if (!achado) return null
      const alvara = achado[1] === 'Alvará de funcionamento'
      return {
        titulo: `${achado[1]} fora do rol da lei`,
        gravidade: 'media',
        detalhe: alvara
          ? 'O alvará de funcionamento não está no rol de documentos de habilitação. Só cabe quando lei especial exigir para a atividade do objeto (ex.: vigilância sanitária).'
          : 'O documento não está no rol de documentos de habilitação da lei, que é taxativo. Exigências fora do rol restringem a competição sem amparo legal.',
        fundamento: FUNDAMENTO_DO_ROL,
      }
    },
  },
]

interface AnaliseComExigencias {
  matrizExigencias?: Array<{ texto: string; documento?: string; pagina?: string; item?: string }>
  exigenciasTecnicas?: string[]
  documentosExigidos?: string[]
}

interface AnaliseParaAlertas extends AnaliseComExigencias {
  garantiaProposta?: unknown
  garantiaContratual?: string
  patrimonioLiquidoMinimo?: string
  visitaTecnica?: string
  valorEstimado?: string
}

export function alertasDaAnalise(analise: AnaliseParaAlertas | null, valorEstimadoCadastrado: number | null): { disponivel: boolean; itens: AlertaLegal[] } {
  if (!analise || typeof analise.garantiaProposta !== 'string') return { disponivel: false, itens: [] }
  const valorEstimado = valorEstimadoCadastrado ?? lerValoresEmReais(analise.valorEstimado ?? '')[0] ?? null
  return {
    disponivel: true,
    itens: calcularAlertasLegais({
      garantiaProposta: analise.garantiaProposta,
      garantiaContratual: analise.garantiaContratual,
      patrimonioLiquidoMinimo: analise.patrimonioLiquidoMinimo,
      visitaTecnica: analise.visitaTecnica,
      exigencias: exigenciasDaAnalise(analise),
      valorEstimado,
    }),
  }
}

export function exigenciasDaAnalise(a: AnaliseComExigencias): ExigenciaParaAlertas[] {
  const daMatriz = (Array.isArray(a.matrizExigencias) ? a.matrizExigencias : []).map((m) => {
    const local = [m.documento?.trim(), m.pagina?.trim() ? `p. ${m.pagina.trim()}` : '', m.item?.trim() ? `item ${m.item.trim()}` : ''].filter(Boolean).join(', ')
    return { texto: m.texto, ...(local ? { local } : {}) }
  })
  const soltas = [...(Array.isArray(a.exigenciasTecnicas) ? a.exigenciasTecnicas : []), ...(Array.isArray(a.documentosExigidos) ? a.documentosExigidos : [])]
    .filter((t): t is string => typeof t === 'string')
    .map((texto) => ({ texto }))
  return [...daMatriz, ...soltas]
}

export function alertasDasExigencias(exigencias: ExigenciaParaAlertas[]): AlertaLegal[] {
  const alertas: AlertaLegal[] = []
  const vistos = new Set<string>()
  for (const exigencia of exigencias.slice(0, 500)) {
    if (!exigencia.texto) continue
    const t = normalize(exigencia.texto.replace(/≥/g, ' >= ').slice(0, 4000))
    for (const regra of REGRAS_DE_EXIGENCIA) {
      const achado = regra.avaliar(t)
      if (!achado) continue
      const chave = `${regra.id}:${normalize(achado.titulo).replace(/[^a-z0-9]+/g, '-')}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      alertas.push({ id: regra.id, chave, ...achado, trecho: recorte(exigencia.texto), ...(exigencia.local ? { local: exigencia.local } : {}) })
    }
  }
  return alertas
}
