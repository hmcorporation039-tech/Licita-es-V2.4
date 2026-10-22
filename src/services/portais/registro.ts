import { comprasGovBrAdapter } from './comprasGovBr'
import type { AdaptadorDePortal } from './tipos'

const ADAPTADORES: Record<string, AdaptadorDePortal> = {
  [comprasGovBrAdapter.portalId]: comprasGovBrAdapter,
}

export function adaptadorDe(portalId: string): AdaptadorDePortal | null {
  return ADAPTADORES[portalId] ?? null
}

export function portaisComAdaptador(): string[] {
  return Object.keys(ADAPTADORES)
}
