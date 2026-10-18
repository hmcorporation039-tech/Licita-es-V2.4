export const ROTULOS_DE_FONTE: Record<string, string> = {
  QUERIDO_DIARIO: 'Diário oficial (Querido Diário)',
  SISTEMA_S: 'Sistema S (SENAI/SESI/SENAC)',
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diários municipais (associações)',
  TCE_CE: 'TCE-CE (municípios do Ceará)',
  TCE_PI: 'TCE-PI (municípios do Piauí)',
  TCE_TO: 'TCE-TO (municípios do Tocantins)',
}

export function fontesComLicitacaoAberta(fontesNaApi: number | null | undefined, fontesNaFaixa: number): number | null {
  if (typeof fontesNaApi !== 'number' || !Number.isFinite(fontesNaApi) || fontesNaApi < 1) return null
  return Math.min(Math.floor(fontesNaApi), fontesNaFaixa)
}

export function fontesNaFaixa<T extends { nome: string }>(fontes: T[], marcasComLicitacao: unknown): T[] {
  if (!Array.isArray(marcasComLicitacao) || marcasComLicitacao.length === 0) return fontes
  const presentes = new Set(marcasComLicitacao.filter((m): m is string => typeof m === 'string'))
  const filtradas = fontes.filter((f) => presentes.has(f.nome))
  return filtradas.length > 0 ? filtradas : fontes
}
