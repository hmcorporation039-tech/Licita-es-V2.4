const LIMITE_PARA_CONTAR_EM_HORAS = 48

function emDias(horas: number): string {
  return `${Math.floor(horas / 24)} dias`
}

export function rotuloDoPrazoNoMapa(horasRestantes: number | null | undefined): string {
  if (horasRestantes === null || horasRestantes === undefined || !Number.isFinite(horasRestantes)) return 'Sem prazo de encerramento definido'
  if (horasRestantes < 0) {
    const horasDesde = -horasRestantes
    return `Propostas encerradas há ${horasDesde < LIMITE_PARA_CONTAR_EM_HORAS ? `${horasDesde} h` : emDias(horasDesde)}`
  }
  if (horasRestantes < 1) return 'Encerra em menos de 1 h'
  if (horasRestantes < LIMITE_PARA_CONTAR_EM_HORAS) return `Encerra em ${horasRestantes} h`
  return `Encerra em ${emDias(horasRestantes)}`
}
