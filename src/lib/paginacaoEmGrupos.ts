export interface FatiaDoGrupo {
  grupo: number
  skip: number
  take: number
}

export function fatiasDaPagina(totaisDosGrupos: number[], page: number, pageSize: number): FatiaDoGrupo[] {
  const fatias: FatiaDoGrupo[] = []
  let inicio = (page - 1) * pageSize
  let restante = pageSize
  totaisDosGrupos.forEach((total, grupo) => {
    if (restante <= 0) return
    if (inicio >= total) {
      inicio -= total
      return
    }
    const take = Math.min(restante, total - inicio)
    fatias.push({ grupo, skip: inicio, take })
    restante -= take
    inicio = 0
  })
  return fatias
}
