// ============================================================
// lib/contratacaoDoEdital.ts — Lê os campos de contratação da análise do edital
// (vigência, serviço contínuo, início da execução, julgamento, subcontratação,
// manutenção periódica, locais) e sugere o preenchimento do estudo de custos.
//
// A IA só transcreve; as contas são feitas aqui, com regras simples e conferíveis.
// Na dúvida (texto ambíguo, números diferentes), devolve null: o usuário preenche.
// ============================================================

import type { EditalAnalysisResult } from '../services/llm/types'
import type { ContratoDoEstudo } from './estudoDeCustos'

export type AnaliseDaContratacao = Pick<
  EditalAnalysisResult,
  | 'vigenciaContrato'
  | 'servicoContinuo'
  | 'inicioDaExecucao'
  | 'formaDeJulgamento'
  | 'metodoDoPrecoEstimado'
  | 'subcontratacao'
  | 'periodicidadeDeManutencao'
  | 'locaisDeExecucao'
  | 'visitaTecnica'
>

const NAO_INFORMADO = /^\s*(n[aã]o (especificad|mencionad|se aplica|exigid|informad)|—|-)\b/i

function normal(t: string | null | undefined): string {
  return (t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function informado(t: string | null | undefined): t is string {
  return !!t && t.trim().length > 0 && !NAO_INFORMADO.test(t)
}

// "5 (cinco) anos", "60 meses", "12 (doze) meses, prorrogável até 10 anos" -> meses.
// Só a primeira menção: o que vem depois costuma ser o limite das prorrogações.
export function lerVigenciaEmMeses(texto: string | null | undefined): number | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  const m = t.match(/(\d{1,3})\s*(?:\([^)]*\)\s*)?(anos?|mes(?:es)?)\b/)
  if (!m) return null
  const n = Number(m[1])
  const meses = m[2].startsWith('ano') ? n * 12 : n
  return meses >= 1 && meses <= 120 ? meses : null
}

export function lerServicoContinuo(texto: string | null | undefined): boolean | null {
  if (!informado(texto)) return null
  const t = normal(texto).trim()
  if (/^sim\b/.test(t)) return true
  if (/^nao\b/.test(t)) return false
  return null
}

// Prazo até começar a faturar. Um só prazo em dias ou meses vira dias; várias etapas
// em sequência ("OS em até 75 dias ... disponibilização em 120 dias contados da OS")
// são somadas só quando a segunda conta a partir da primeira.
export function lerDiasDeMobilizacao(texto: string | null | undefined): number | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  const prazos = [...t.matchAll(/(\d{1,4})\s*(?:\([^)]*\)\s*)?(dias?|mes(?:es)?)\b/g)].map((m) => (m[2].startsWith('mes') ? Number(m[1]) * 30 : Number(m[1])))
  if (prazos.length === 0) return null
  if (prazos.length === 1) return prazos[0]
  if (prazos.length === 2 && /contad[oa]s?\b[^.;]{0,40}\b(?:ordem de servico|os)\b/.test(t)) return prazos[0] + prazos[1]
  return new Set(prazos).size === 1 ? prazos[0] : null
}

const PERIODICIDADES: [RegExp, number, string][] = [
  [/\bdiari[ao]s?\b/, 365, 'diária'],
  [/\bseman(?:al|ais)\b/, 52, 'semanal'],
  [/\bquinzena(?:l|is)\b/, 24, 'quinzenal'],
  [/\bmensa(?:l|is)\b/, 12, 'mensal'],
  [/\bbimestra(?:l|is)\b/, 6, 'bimestral'],
  [/\btrimestra(?:l|is)\b/, 4, 'trimestral'],
  [/\bquadrimestra(?:l|is)\b/, 3, 'quadrimestral'],
  [/\bsemestra(?:l|is)\b/, 2, 'semestral'],
  [/\banua(?:l|is)\b/, 1, 'anual'],
]

// "zeladoria quadrimestral e preventiva anual" -> 4 visitas/ano (3 + 1).
// "2 visitas por ano" / "6 vezes ao ano" também valem. As visitas podem coincidir:
// a soma é o máximo, e a tela diz isso.
export function lerVisitasPorAno(texto: string | null | undefined): { visitas: number; partes: string[] } | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  const explicita = t.match(/(\d{1,3})\s*(?:\([^)]*\)\s*)?(?:visitas?|vezes|manutencoes|inspecoes)\s*(?:por|ao|a cada)\s*ano/)
  if (explicita) return { visitas: Number(explicita[1]), partes: [`${explicita[1]} por ano`] }
  let visitas = 0
  const partes: string[] = []
  for (const [re, n, nome] of PERIODICIDADES) {
    if (re.test(t)) {
      visitas += n
      partes.push(nome)
    }
  }
  return visitas > 0 && visitas <= 365 ? { visitas, partes } : null
}

// "22 sítios (itens 1 a 22)", "3 unidades", "1 local" -> quantidade de locais.
export function lerQuantidadeDeLocais(texto: string | null | undefined): number | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  const m = t.match(/(\d{1,4})\s*(?:\([^)]*\)\s*)?(locais|local|sitios?|unidades?|enderecos?|pontos?|torres?|predios?|imoveis|imovel|escolas?|postos?|lojas?|bases?|sedes?|filiais|filial|delegacias?)\b/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 5000 ? n : null
}

/** Propostas por item mas julgamento por grupo/lote: cada item tem de caber no estimado. */
export function propostaPorItemJulgamentoPorGrupo(texto: string | null | undefined): boolean {
  if (!informado(texto)) return false
  const t = normal(texto)
  return /por item/.test(t) && /(por|de) (grupo|lote)/.test(t)
}

export type Subcontratacao = 'vedada' | 'parcial' | 'permitida'

export function lerSubcontratacao(texto: string | null | undefined): Subcontratacao | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  if (/(vedad|proibid|nao (?:sera )?(?:admitid|permitid)|nao se admite|nao e permitid)/.test(t)) {
    return /(parcela|parcial|ate \d|limite|exceto|salvo)/.test(t) ? 'parcial' : 'vedada'
  }
  if (/(parcela|parcial|ate \d+\s*%|limite)/.test(t)) return 'parcial'
  if (/(permitid|admitid)/.test(t)) return 'permitida'
  return null
}

export type Vistoria = 'obrigatoria' | 'facultativa'

export function lerVistoria(texto: string | null | undefined): Vistoria | null {
  if (!informado(texto)) return null
  const t = normal(texto)
  if (/facultativ|opcional|declaracao/.test(t)) return 'facultativa'
  if (/obrigatori/.test(t)) return 'obrigatoria'
  return null
}

export interface SugestaoDoEdital {
  /** Tipo de contrato, vigência e meses sem faturar, quando o edital deixa claro. */
  contrato: ContratoDoEstudo | null
  visitasPorAno: number | null
  periodicidades: string[]
  locais: number | null
  /** Viagens no contrato: visitas por ano × anos × locais. */
  viagens: number | null
  /** Contas feitas, em português, para a tela mostrar. */
  explicacao: string[]
}

export interface ContratacaoDoEdital {
  textos: { rotulo: string; valor: string }[]
  sugestao: SugestaoDoEdital
  julgamentoPorGrupo: boolean
  subcontratacao: Subcontratacao | null
  vistoria: Vistoria | null
}

export function contratacaoDoEdital(a: Partial<AnaliseDaContratacao> | null | undefined): ContratacaoDoEdital | null {
  if (!a) return null
  const textos = (
    [
      ['Vigência', a.vigenciaContrato],
      ['Serviço contínuo', a.servicoContinuo],
      ['Início da execução', a.inicioDaExecucao],
      ['Forma de julgamento', a.formaDeJulgamento],
      ['Como o preço foi estimado', a.metodoDoPrecoEstimado],
      ['Subcontratação', a.subcontratacao],
      ['Visita técnica', a.visitaTecnica],
      ['Manutenção / visitas periódicas', a.periodicidadeDeManutencao],
      ['Locais de execução', a.locaisDeExecucao],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([rotulo, valor]) => ({ rotulo, valor: (valor as string).trim() }))
  if (textos.length === 0) return null

  const explicacao: string[] = []
  const continuo = lerServicoContinuo(a.servicoContinuo)
  const vigencia = lerVigenciaEmMeses(a.vigenciaContrato)
  const mobilizacaoDias = lerDiasDeMobilizacao(a.inicioDaExecucao)
  let contrato: ContratoDoEstudo | null = null
  if (continuo === true) {
    const vigenciaMeses = vigencia ?? 12
    const mesesSemFaturar = mobilizacaoDias !== null ? Math.min(vigenciaMeses - 1, Math.max(0, Math.round(mobilizacaoDias / 30))) : 0
    contrato = { tipo: 'continuo', vigenciaMeses, mesesSemFaturar }
    explicacao.push(
      `Serviço contínuo com vigência de ${vigenciaMeses} meses${vigencia === null ? ' (vigência não lida no edital: confira)' : ''}.`,
    )
    if (mobilizacaoDias !== null && mesesSemFaturar > 0) explicacao.push(`${mobilizacaoDias} dias até começar a executar ≈ ${mesesSemFaturar} ${mesesSemFaturar === 1 ? 'mês' : 'meses'} sem faturar.`)
  } else if (continuo === false) {
    contrato = { tipo: 'unico', vigenciaMeses: vigencia ?? 12, mesesSemFaturar: 0 }
  }

  const visitas = lerVisitasPorAno(a.periodicidadeDeManutencao)
  const locais = lerQuantidadeDeLocais(a.locaisDeExecucao)
  let viagens: number | null = null
  if (visitas && contrato?.tipo === 'continuo') {
    const mesesFaturados = contrato.vigenciaMeses - contrato.mesesSemFaturar
    const porLocal = Math.ceil((visitas.visitas * mesesFaturados) / 12)
    viagens = Math.min(1000, porLocal * (locais ?? 1))
    explicacao.push(
      `Visitas: ${visitas.partes.join(' + ')} = até ${visitas.visitas} por ano` +
        ` × ${mesesFaturados} meses${locais ? ` × ${locais} ${locais === 1 ? 'local' : 'locais'}` : ''} = ${viagens} viagens` +
        (visitas.partes.length > 1 ? ' (se as visitas coincidirem, são menos).' : '.'),
    )
  }

  return {
    textos,
    sugestao: { contrato, visitasPorAno: visitas?.visitas ?? null, periodicidades: visitas?.partes ?? [], locais, viagens, explicacao },
    julgamentoPorGrupo: propostaPorItemJulgamentoPorGrupo(a.formaDeJulgamento),
    subcontratacao: lerSubcontratacao(a.subcontratacao),
    vistoria: lerVistoria(a.visitaTecnica),
  }
}
