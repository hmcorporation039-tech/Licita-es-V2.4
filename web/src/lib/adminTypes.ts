// Tipos das respostas do painel do administrador (/api/admin/*) e do uso do plano.

export interface Limites {
  itensMonitorados: number | null
  usuarios: number | null
  analisesIaMes: number | null
}

export interface RecursoDoPlano {
  recurso: keyof Limites
  rotulo: string
  usado: number
  limite: number | null
  excedido: boolean
}

export interface ResumoDeCotas {
  plano: { codigo: string; nome: string }
  recursos: RecursoDoPlano[]
}

export interface UsoDeIaResumo {
  chamadas: number
  tokensEntrada: number
  tokensSaida: number
  custoEstimadoUsd: number
}

export interface Overview {
  empresas: number
  usuarios: number
  usuariosAtivos: number
  licitacoes: number
  itensMonitorados: number
  documentosNoCofre: number
  analises: Record<string, number>
  iaNoMes: UsoDeIaResumo
  eventosDeAuditoriaUltimas24h: number
}

export interface EmpresaResumo {
  id: string
  nome: string
  tipo: string
  cnpj: string | null
  cpf: string | null
  email: string | null
  planCode: string
  quotaOverrides: Partial<Limites> | null
  criadaEm: string
  usuarios: number
  itensMonitorados: number
  documentos: number
  planosDeParticipacao: number
  analisesIaNoMes: number
}

export interface EventoAuditoria {
  id: string
  actorUserId: string | null
  actorEmail: string | null
  companyId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

export interface PlanoComercial {
  code: string
  name: string
  description: string | null
  limits: Limites
  sortOrder: number
  active: boolean
  priceMonthlyCents: number | null
  priceYearlyCents: number | null
  empresas: number
}

export interface DetalheEmpresa {
  empresa: { id: string; name: string; tipo: string; cnpj: string | null; cpf: string | null; email: string | null; telefone: string | null; responsavel: string | null; planCode: string; quotaOverrides: Partial<Limites> | null; createdAt: string }
  usuarios: { id: string; email: string; name: string | null; companyRole: string; isAdmin: boolean; active: boolean; disabledByAdmin: boolean; accessExpiresAt: string | null; createdAt: string }[]
  itensMonitorados: { id: string; name: string; active: boolean; ufs: string[]; keywords: string[]; catmatCodes: string[]; catserCodes: string[]; createdAt: string }[]
  documentos: { id: string; nome: string; tipo: string | null; dataEmissao: string | null; dataValidade: string | null }[]
  planosDeParticipacao: { tenderId: string; status: string; updatedAt: string; tender: { objeto: string; orgao: string | null; aberturaAt: string | null } }[]
  matches: number
  cotas: ResumoDeCotas
  iaAcumulada: UsoDeIaResumo
  auditoriaRecente: EventoAuditoria[]
}

export interface UsoIaResposta {
  periodo: { de: string; ate: string | null }
  total: UsoDeIaResumo
  porEmpresa: (UsoDeIaResumo & { companyId: string | null; empresa: string; planCode: string | null })[]
  porMes: ({ mes: string } & UsoDeIaResumo)[]
  recentes: { id: string; tenderId: string | null; companyId: string | null; provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: string | null; status: string; createdAt: string }[]
  aviso: string
}

export interface PrazosDaSessao {
  disponivel: boolean
  motivo?: string
  origem?: 'abertura' | 'analise-ia'
  dataSessao?: string
  limiteImpugnacao?: string
  limiteEsclarecimento?: string
  diasUteisAteSessao?: number
  diasUteisAteLimite?: number
  limitePassou?: boolean
  sessaoPassou?: boolean
  aviso?: string
}

export const ROTULO_ACAO: Record<string, string> = {
  LOGIN_OK: 'Login',
  LOGIN_FALHA: 'Falha de login',
  LOGOUT: 'Logout',
  SENHA_ALTERADA: 'Senha alterada',
  USUARIO_CRIADO: 'Usuário criado (admin)',
  USUARIO_ALTERADO: 'Usuário alterado (admin)',
  SENHA_REDEFINIDA_ADMIN: 'Senha redefinida (admin)',
  MEMBRO_CRIADO: 'Membro convidado',
  MEMBRO_ALTERADO: 'Membro alterado',
  EMPRESA_ALTERADA: 'Dados da empresa alterados',
  ITEM_MONITORADO_CRIADO: 'Item monitorado criado',
  ITEM_MONITORADO_ALTERADO: 'Item monitorado alterado',
  ITEM_MONITORADO_REMOVIDO: 'Item monitorado removido',
  DOCUMENTO_CRIADO: 'Documento criado',
  DOCUMENTO_ALTERADO: 'Documento alterado',
  DOCUMENTO_REMOVIDO: 'Documento removido',
  ANALISE_SOLICITADA: 'Análise de IA solicitada',
  PARTICIPACAO_STATUS: 'Decisão de participação',
  PLANO_EMPRESA_ALTERADO: 'Plano da empresa alterado',
  PLANO_ALTERADO: 'Plano comercial alterado',
  ADMIN_CONSULTOU_EMPRESA: 'Admin consultou empresa',
  ADMIN_EXPORTOU_AUDITORIA: 'Admin exportou auditoria',
  COTA_EXCEDIDA: 'Limite do plano atingido',
}
