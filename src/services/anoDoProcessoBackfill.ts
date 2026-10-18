import { prisma } from './tenderService'
import { FONTES_COM_ANO_NO_NUMERO, anoDoProcesso } from '../lib/anoDoProcesso'

const TAMANHO_DO_LOTE = 500

export async function preencherAnoDoProcesso(agora: Date = new Date()): Promise<number> {
  let ultimoId: string | undefined
  let preenchidos = 0
  for (;;) {
    const lote = await prisma.tender.findMany({
      where: { fonte: { in: FONTES_COM_ANO_NO_NUMERO }, anoDoProcesso: null, numeroControle: { not: null }, ...(ultimoId ? { id: { gt: ultimoId } } : {}) },
      select: { id: true, fonte: true, numeroControle: true },
      orderBy: { id: 'asc' },
      take: TAMANHO_DO_LOTE,
    })
    if (lote.length === 0) return preenchidos
    ultimoId = lote[lote.length - 1].id

    const idsPorAno = new Map<number, string[]>()
    for (const tender of lote) {
      const ano = anoDoProcesso(tender.fonte, tender.numeroControle, agora)
      if (ano !== null) idsPorAno.set(ano, [...(idsPorAno.get(ano) ?? []), tender.id])
    }
    for (const [ano, ids] of idsPorAno) {
      const { count } = await prisma.tender.updateMany({ where: { id: { in: ids }, anoDoProcesso: null }, data: { anoDoProcesso: ano } })
      preenchidos += count
    }
  }
}
