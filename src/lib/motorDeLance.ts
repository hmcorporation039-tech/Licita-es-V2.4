import { proximoLance, type RegrasDoPregao } from './bela/copiloto'

export type DecisaoDeLance =
  | { acao: 'dar'; valor: number }
  | { acao: 'travar'; motivo: string }
  | { acao: 'aguardar'; motivo: string }

export interface EntradaDoLance {
  melhorLance: number | null
  meuMenorLance: number | null
  piso: number
  regras: RegrasDoPregao
  meusLances: number
}

export function decidirLance(e: EntradaDoLance): DecisaoDeLance {
  if (e.piso <= 0) return { acao: 'aguardar', motivo: 'Defina o piso (valor mínimo) para o robô atuar.' }
  if (e.melhorLance === null) return { acao: 'aguardar', motivo: 'Ainda não há melhor lance na disputa.' }
  if (e.meuMenorLance !== null && e.meuMenorLance <= e.melhorLance) {
    return { acao: 'aguardar', motivo: 'Você já está na frente; não precisa cobrir.' }
  }
  if (e.meusLances >= e.regras.maxLances) {
    return { acao: 'travar', motivo: `Atingiu o limite de ${e.regras.maxLances} lance(s) combinado(s).` }
  }
  if (e.melhorLance <= e.piso) {
    return { acao: 'travar', motivo: 'O melhor lance já está no seu piso ou abaixo; cobrir daria prejuízo.' }
  }
  const proximo = proximoLance(e.melhorLance, e.regras)
  if (proximo < e.piso) {
    return { acao: 'travar', motivo: 'O próximo lance válido cairia abaixo do piso; parando aqui.' }
  }
  return { acao: 'dar', valor: proximo }
}
