import { prisma } from './tenderService'
import { SestSenatEmpresa, empresaPorCnpjSestSenat, fonteIdSestSenat } from './sestSenatParser'

export interface ResultadoMigracaoFonteId {
  renomeados: number
  conflitos: number
}

export async function migrarFonteIdsLegadosSestSenat(): Promise<ResultadoMigracaoFonteId> {
  const registros = await prisma.tender.findMany({
    where: { fonte: 'SEST_SENAT' },
    select: { id: true, fonteId: true, unidade: true, numeroControle: true, orgaoCnpj: true },
  })

  const existentes = new Set(registros.map((r) => r.fonteId))
  let renomeados = 0
  let conflitos = 0

  for (const registro of registros) {
    const empresa: SestSenatEmpresa | null = empresaPorCnpjSestSenat(registro.orgaoCnpj)
    if (!empresa || !registro.numeroControle) continue

    const fonteIdNovo = fonteIdSestSenat(empresa, registro.unidade, registro.numeroControle)
    if (fonteIdNovo === registro.fonteId) continue

    if (existentes.has(fonteIdNovo)) {
      conflitos++
      continue
    }

    await prisma.tender.update({ where: { id: registro.id }, data: { fonteId: fonteIdNovo } })
    existentes.delete(registro.fonteId)
    existentes.add(fonteIdNovo)
    renomeados++
  }

  return { renomeados, conflitos }
}
