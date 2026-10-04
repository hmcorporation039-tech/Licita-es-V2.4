// ============================================================
// lib/habilitacao.ts — Semáforo da habilitação: cruza o que o edital pede com
// o cofre de documentos da empresa, olhando a validade NA DATA DA SESSÃO (e
// não a de hoje). Regra pura, sem banco.
//
//   verde     tem o documento e ele cobre a data da sessão
//   amarelo   tem, mas vence antes da sessão (precisa renovar a tempo)
//   vermelho  exigido e não está no cofre, ou já está vencido
//   cinza     não dá para saber só pelo cofre: confira no edital
//
// O que é "exigido": os documentos-padrão da Lei 14.133 (certidões, contrato
// social...) valem em quase toda licitação; os demais só quando o edital os cita
// (a análise por IA lista os específicos). Sem análise, esses ficam em cinza.
// ============================================================

import { ChecklistItem } from './checklistTemplate'
import { Dia, diaEmBrasilia, toDia } from './diasUteis'
import { normalize } from './geoService'

export type StatusHabilitacao = 'verde' | 'amarelo' | 'vermelho' | 'cinza'
export type OrigemDoRequisito = 'padrao' | 'edital' | 'a-confirmar' | 'extra'

export interface DocumentoDoCofre {
  id: string
  nome: string
  tipo: string | null
  dataValidade: Date | null
}

export interface RequisitoAvaliado {
  id: string
  label: string
  section: string
  origem: OrigemDoRequisito
  status: StatusHabilitacao
  motivo: string
  acao: string | null
  documento: { id: string; nome: string; dataValidade: string | null } | null
  // Trechos que a análise por IA listou para este requisito.
  citadoNoEdital: string[]
}

export interface ResultadoHabilitacao {
  referencia: { dataSessao: Dia | null; usouHoje: boolean }
  resumo: Record<StatusHabilitacao, number>
  // Nenhum vermelho = nada impede a habilitação pelo que o cofre sabe.
  semPendenciaBloqueante: boolean
  requisitos: RequisitoAvaliado[]
}

// Documentos exigidos em praticamente toda licitação da Lei 14.133/2021.
const PADRAO_OBRIGATORIO = new Set([
  'contrato-social',
  'rg-cpf-socios',
  'cartao-cnpj',
  'cnd-federal',
  'crf-fgts',
  'cndt',
  'regularidade-estadual',
  'regularidade-municipal',
  'cnd-falencia',
  'balanco-patrimonial',
])

// Declarações e peças da proposta são feitas a cada licitação: não há "validade"
// a guardar no cofre, então a ausência não é pendência (é trabalho a fazer).
const FEITO_A_CADA_PROPOSTA = new Set([
  'declaracao-nao-emprego-menores',
  'declaracao-fato-impeditivo',
  'declaracao-me-epp',
  'declaracao-vistoria',
  'planilha-custos',
  'memorial-descritivo',
  'cronograma-execucao',
  'garantia-proposta',
])

// Como reconhecer, no texto livre da análise, a que tipo do checklist cada item se refere.
const REGRAS_DE_TEXTO: { tipo: string; regex: RegExp }[] = [
  { tipo: 'garantia-proposta', regex: /garantia\s+de\s+proposta/ },
  { tipo: 'atestado-capacidade-tecnica', regex: /atestad/ },
  { tipo: 'registro-conselho-classe', regex: /\b(crea|cau|crc|crm|oab|cfq|crq|cref)\b|conselho\s+(regional|de\s+classe)/ },
  { tipo: 'vinculo-responsavel-tecnico', regex: /vinculo|responsavel\s+tecnico/ },
  { tipo: 'art-rrt', regex: /\b(art|rrt)\b|anotacao\s+de\s+responsabilidade|registro\s+de\s+responsabilidade/ },
  { tipo: 'declaracao-vistoria', regex: /vistoria|visita\s+tecnica/ },
  { tipo: 'indices-contabeis', regex: /indices?\s+contabe|liquidez|solvencia|endividamento/ },
  { tipo: 'balanco-patrimonial', regex: /balanco|demonstracoes\s+contabe/ },
  { tipo: 'cnd-falencia', regex: /falencia|recuperacao\s+judicial/ },
  { tipo: 'planilha-custos', regex: /planilha\s+de\s+(custos|composicao)/ },
  { tipo: 'memorial-descritivo', regex: /memorial|metodologia\s+de\s+execucao/ },
  { tipo: 'cronograma-execucao', regex: /cronograma/ },
  { tipo: 'compatibilidade-convencao-coletiva', regex: /convencao\s+coletiva/ },
  { tipo: 'declaracao-me-epp', regex: /microempresa|empresa\s+de\s+pequeno\s+porte|\bme\b.{0,15}\bepp\b/ },
  { tipo: 'procuracao', regex: /procuracao/ },
]

export function tiposCitadosNoTexto(texto: string): string[] {
  const t = normalize(texto)
  return REGRAS_DE_TEXTO.filter((r) => r.regex.test(t)).map((r) => r.tipo)
}

function dataBr(dia: Dia): string {
  const [y, m, d] = dia.split('-')
  return `${d}/${m}/${y}`
}

// Entre vários documentos do mesmo tipo vale o que cobre por mais tempo (sem validade = para sempre).
function melhorDocumento(docs: DocumentoDoCofre[]): DocumentoDoCofre | null {
  if (docs.length === 0) return null
  return [...docs].sort((a, b) => {
    const va = a.dataValidade ? a.dataValidade.getTime() : Number.POSITIVE_INFINITY
    const vb = b.dataValidade ? b.dataValidade.getTime() : Number.POSITIVE_INFINITY
    return vb - va
  })[0]
}

interface Avaliacao {
  status: StatusHabilitacao
  motivo: string
  acao: string | null
}

function avaliarComDocumento(doc: DocumentoDoCofre, hoje: Dia, ref: Dia, temSessao: boolean): Avaliacao {
  if (!doc.dataValidade) {
    return { status: 'verde', motivo: 'Documento no cofre, sem data de vencimento cadastrada.', acao: null }
  }
  const validade = toDia(doc.dataValidade)
  if (validade < hoje) {
    return {
      status: 'vermelho',
      motivo: `Venceu em ${dataBr(validade)}.`,
      acao: 'Renove o documento e atualize a validade no cofre.',
    }
  }
  if (validade < ref) {
    return {
      status: 'amarelo',
      motivo: `Vence em ${dataBr(validade)}, antes da sessão (${dataBr(ref)}).`,
      acao: 'Providencie a renovação a tempo de apresentá-lo válido na sessão.',
    }
  }
  return {
    status: 'verde',
    motivo: temSessao
      ? `Válido até ${dataBr(validade)}, cobre a data da sessão (${dataBr(ref)}).`
      : `Válido até ${dataBr(validade)} (a licitação não informa a data da sessão).`,
    acao: null,
  }
}

export interface EntradaDeHabilitacao {
  checklist: ChecklistItem[]
  documentos: DocumentoDoCofre[]
  // Textos de `documentosExigidos` da análise por IA; null = análise ainda não feita.
  documentosExigidosIA: string[] | null
  sessao: Date | null
  agora?: Date
}

export function avaliarHabilitacao(e: EntradaDeHabilitacao): ResultadoHabilitacao {
  const agora = e.agora ?? new Date()
  const hoje = diaEmBrasilia(agora)
  const dataSessao = e.sessao ? diaEmBrasilia(e.sessao) : null
  const ref = dataSessao ?? hoje

  // Que texto da análise corresponde a que tipo; o que não casa com nenhum fica como "extra".
  const citacoes = new Map<string, string[]>()
  const extras: string[] = []
  for (const texto of e.documentosExigidosIA ?? []) {
    const tipos = tiposCitadosNoTexto(texto)
    if (tipos.length === 0) extras.push(texto)
    for (const tipo of tipos) citacoes.set(tipo, [...(citacoes.get(tipo) ?? []), texto])
  }
  const analisado = e.documentosExigidosIA !== null

  const requisitos: RequisitoAvaliado[] = []

  for (const item of e.checklist) {
    if (item.custom) continue
    const citado = citacoes.get(item.id) ?? []
    const origem: OrigemDoRequisito = PADRAO_OBRIGATORIO.has(item.id) ? 'padrao' : citado.length > 0 ? 'edital' : 'a-confirmar'
    const doc = melhorDocumento(e.documentos.filter((d) => d.tipo === item.id))
    const base = { id: item.id, label: item.label, section: item.section, origem, citadoNoEdital: citado }

    if (doc) {
      requisitos.push({
        ...base,
        ...avaliarComDocumento(doc, hoje, ref, dataSessao !== null),
        documento: { id: doc.id, nome: doc.nome, dataValidade: doc.dataValidade ? toDia(doc.dataValidade) : null },
      })
      continue
    }

    // Sem documento no cofre.
    if (FEITO_A_CADA_PROPOSTA.has(item.id)) {
      requisitos.push({
        ...base,
        status: 'cinza',
        motivo: 'Peça feita para cada licitação, no modelo do edital: não fica no cofre.',
        acao: origem === 'edital' ? 'O edital cita este item: prepare-o.' : null,
        documento: null,
      })
    } else if (origem === 'padrao' || origem === 'edital') {
      requisitos.push({
        ...base,
        status: 'vermelho',
        motivo: origem === 'edital' ? 'O edital exige e não há documento no cofre.' : 'Exigido na maioria das licitações e não há documento no cofre.',
        acao: 'Obtenha o documento e cadastre-o no cofre, com a validade.',
        documento: null,
      })
    } else {
      requisitos.push({
        ...base,
        status: 'cinza',
        motivo: analisado
          ? 'A análise do edital não cita este item. Confira o edital: se for exigido, cadastre o documento.'
          : 'Só vale se o edital exigir. Rode a análise do edital para saber.',
        acao: null,
        documento: null,
      })
    }
  }

  for (const texto of extras.slice(0, 30)) {
    requisitos.push({
      id: `extra:${normalize(texto).slice(0, 40)}`,
      label: texto,
      section: 'Específico deste edital',
      origem: 'extra',
      status: 'cinza',
      motivo: 'Exigência específica do edital: o cofre não controla este tipo. Confira manualmente.',
      acao: null,
      documento: null,
      citadoNoEdital: [texto],
    })
  }

  const resumo: Record<StatusHabilitacao, number> = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 }
  for (const r of requisitos) resumo[r.status]++

  return {
    referencia: { dataSessao, usouHoje: dataSessao === null },
    resumo,
    semPendenciaBloqueante: resumo.vermelho === 0,
    requisitos,
  }
}
