// Resumo do dia que a Bela mostra (e fala, se o usuário pedir) ao abrir o painel:
// saudação, licitações novas, sessões de hoje/amanhã e documentos vencidos ou vencendo.
// O aviso cruzado (sessão próxima + documento vencido) vem primeiro, como urgente.
// Só afirma o que os dados dizem: sem sessão ou sem documento, a frase não aparece.

import { DESLOCAMENTO_DE_BRASILIA_MS, ehDiaSemHoraDaLicitacao } from './dataDeBrasilia'
import { diaEmBrasilia, somarDias, toDia, type Dia } from './diasUteis'

export const DIAS_PARA_AVISAR_DOCUMENTO = 7
const MAXIMO_DE_SESSOES = 3
const MAXIMO_DE_DOCUMENTOS = 3
const TAMANHO_DO_OBJETO = 90

export interface SessaoParaOResumo {
  tenderId: string
  objeto: string
  fonte: string
  data: Date
}

export interface DocumentoParaOResumo {
  id: string
  nome: string
  dataValidade: Date
}

export interface EntradaDoResumo {
  agora: Date
  nome: string | null
  novas: number
  sessoes: SessaoParaOResumo[]
  documentos: DocumentoParaOResumo[]
}

export type TipoDoItem = 'urgente' | 'sessao' | 'documento' | 'novas'

export interface ItemDoResumo {
  tipo: TipoDoItem
  texto: string
  href: string
}

export interface ResumoDaBela {
  dia: Dia
  saudacao: string
  itens: ItemDoResumo[]
  fala: string
}

export function saudacaoPelaHora(agora: Date): string {
  const hora = new Date(agora.getTime() - DESLOCAMENTO_DE_BRASILIA_MS).getUTCHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function primeiroNome(nome: string | null): string | null {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0]
  if (!primeiro || primeiro.includes('@')) return null
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1)
}

function encurtar(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > TAMANHO_DO_OBJETO ? `${limpo.slice(0, TAMANHO_DO_OBJETO - 3).trimEnd()}...` : limpo
}

function hora(data: Date): string {
  const local = new Date(data.getTime() - DESLOCAMENTO_DE_BRASILIA_MS)
  const h = local.getUTCHours()
  const m = local.getUTCMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function diasEntre(de: Dia, ate: Dia): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)
}

function listaEmTexto(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

export function montarResumoDaBela({ agora, nome, novas, sessoes, documentos }: EntradaDoResumo): ResumoDaBela {
  const hoje = diaEmBrasilia(agora)
  const amanha = somarDias(hoje, 1)
  const quem = primeiroNome(nome)
  const saudacao = `${saudacaoPelaHora(agora)}${quem ? `, ${quem}` : ''}!`

  // Sessões de hoje (ainda não passadas) e de amanhã, a mais próxima primeiro.
  const proximas = sessoes
    .map((s) => ({ ...s, dia: diaEmBrasilia(s.data), semHora: ehDiaSemHoraDaLicitacao(s.data, s.fonte) }))
    .filter((s) => (s.dia === hoje && (s.semHora || s.data.getTime() >= agora.getTime())) || s.dia === amanha)
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, MAXIMO_DE_SESSOES)

  // A validade é um dia de calendário: vale até o fim daquele dia.
  const comDias = documentos
    .map((d) => ({ ...d, dias: diasEntre(hoje, toDia(d.dataValidade)) }))
    .sort((a, b) => a.dias - b.dias)
  const vencidos = comDias.filter((d) => d.dias < 0)
  const vencendo = comDias.filter((d) => d.dias >= 0 && d.dias <= DIAS_PARA_AVISAR_DOCUMENTO)

  const itens: ItemDoResumo[] = []

  if (proximas.length > 0 && vencidos.length > 0) {
    const primeira = proximas[0]
    const quando = primeira.dia === hoje ? 'hoje' : 'amanhã'
    const nomes = vencidos.slice(0, MAXIMO_DE_DOCUMENTOS).map((d) => d.nome)
    const verbo = nomes.length > 1 ? 'venceram' : 'venceu'
    itens.push({
      tipo: 'urgente',
      texto: `Atenção: você tem sessão ${quando}${primeira.semHora ? '' : ` às ${hora(primeira.data)}`} e ${listaEmTexto(nomes)} ${verbo}. Confira se o edital exige e renove antes da sessão.`,
      href: '/empresa',
    })
  }

  for (const s of proximas) {
    const quando = s.dia === hoje ? 'Hoje' : 'Amanhã'
    itens.push({
      tipo: 'sessao',
      texto: `${quando}${s.semHora ? '' : `, às ${hora(s.data)}`}, tem a sessão de: ${encurtar(s.objeto)}.`,
      href: `/tenders/${s.tenderId}`,
    })
  }

  if (vencidos.length > 0 && !(proximas.length > 0)) {
    const nomes = vencidos.slice(0, MAXIMO_DE_DOCUMENTOS).map((d) => d.nome)
    const resto = vencidos.length - nomes.length
    itens.push({
      tipo: 'documento',
      texto: `${listaEmTexto(nomes)}${resto > 0 ? ` e mais ${resto}` : ''} ${vencidos.length > 1 ? 'venceram' : 'venceu'}. Renove para não ficar de fora da próxima licitação.`,
      href: '/empresa',
    })
  }

  for (const d of vencendo.slice(0, MAXIMO_DE_DOCUMENTOS)) {
    const quando = d.dias === 0 ? 'vence hoje' : d.dias === 1 ? 'vence amanhã' : `vence em ${d.dias} dias`
    itens.push({ tipo: 'documento', texto: `${d.nome} ${quando}.`, href: '/empresa' })
  }

  if (novas > 0) {
    itens.push({
      tipo: 'novas',
      texto:
        novas === 1
          ? 'Encontrei 1 licitação nova para a sua empresa que você ainda não viu.'
          : `Encontrei ${novas.toLocaleString('pt-BR')} licitações novas para a sua empresa que você ainda não viu.`,
      href: '/matches',
    })
  } else {
    itens.push({ tipo: 'novas', texto: 'Você já viu todas as licitações que encontrei. Sigo garimpando e aviso quando chegar alguma nova.', href: '/matches' })
  }

  const fala = [`${saudacao} Aqui é a Bela.`, ...itens.map((i) => i.texto)].join(' ')
  return { dia: hoje, saudacao, itens, fala }
}
