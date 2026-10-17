// ============================================================
// lib/types.ts — Tipos espelhando as respostas da API
// ============================================================
import type { Aderencia, RevisaoDaAnalise } from './adminTypes'


export interface User {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
}

export type CompanyType = 'PESSOA_FISICA' | 'PESSOA_JURIDICA'
export type CompanyRole = 'OWNER' | 'MEMBER'

export interface CompanyMember {
  id: string
  email: string
  name: string | null
  companyRole: CompanyRole
  active: boolean
  createdAt: string
}

export interface Company {
  id: string
  tipo: CompanyType
  name: string
  cnpj: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  responsavel: string | null
  endereco: string | null
  cep: string | null
  enderecoNumero?: string | null
  enderecoComplemento?: string | null
  enderecoBairro?: string | null
  enderecoCidade?: string | null
  enderecoUf?: string | null
  baseMunicipio?: string | null
  baseUf?: string | null
  responsavelCpf?: string | null
  responsavelCargo?: string | null
  dadosBancarios?: string | null
  logo?: LogoDaEmpresa | null
  users: CompanyMember[]
}

export interface LogoDaEmpresa {
  mimeType: string
  tamanho: number
  updatedAt: string
}

export type TipoDeDocumentoDaLicitacao = 'proposta' | 'declaracoes' | 'impugnacao' | 'esclarecimento'

export type BlocoDoDocumento =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'tabela'; colunas: string[]; linhas: string[][]; rodape?: string[]; alinharDireita?: number[] }
  | { tipo: 'assinatura'; local: string }
  | { tipo: 'quebra' }

export interface DocumentoDaLicitacao {
  tipo: TipoDeDocumentoDaLicitacao
  titulo: string
  blocos: BlocoDoDocumento[]
}

export interface AlertaParaImpugnar {
  chave: string
  titulo: string
  gravidade: 'alta' | 'media'
  local: string | null
}

export interface ModelosDeDocumento {
  impugnacao: { analiseFeita: boolean; prazo: { limite: string; passou: boolean } | null; alertas: AlertaParaImpugnar[] }
  proposta: { disponivel: boolean; motivo?: string }
  declaracoes: Array<{ id: string; titulo: string; fundamento: string }>
}

export interface PreviaDoDocumento {
  documento: DocumentoDaLicitacao
  pendencias: string[]
  total?: number
  temLogo: boolean
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
  emailConfirmado: boolean
}

export interface MonitoredItem {
  id: string
  userId: string
  name: string
  keywords: string[]
  palavrasDeExclusao?: string[]
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
  descricaoDetalhada: string | null
  criterioJulgamento: string | null
  catmatCode: string | null
  catserCode: string | null
  unidadeMedida: string | null
  quantidade: string | null
  valorUnitario: string | null
  valorTotal: string | null
}

export interface CatalogResult {
  codigo: string
  descricao: string
  grupo: string | null
  classe: string | null
}

export interface TenderMatchInfo {
  score: number
  classificacao: 'exata' | 'alta' | 'media'
  itensRelacionados: string[]
  palavrasChave: string[]
  dentroDeObraCompleta?: boolean
}

export interface Tender {
  id: string
  fonte: 'PNCP' | 'COMPRASNET' | 'NOVACAP' | 'FIEG' | 'SESC_GO' | 'SEST_SENAT' | 'SESC_REGIONAL' | 'QUERIDO_DIARIO' | 'SISTEMA_S'
  modalidade: string
  situacao: string
  objeto: string
  objetoResumido: string | null
  valorEstimado: string | null
  valorHomologado: string | null
  srp: boolean | null
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
  dentroDeObraCompleta?: boolean
  read: boolean
  createdAt: string
  tender: Tender
  monitoredItem: MonitoredItem
  // Nota de aderência calculada ao vivo pela API.
  aderencia: Aderencia
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
  arquivo?: ArquivoDoDocumento | null
}

export interface ArquivoDoDocumento {
  nomeArquivo: string
  mimeType: string
  tamanho: number
  updatedAt: string
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
  dataSessao: string
  registroPrecos: string
  prazoEntrega: string
  local: string
  pagamento: string
  criterioJulgamento: string
  adesaoAta: string
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
  // 'dupla' (Gemini analisa, Claude revisa), 'gemini' ou 'claude'.
  pipeline?: string | null
  revisao?: RevisaoDaAnalise | null
  // Só o administrador recebe o rascunho do analista (para auditar).
  rascunho?: AnalysisResultado | null
  errorMsg: string | null
}

export type ModalidadeFalada = 'PREGAO_ELETRONICO' | 'PREGAO_PRESENCIAL' | 'CONCORRENCIA' | 'DISPENSA_COM_DISPUTA' | 'INEXIGIBILIDADE' | 'CREDENCIAMENTO'

export interface FiltrosDaBela {
  q?: string
  uf?: string
  ufs?: string[]
  rotuloDoLocal?: string
  municipio?: string
  modalidade?: ModalidadeFalada
  situacao?: 'ABERTA'
}

export type ContextoDaBela = 'busca' | 'pregao'

export type PedidoDaBela =
  | { acao: 'buscar'; filtros: FiltrosDaBela; resumo: string }
  | { acao: 'lance'; valor: number; item: number | null; resumo: string }
  | { acao: 'desconhecida'; resumo: string }

export type FaixaDoLance = 'verde' | 'amarela' | 'vermelha'
export type CriterioDoPregao = 'UNITARIO' | 'TOTAL_DO_ITEM'
export type ResultadoDoPregao = 'GANHOU' | 'PERDEU' | 'DESCLASSIFICADO' | 'FRACASSADO'
export type OrigemDoLance = 'MELHOR_LANCE' | 'MEU_LANCE'

export interface AvaliacaoDoLance {
  valor: number
  lucro: number
  margemPct: number
  faixa: FaixaDoLance
  minimoComMargem: number | null
  equilibrio: number | null
  sugestao: { valor: number; margemPct: number; ultimo: boolean } | null
  lancesRestantes: number
  mensagem: string
}

export interface AlvoDoPregao {
  id: string
  rotulo: string
  numero: number | null
  quantidade: number
  precoProposto: number | null
  custo: number
  minimoComMargem: number | null
  equilibrio: number | null
  meusLances: number
  avaliacao: AvaliacaoDoLance | null
}

export interface LanceDoPregao {
  id: string
  alvo: string
  origem: OrigemDoLance
  valor: number
  margemPct: number | null
  createdAt: string
}

export interface ConfigDoPregao {
  decrementoPct: number
  maxLances: number
  criterio: CriterioDoPregao
  resultado: ResultadoDoPregao | null
  valorFinal: number | null
  encerradoEm: string | null
}

export interface PainelDoPregao {
  tender: { id: string; orgao: string | null; numeroControle: string | null; objeto: string }
  semCustos: boolean
  impostosPct: number
  margemDesejadaPct: number
  config: ConfigDoPregao
  alvos: AlvoDoPregao[]
  lances: LanceDoPregao[]
}
