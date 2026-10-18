const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])
const FONTES_COM_SESSAO_NA_ABERTURA = new Set(['FIEG', 'SESC_REGIONAL', 'QUERIDO_DIARIO', 'SISTEMA_S', 'INFRAERO', 'DIARIO_MUNICIPAL', 'TCE_CE'])

export interface DatasDaLicitacao {
  fonte: string
  aberturaAt: Date | null
  encerramentoAt: Date | null
}

export function aberturaEhInicioDasPropostas(fonte: string): boolean {
  return FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(fonte)
}

export function dataDaSessao(tender: DatasDaLicitacao): Date | null {
  if (aberturaEhInicioDasPropostas(tender.fonte)) return tender.encerramentoAt
  if (FONTES_COM_SESSAO_NA_ABERTURA.has(tender.fonte)) return tender.aberturaAt ?? tender.encerramentoAt
  return tender.encerramentoAt ?? tender.aberturaAt
}
