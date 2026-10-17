import { prisma } from './tenderService'
import { whereLicitacaoAberta } from '../lib/licitacaoAberta'

export interface CoberturaDaUf {
  uf: string
  municipios: number
}

export interface CoberturaMunicipal {
  totalDeMunicipios: number
  porUf: CoberturaDaUf[]
}

export async function municipiosComLicitacaoAbertaPorUf(agora: Date = new Date()): Promise<CoberturaMunicipal> {
  const grupos = await prisma.tender.groupBy({
    by: ['uf', 'municipioIbge'],
    where: { AND: [whereLicitacaoAberta(agora), { municipioIbge: { not: null } }] },
  })

  const porUf = new Map<string, number>()
  const municipios = new Set<string>()
  for (const grupo of grupos) {
    if (!grupo.municipioIbge) continue
    municipios.add(grupo.municipioIbge)
    const uf = grupo.uf ?? '??'
    porUf.set(uf, (porUf.get(uf) ?? 0) + 1)
  }

  return {
    totalDeMunicipios: municipios.size,
    porUf: [...porUf.entries()].map(([uf, total]) => ({ uf, municipios: total })).sort((a, b) => a.uf.localeCompare(b.uf)),
  }
}
