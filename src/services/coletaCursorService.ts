// ============================================================
// services/coletaCursorService.ts — Última publicação já coletada por
// fonte, usada para a coleta se recuperar sozinha depois de uma parada.
// ============================================================

import { prisma } from './tenderService'
import { FonteEnum } from '../types'

export async function ultimaPublicacaoColetada(fonte: FonteEnum): Promise<Date | null> {
  const resultado = await prisma.tender.aggregate({
    where: { fonte },
    _max: { publicadoAt: true },
  })
  return resultado._max.publicadoAt ?? null
}

export async function maiorIdColetado(fonte: FonteEnum, prefixo: string): Promise<number | null> {
  const registros = await prisma.tender.findMany({
    where: { fonte, fonteId: { startsWith: prefixo } },
    select: { fonteId: true },
  })
  return registros.reduce<number | null>((maior, { fonteId }) => {
    const id = Number(fonteId.slice(prefixo.length))
    return Number.isSafeInteger(id) && id > 0 && (maior === null || id > maior) ? id : maior
  }, null)
}
