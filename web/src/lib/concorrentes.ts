import { api, baixarArquivoPost, enviarArquivo } from './api'
import type { DocumentoDaLicitacao, PreviaDoDocumento } from './types'

export type StatusDaAnalise = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'NO_DOCUMENTS' | 'DISABLED'
export type SituacaoDoAchado = 'atende' | 'nao_atende' | 'nao_comprovado' | 'indefinido'
export type StatusDaVerificacao = 'confirmado' | 'parcial' | 'nao-localizado' | 'nao-verificavel'

export interface ArquivoDoConcorrente {
  id: string
  nomeArquivo: string
  tamanho: number
}

export interface AchadoDeHabilitacao {
  exigencia: string
  categoria: string
  situacao: SituacaoDoAchado
  explicacao: string
  trecho: string
  documento: string
  gravidade: 'alta' | 'media' | 'baixa'
  verificacao: { status: StatusDaVerificacao; paginaConfirmada: string | null; documentoConfirmado: string | null }
}

export interface ResultadoDaAnalise {
  resumo: string
  recomendacao: string
  achados: AchadoDeHabilitacao[]
}

export interface AnaliseDeConcorrente {
  id: string
  tenderId: string
  nomeConcorrente: string | null
  status: StatusDaAnalise
  erro: string | null
  resultado: ResultadoDaAnalise | null
  arquivos: ArquivoDoConcorrente[]
  criadaEm: string
  atualizadaEm: string
}

export const listarConcorrentes = (tenderId: string) => api.get<AnaliseDeConcorrente[]>(`/api/concorrentes?tenderId=${encodeURIComponent(tenderId)}`)
export const criarConcorrente = (tenderId: string, nomeConcorrente: string | null) => api.post<AnaliseDeConcorrente>('/api/concorrentes', { tenderId, nomeConcorrente })
export const obterConcorrente = (id: string) => api.get<AnaliseDeConcorrente>(`/api/concorrentes/${id}`)
export const removerConcorrente = (id: string) => api.delete<void>(`/api/concorrentes/${id}`)
export const enviarDocumentoDoConcorrente = (id: string, arquivo: File) => enviarArquivo<AnaliseDeConcorrente>(`/api/concorrentes/${id}/arquivos`, arquivo, { metodo: 'POST' })
export const analisarConcorrente = (id: string) => api.post<AnaliseDeConcorrente>(`/api/concorrentes/${id}/analisar`)
export const previaDoRecurso = (id: string) => api.post<PreviaDoDocumento>(`/api/concorrentes/${id}/recurso/previa`)
export const baixarRecurso = (id: string, formato: 'pdf' | 'docx', documento: DocumentoDaLicitacao, nome: string) =>
  baixarArquivoPost(`/api/concorrentes/${id}/recurso/arquivo`, { formato, documento }, nome)
