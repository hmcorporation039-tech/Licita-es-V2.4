// ============================================================
// lib/tenderPublico.ts — Campos da licitação que podem ir ao cliente. O `rawJson` (payload bruto
// do PNCP e dos portais) é interno: pesado, sem uso no site e expõe a estrutura dos coletores.
// ============================================================

import { Prisma } from '@prisma/client'

type CampoPublico = Exclude<keyof typeof Prisma.TenderScalarFieldEnum, 'rawJson'>

// Use em `select: TENDER_PUBLICO` (ou `tender: { select: TENDER_PUBLICO }`).
export const TENDER_PUBLICO = Object.fromEntries(
  Object.keys(Prisma.TenderScalarFieldEnum)
    .filter((campo) => campo !== 'rawJson')
    .map((campo) => [campo, true])
) as { [K in CampoPublico]: true }

// Para quem já carregou a linha inteira (ex.: precisa do rawJson no servidor) e vai responder.
export function semRawJson<T extends { rawJson?: unknown }>(tender: T): Omit<T, 'rawJson'> {
  const { rawJson: _interno, ...publico } = tender
  void _interno
  return publico
}
