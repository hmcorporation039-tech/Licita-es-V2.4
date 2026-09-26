// ============================================================
// types/index.ts — Tipos compartilhados da plataforma
// ============================================================

export type FonteEnum = 'PNCP' | 'COMPRASNET'

export type ModalidadeEnum =
  | 'PREGAO_ELETRONICO'
  | 'PREGAO_PRESENCIAL'
  | 'CONCORRENCIA'
  | 'DISPENSA_COM_DISPUTA'
  | 'DISPENSA_SEM_DISPUTA'
  | 'INEXIGIBILIDADE'
  | 'CONVITE'
  | 'TOMADA_DE_PRECOS'
  | 'CONCURSO'
  | 'CREDENCIAMENTO'
  | 'DIALOGO_COMPETITIVO'
  | 'OUTROS'

// Mapeamento dos códigos de modalidade do PNCP (codigoModalidadeContratacao)
// Confirmado empiricamente contra a API real em 2026-08-10 (ver tabela de domínio
// "Modalidade de Contratação" do Manual de Integração PNCP). O mapeamento anterior
// estava incorreto (ex: código 1 não é Pregão Eletrônico, é Leilão).
export const PNCP_MODALIDADE_MAP: Record<number, ModalidadeEnum> = {
  1:  'OUTROS',              // Leilão - Eletrônico
  2:  'DIALOGO_COMPETITIVO',
  3:  'CONCURSO',
  4:  'CONCORRENCIA',        // Concorrência - Eletrônica
  5:  'CONCORRENCIA',        // Concorrência - Presencial
  6:  'PREGAO_ELETRONICO',   // confirmado via API
  7:  'PREGAO_PRESENCIAL',
  8:  'DISPENSA_SEM_DISPUTA', // "Dispensa" — confirmado via API; PNCP não distingue com/sem disputa neste campo
  9:  'INEXIGIBILIDADE',     // confirmado via API
  10: 'OUTROS',              // Manifestação de Interesse
  11: 'OUTROS',              // Pré-qualificação
  12: 'CREDENCIAMENTO',
  13: 'OUTROS',              // Leilão - Presencial
}

// Mapeamento dos códigos de modalidade do ComprasNet (módulo legado, Lei 8.666/10.520)
// Confirmado empiricamente contra a API real em 2026-08-10.
// Códigos 1-5 vêm de /modulo-legado/1_consultarLicitacao (licitação competitiva).
// Códigos 6-7 vêm de /modulo-legado/5_consultarComprasSemLicitacao (compra sem
// licitação) — confirmados cruzando co_modalidade_licitacao com o artigo de lei
// citado em ds_fundamento_legal (Art. 24/75 = dispensa, Art. 25/74 = inexigibilidade).
// Os dois endpoints não compartilham essa faixa de códigos, então é seguro usar
// o mesmo mapa para ambos.
export const COMPRASNET_MODALIDADE_MAP: Record<string, ModalidadeEnum> = {
  '1':  'CONVITE',
  '2':  'TOMADA_DE_PRECOS',
  '3':  'CONCORRENCIA',
  '4':  'CONCURSO',
  '5':  'PREGAO_ELETRONICO', // modalidade 5 cobre eletrônico e presencial — desambiguado pelo campo tipo_pregao no parser
  '6':  'DISPENSA_SEM_DISPUTA',
  '7':  'INEXIGIBILIDADE',
  '99': 'OUTROS',            // RDC (Regime Diferenciado de Contratações)
}

// Schema normalizado de licitação (output do Parser)
export interface NormalizedTender {
  fonte: FonteEnum
  fonteId: string
  modalidade: ModalidadeEnum
  objeto: string
  objetoResumido?: string
  valorEstimado?: number
  uf?: string
  municipio?: string
  municipioIbge?: string
  municipioLat?: number
  municipioLng?: number
  orgao?: string
  orgaoCnpj?: string
  unidade?: string
  aberturaAt?: Date
  encerramentoAt?: Date
  publicadoAt?: Date
  linkEdital?: string
  numeroControle?: string
  rawJson: Record<string, unknown>
  items?: NormalizedTenderItem[]
}

export interface NormalizedTenderItem {
  numeroItem?: number
  descricao: string
  catmatCode?: string
  catserCode?: string
  unidadeMedida?: string
  quantidade?: number
  valorUnitario?: number
  valorTotal?: number
}

// Payload dos jobs da fila
// dataInicial/dataFinal são opcionais de propósito: o agendador periódico não
// as envia (senão ficariam congeladas na primeira execução) e o worker resolve
// a janela no momento da execução. Só backfill manual e testes as informam.
export interface ColetorJobPayload {
  fonte: FonteEnum
  dataInicial?: string  // 'YYYY-MM-DD'
  dataFinal?: string
  uf?: string
  pagina?: number
  modalidadeCodigo?: number
}

export interface MatcherJobPayload {
  tenderId: string
}

export interface AnaliseJobPayload {
  tenderId: string
}

// Jobs de match antigos, já enfileirados no Redis, não têm o campo `tipo` —
// o worker discrimina pela presença de tenderMatchId, não por ele.
export interface NotificadorMatchPayload {
  tipo?: 'match'
  tenderMatchId: string
}

export interface NotificadorAlteracaoPayload {
  tipo: 'alteracao'
  tenderId: string
  userId: string
  campos: string[]
}

export type NotificadorJobPayload = NotificadorMatchPayload | NotificadorAlteracaoPayload
