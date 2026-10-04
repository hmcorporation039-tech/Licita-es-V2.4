import type { EditalAnalysisResult, ExigenciaDoEdital } from '../../src/services/llm/types'

export function exigencia(texto: string, extra: Partial<ExigenciaDoEdital> = {}): ExigenciaDoEdital {
  return { texto, categoria: 'tecnica', documento: 'Edital.pdf', pagina: '2', item: '10.3.2', responsavel: 'fiscal', ...extra }
}

export function analiseBase(extra: Partial<EditalAnalysisResult> = {}): EditalAnalysisResult {
  return {
    resumo: 'Aquisição de equipamentos de informática.',
    valorEstimado: 'R$ 1.000.000,00',
    dataSessao: '10/11/2026 09:00',
    registroPrecos: 'Não',
    prazoEntrega: '30 dias',
    local: 'Brasília/DF',
    pagamento: '30 dias após a entrega',
    criterioJulgamento: 'Menor preço',
    adesaoAta: 'Não se aplica',
    prazoImpugnacao: 'até 3 dias úteis antes da abertura',
    prazoEsclarecimento: 'até 3 dias úteis antes da abertura',
    garantiaProposta: 'não exigida',
    garantiaContratual: 'não exigida',
    patrimonioLiquidoMinimo: 'não exigido',
    visitaTecnica: 'não exigida',
    exigenciasTecnicas: ['Atestado de capacidade técnica'],
    documentosExigidos: ['Atestado de capacidade técnica'],
    matrizExigencias: [exigencia('A licitante deverá apresentar atestado de capacidade técnica')],
    riscos: [],
    ...extra,
  }
}
