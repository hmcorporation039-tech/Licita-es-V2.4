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
