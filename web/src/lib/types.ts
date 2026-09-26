// ============================================================
// lib/types.ts — Tipos espelhando as respostas da API
// ============================================================

export interface User {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  active: boolean
  accessExpiresAt: string | null
  createdAt: string
  hasPassword: boolean
}

export interface MonitoredItem {
  id: string
  userId: string
  name: string
  keywords: string[]
  catmatCodes: string[]
  catserCodes: string[]
  ufs: string[]
  valorMin: string | null
  valorMax: string | null
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  active: boolean
  raioKm: number | null
  origemMunicipio: string | null
  origemUf: string | null
  createdAt: string
}

export interface UasgResult {
  codigoUasg: string
  nomeUasg: string
  nomeOrgao: string | null
  siglaUf: string | null
  municipioNome: string | null
}

export interface TenderItem {
  id: string
  numeroItem: number | null
  descricao: string
  catmatCode: string | null
  catserCode: string | null
  unidadeMedida: string | null
  quantidade: string | null
  valorUnitario: string | null
  valorTotal: string | null
}

export interface TenderMatchInfo {
  score: number
  classificacao: 'exata' | 'alta' | 'media'
  itensRelacionados: string[]
  palavrasChave: string[]
}

export interface Tender {
  id: string
  fonte: 'PNCP' | 'COMPRASNET'
  modalidade: string
  situacao: string
  objeto: string
  objetoResumido: string | null
  valorEstimado: string | null
  uf: string | null
  municipio: string | null
  orgao: string | null
  numeroControle: string | null
  aberturaAt: string | null
  publicadoAt: string | null
  linkEdital: string | null
  createdAt: string
  items?: TenderItem[]
  match?: TenderMatchInfo
}

export interface TenderMatch {
  id: string
  tenderId: string
  monitoredItemId: string
  userId: string
  score: number
  matchedKeywords: string[]
  read: boolean
  createdAt: string
  tender: Tender
  monitoredItem: MonitoredItem
}

export interface DashboardData {
  itensMonitoradosAtivos: number
  matchesNaoLidos: number
  matchesTotal: number
  ultimosMatches: TenderMatch[]
  documentosVencendoEmBreve: { id: string; nome: string; dataValidade: string }[]
  proximosPrazos: { tenderId: string; tenderObjeto: string; label: string; date: string }[]
}

export interface CompanyDocument {
  id: string
  userId: string
  tipo: string | null
  nome: string
  dataEmissao: string | null
  dataValidade: string | null
  observacao: string | null
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ChecklistItem {
  id: string
  section: string
  label: string
  hint?: string
  checked: boolean
  custom: boolean
}

export interface TenderChecklist {
  id: string
  userId: string
  tenderId: string
  items: ChecklistItem[]
}

export type ParticipationStatus = 'AVALIANDO' | 'VOU_PARTICIPAR' | 'NAO_VOU_PARTICIPAR' | 'PARTICIPEI'

export interface PlanMilestone {
  id: string
  label: string
  date: string | null
  detalhe: string | null
  done: boolean
  custom: boolean
}

export interface ParticipationPlan {
  status: ParticipationStatus
  milestones: PlanMilestone[]
}

export interface ParticipationPlanListItem {
  id: string
  tenderId: string
  status: ParticipationStatus
  updatedAt: string
  tender: Tender
}

export type AnalysisStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'NO_DOCUMENTS' | 'DISABLED'

export interface AnalysisRisco {
  titulo: string
  descricao: string
  severidade: 'alta' | 'media' | 'baixa'
}

export interface AnalysisResultado {
  resumo: string
  valorEstimado: string
  prazoEntrega: string
  criterioJulgamento: string
  prazoImpugnacao: string
  prazoEsclarecimento: string
  exigenciasTecnicas: string[]
  documentosExigidos: string[]
  riscos: AnalysisRisco[]
}

export interface TenderAnalysis {
  id: string
  tenderId: string
  status: AnalysisStatus
  documentoNome: string | null
  resultado: AnalysisResultado | null
  errorMsg: string | null
}
