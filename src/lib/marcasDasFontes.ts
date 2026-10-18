import type { FonteEnum } from '@prisma/client'

export const MARCAS_DAS_FONTES = [
  'PNCP',
  'SESC',
  'SENAI',
  'SESI',
  'SENAC',
  'SEST SENAT',
  'Querido Diário',
  'Novacap',
  'FIEG',
  'Infraero',
  'Diários municipais',
  'TCE-CE',
  'TCE-PI',
] as const

export type MarcaDaFonte = (typeof MARCAS_DAS_FONTES)[number]

const MARCA_DA_FONTE: Record<FonteEnum, MarcaDaFonte | null> = {
  PNCP: 'PNCP',
  COMPRASNET: null,
  NOVACAP: 'Novacap',
  FIEG: 'FIEG',
  SESC_GO: 'SESC',
  SEST_SENAT: 'SEST SENAT',
  SESC_REGIONAL: 'SESC',
  QUERIDO_DIARIO: 'Querido Diário',
  SISTEMA_S: null,
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diários municipais',
  TCE_CE: 'TCE-CE',
  TCE_PI: 'TCE-PI',
}

const MARCAS_DO_SISTEMA_S: MarcaDaFonte[] = ['SENAI', 'SESI', 'SENAC']

export function marcasDoRegistro(fonte: FonteEnum, orgao: string | null | undefined): MarcaDaFonte[] {
  const marca = MARCA_DA_FONTE[fonte]
  if (marca) return [marca]
  if (fonte !== 'SISTEMA_S') return []
  const siglas = (orgao ?? '').toUpperCase().split(/[^A-Z]+/)
  return MARCAS_DO_SISTEMA_S.filter((m) => siglas.includes(m))
}

export function marcasComLicitacao(grupos: { fonte: FonteEnum; orgao: string | null }[]): MarcaDaFonte[] {
  const presentes = new Set(grupos.flatMap((g) => marcasDoRegistro(g.fonte, g.orgao)))
  return MARCAS_DAS_FONTES.filter((m) => presentes.has(m))
}
