import { limitesDoAlvo, type LimitesDoAlvo, type RegrasDoPregao } from './copiloto'
import {
  COMO_FUNCIONA_O_MODO,
  NOME_DO_MODO,
  TEXTO_DESCONHECIDO,
  type IntervaloMinimo,
  type RegrasDoEdital,
} from './regrasDoEdital'

export type BaseDoValorFinal = 'MARGEM' | 'EQUILIBRIO'

export interface EscolhaDoAlvo {
  base: BaseDoValorFinal
  cadastradoEm: string | null
  valorCadastrado: number | null
}

export type PlanoSalvo = Record<string, EscolhaDoAlvo>

export interface ValorFinalMinimo {
  base: BaseDoValorFinal
  valor: number | null
  minimoComMargem: number | null
  equilibrio: number | null
  lucroZero: boolean
}

const arred = (n: number) => Math.round(n * 100) / 100
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export function valorFinalMinimo(l: LimitesDoAlvo, base: BaseDoValorFinal): ValorFinalMinimo {
  const { minimoComMargem, equilibrio } = limitesDoAlvo(l)
  if (equilibrio === null) return { base, valor: null, minimoComMargem, equilibrio, lucroZero: false }
  const valor = base === 'EQUILIBRIO' ? equilibrio : Math.max(minimoComMargem ?? equilibrio, equilibrio)
  return { base, valor, minimoComMargem, equilibrio, lucroZero: base === 'EQUILIBRIO' || valor === equilibrio }
}

export function lerPlanoSalvo(bruto: unknown): PlanoSalvo {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {}
  const plano: PlanoSalvo = {}
  for (const [alvo, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const e = v as Record<string, unknown>
    plano[alvo] = {
      base: e.base === 'EQUILIBRIO' ? 'EQUILIBRIO' : 'MARGEM',
      cadastradoEm: typeof e.cadastradoEm === 'string' ? e.cadastradoEm : null,
      valorCadastrado: typeof e.valorCadastrado === 'number' && Number.isFinite(e.valorCadastrado) ? e.valorCadastrado : null,
    }
  }
  return plano
}

export function escolhaDe(plano: PlanoSalvo, alvo: string): EscolhaDoAlvo {
  return plano[alvo] ?? { base: 'MARGEM', cadastradoEm: null, valorCadastrado: null }
}

export interface PassoDosLances {
  configuradoPct: number
  efetivoPct: number
  intervaloMinimoReais: number | null
  ajustado: boolean
  aviso: string | null
}

export function passoDosLances(configuradoPct: number, intervalo: IntervaloMinimo | null): PassoDosLances {
  if (!intervalo) return { configuradoPct, efetivoPct: configuradoPct, intervaloMinimoReais: null, ajustado: false, aviso: null }
  if (intervalo.tipo === 'REAIS') {
    return {
      configuradoPct,
      efetivoPct: configuradoPct,
      intervaloMinimoReais: intervalo.valor,
      ajustado: false,
      aviso: `O edital exige que cada lance fique pelo menos ${reais(intervalo.valor)} abaixo do lance anterior. A Bela nunca sugere um lance com diferença menor que essa.`,
    }
  }
  if (configuradoPct >= intervalo.valor) return { configuradoPct, efetivoPct: configuradoPct, intervaloMinimoReais: null, ajustado: false, aviso: null }
  return {
    configuradoPct,
    efetivoPct: intervalo.valor,
    intervaloMinimoReais: null,
    ajustado: true,
    aviso: `Seu decremento de ${pct(configuradoPct)} é menor que o intervalo mínimo entre lances do edital (${pct(intervalo.valor)}). A Bela vai usar ${pct(intervalo.valor)}, senão o portal recusa o lance.`,
  }
}

export function regrasEfetivas(regras: RegrasDoPregao, passo: PassoDosLances): RegrasDoPregao {
  return { ...regras, decrementoPct: passo.efetivoPct, intervaloMinimoReais: passo.intervaloMinimoReais }
}

export type SituacaoDoItem = 'ok' | 'atencao' | 'proibido' | 'desconhecido'

export interface ItemDoChecklist {
  id: 'modo' | 'intervalo' | 'robo' | 'criterio' | 'exclusao'
  titulo: string
  situacao: SituacaoDoItem
  valor: string
  explicacao: string
  trecho: string | null
}

export function checklistDaDisputa(regras: RegrasDoEdital, passo: PassoDosLances): ItemDoChecklist[] {
  const modo = regras.modoDeDisputa
  const intervalo = regras.intervaloMinimo
  const itens: ItemDoChecklist[] = [
    {
      id: 'modo',
      titulo: 'Modo de disputa',
      situacao: modo ? 'ok' : 'desconhecido',
      valor: modo ? NOME_DO_MODO[modo.modo] : TEXTO_DESCONHECIDO,
      explicacao: modo
        ? `${COMO_FUNCIONA_O_MODO[modo.modo]}${modo.origem === 'pncp' ? ' (informado pelo órgão no PNCP)' : ' (lido na análise do edital)'}`
        : 'O edital diz se a disputa é aberta, aberta e fechada ou fechada e aberta. Isso muda os tempos da sessão.',
      trecho: null,
    },
    {
      id: 'intervalo',
      titulo: 'Intervalo mínimo entre lances',
      situacao: intervalo ? (passo.ajustado ? 'atencao' : 'ok') : 'desconhecido',
      valor: intervalo ? (intervalo.tipo === 'PERCENTUAL' ? pct(intervalo.valor) : reais(intervalo.valor)) : TEXTO_DESCONHECIDO,
      explicacao: intervalo
        ? (passo.aviso ?? `Seu decremento de ${pct(passo.configuradoPct)} respeita esse intervalo.`)
        : regras.intervaloAmbiguo
          ? 'A análise do edital cita mais de um intervalo mínimo (talvez um por lote). Confira qual vale para o seu item e ajuste o decremento.'
          : 'O edital define a diferença mínima entre um lance e o seguinte. Confira e ajuste o decremento nas configurações do lance.',
      trecho: intervalo?.trecho ?? null,
    },
    {
      id: 'robo',
      titulo: 'Robô de lances',
      situacao: regras.vedacaoARobo ? 'proibido' : 'desconhecido',
      valor: regras.vedacaoARobo ? 'proibido pelo edital' : TEXTO_DESCONHECIDO,
      explicacao: regras.vedacaoARobo
        ? 'O edital proíbe robô de lances: use só lances manuais. O lance automático do próprio Compras.gov.br (valor final mínimo) é uma função do sistema oficial; confira no edital se ele trata disso.'
        : 'Alguns editais proíbem robôs ou programas de lances automáticos. A Bela não achou essa proibição na análise, o que não garante que ela não exista.',
      trecho: regras.vedacaoARobo?.trecho ?? null,
    },
    {
      id: 'criterio',
      titulo: 'Critério de julgamento',
      situacao: regras.criterioDeJulgamento ? 'ok' : 'desconhecido',
      valor: regras.criterioDeJulgamento ?? TEXTO_DESCONHECIDO,
      explicacao: 'Diz se a disputa é por item, por lote ou pelo valor global, e se o lance é pelo preço unitário ou pelo total. Use o mesmo critério nas configurações do lance.',
      trecho: null,
    },
    {
      id: 'exclusao',
      titulo: 'Lance errado',
      situacao: 'ok',
      valor: 'até 15 segundos',
      explicacao: 'Se digitar um lance errado, peça a exclusão do último lance em até 15 segundos depois de registrá-lo (art. 21, § 3º, da IN SEGES/ME 73/2022). Confira a regra no seu portal.',
      trecho: null,
    },
  ]
  return itens
}

export function descricaoDoValor(valor: ValorFinalMinimo, margemDesejadaPct: number): string {
  if (valor.valor === null) return 'Preencha os custos no estudo de custos para a Bela calcular o valor final mínimo.'
  if (valor.base === 'EQUILIBRIO') return 'Ponto de equilíbrio: nesse valor o lucro é zero. Abaixo dele há prejuízo.'
  if (valor.lucroZero) return `Com impostos e margem desejada de ${pct(margemDesejadaPct)}, o mínimo coincide com o ponto de equilíbrio.`
  return `Menor valor que ainda garante a margem desejada de ${pct(margemDesejadaPct)}, o mesmo do estudo de custos. Nunca fica abaixo do ponto de equilíbrio (${reais(valor.equilibrio!)}).`
}

export function desatualizado(escolha: EscolhaDoAlvo, valor: number | null): boolean {
  return escolha.cadastradoEm !== null && escolha.valorCadastrado !== null && valor !== null && arred(escolha.valorCadastrado) !== arred(valor)
}
