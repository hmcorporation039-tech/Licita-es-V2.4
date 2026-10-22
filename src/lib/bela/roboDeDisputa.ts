import { decidirLance, type DecisaoDeLance } from '../motorDeLance'
import type { RegrasDoPregao } from './copiloto'

export interface AlvoParaRobo {
  id: string
  rotulo: string
  melhorLance: number | null
  meuMenorLance: number | null
  piso: number | null
  meusLances: number
}

export interface InstrucaoDoRobo {
  alvo: string
  rotulo: string
  acao: DecisaoDeLance['acao']
  valor: number | null
  motivo: string | null
  texto: string
}

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function instrucaoDoAlvo(alvo: AlvoParaRobo, regras: RegrasDoPregao): InstrucaoDoRobo {
  const base = { alvo: alvo.id, rotulo: alvo.rotulo }
  if (alvo.piso === null || alvo.piso <= 0) {
    const texto = 'Defina o valor final mínimo (piso) deste item para o robô atuar.'
    return { ...base, acao: 'aguardar', valor: null, motivo: texto, texto }
  }
  const decisao = decidirLance({
    melhorLance: alvo.melhorLance,
    meuMenorLance: alvo.meuMenorLance,
    piso: alvo.piso,
    regras,
    meusLances: alvo.meusLances,
  })
  if (decisao.acao === 'dar') {
    const ultimo = alvo.meusLances + 1 >= regras.maxLances
    const texto = `Dar lance de ${reais(decisao.valor)}${ultimo ? ' — seria o seu último lance combinado.' : '.'}`
    return { ...base, acao: 'dar', valor: decisao.valor, motivo: null, texto }
  }
  if (decisao.acao === 'travar') {
    return { ...base, acao: 'travar', valor: null, motivo: decisao.motivo, texto: `Travar. ${decisao.motivo}` }
  }
  return { ...base, acao: 'aguardar', valor: null, motivo: decisao.motivo, texto: decisao.motivo }
}

export function planejarRobo(alvos: AlvoParaRobo[], regras: RegrasDoPregao): InstrucaoDoRobo[] {
  return alvos.map((alvo) => instrucaoDoAlvo(alvo, regras))
}
