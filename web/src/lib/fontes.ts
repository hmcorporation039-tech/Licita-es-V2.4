export const ROTULOS_DE_FONTE: Record<string, string> = {
  QUERIDO_DIARIO: 'Diário oficial (Querido Diário)',
  SISTEMA_S: 'Sistema S (SENAI/SESI/SENAC)',
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diários municipais (associações)',
  TCE_CE: 'TCE-CE (municípios do Ceará)',
}

export function fontesComLicitacaoAberta(fontesNaApi: number | null | undefined, fontesNaFaixa: number): number | null {
  if (typeof fontesNaApi !== 'number' || !Number.isFinite(fontesNaApi) || fontesNaApi < 1) return null
  return Math.min(Math.floor(fontesNaApi), fontesNaFaixa)
}
