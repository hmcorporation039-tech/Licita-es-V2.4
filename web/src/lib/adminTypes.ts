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
  // Quanto custa analisar e quanto custa revisar, por modelo.
  porEtapa: (UsoDeIaResumo & { etapa: string; provider: string; model: string })[]
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
  CADASTRO_CRIADO: 'Cadastro público criado',
  CADASTRO_RECUSADO: 'Cadastro público recusado (conta ou documento já existe)',
  EMAIL_VERIFICADO: 'E-mail confirmado',
  RECUPERACAO_SOLICITADA: 'Recuperação de senha solicitada',
  SENHA_REDEFINIDA_POR_EMAIL: 'Senha redefinida pelo link do e-mail',
  ADMIN_EMAIL_CONFIRMADO: 'Admin confirmou o e-mail de um usuário',
  EXIGENCIA_ATUALIZADA: 'Exigência da matriz marcada',
}

export interface CriterioDeAderencia {
  id: 'objeto' | 'prazo' | 'valor' | 'localizacao'
  rotulo: string
  pontos: number
  maximo: number
  motivo: string
}

// Nota de aderência (0–100) de um match, com o motivo de cada critério (ver lib/aderencia.ts na API).
export interface Aderencia {
  nota: number
  faixa: 'alta' | 'boa' | 'media' | 'baixa'
  criterios: CriterioDeAderencia[]
}

// ---- Painel do Fiscal: GET /api/tenders/:id/habilitacao ----

export type StatusHabilitacao = 'verde' | 'amarelo' | 'vermelho' | 'cinza'

export interface RequisitoDeHabilitacao {
  id: string
  label: string
  section: string
  origem: 'padrao' | 'edital' | 'a-confirmar' | 'extra'
  status: StatusHabilitacao
  motivo: string
  acao: string | null
  documento: { id: string; nome: string; dataValidade: string | null } | null
  citadoNoEdital: string[]
}

export interface AlertaLegal {
  id: string
  titulo: string
  gravidade: 'alta' | 'media'
  detalhe: string
  fundamento: string
  trecho: string
}

export interface PainelDoFiscal {
  analise: { status: string | null; feita: boolean }
  habilitacao: {
    referencia: { dataSessao: string | null; usouHoje: boolean }
    resumo: Record<StatusHabilitacao, number>
    semPendenciaBloqueante: boolean
    requisitos: RequisitoDeHabilitacao[]
  }
  alertas: { disponivel: boolean; itens: AlertaLegal[]; aviso: string }
  prazos: { dataSessao: string; limiteImpugnacao: string; limitePassou: boolean; sessaoPassou: boolean; diasUteisAteLimite: number } | null
}

// ---- Análise em dupla (analista + revisor) e matriz de exigências ----

export interface AlteracaoDaRevisao {
  campo: string
  tipo: 'alterado' | 'adicionado' | 'removido'
  antes: string | null
  depois: string | null
  motivo: string | null
}

export interface RevisaoDaAnalise {
  status: 'OK' | 'FALHOU' | 'NAO_EXECUTADA' | 'EM_ANDAMENTO'
  veredito: 'aprovada' | 'corrigida' | 'reprovada' | null
  resumo: string | null
  alteracoes: AlteracaoDaRevisao[]
  totalDeAlteracoes: number
  analista: { provider: string; model: string } | null
  revisor: { provider: string; model: string } | null
  motivo: string | null
  // Quando a revisão foi tentada (ISO) — distingue análise nova de antiga.
  em?: string
  // Só o administrador recebe.
  detalheTecnico?: string | null
}

export type StatusDaVerificacao = 'confirmado' | 'parcial' | 'nao-localizado' | 'nao-verificavel'

export interface ExigenciaDaMatriz {
  chave: string
  texto: string
  categoria: 'juridica' | 'fiscal' | 'economica' | 'tecnica' | 'proposta' | 'outra'
  documento: string
  pagina: string
  item: string
  responsavel: 'fiscal' | 'calculista' | 'redator'
  atendida: boolean
  nota: string | null
  verificacao?: { status: StatusDaVerificacao; paginaConfirmada: string | null; documentoConfirmado: string | null }
}

export interface MatrizResposta {
  disponivel: boolean
  motivo?: string
  pipeline?: string | null
  itens?: ExigenciaDaMatriz[]
  resumo?: { total: number; atendidas: number; verificacao: Record<StatusDaVerificacao, number> }
}
