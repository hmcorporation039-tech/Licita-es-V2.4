import type { MonitoredItem, RespostaDaBuscaDoItem, SituacaoDaBusca } from './types'

export const BUSCANDO = 'Buscando licitações…'
export const INTERVALO_DA_CONSULTA_DA_BUSCA_MS = 2_500
export const ESPERA_MAXIMA_DA_BUSCA_MS = 3 * 60 * 1000

export function situacaoDaResposta(resposta: RespostaDaBuscaDoItem): SituacaoDaBusca {
  if (resposta.busca === 'em-andamento') return { estado: 'em-andamento', encontrados: null, removidos: null, limitado: false, aviso: null }
  return {
    estado: 'concluida',
    encontrados: resposta.matchesFound ?? resposta.matchesEncontrados ?? 0,
    removidos: resposta.matchesRemovidos ?? null,
    limitado: Boolean(resposta.limitado),
    aviso: resposta.aviso ?? null,
  }
}

const quantidade = (n: number) => n.toLocaleString('pt-BR')

export function mensagemDaBusca({ estado, encontrados, removidos }: SituacaoDaBusca): string {
  if (estado === 'em-andamento') return BUSCANDO
  if (estado === 'falhou') return 'A busca não terminou. Tente "Buscar agora" de novo em alguns minutos.'
  const novas = encontrados ?? 0
  const tiradas = removidos ?? 0
  const partes = [
    novas > 0 ? `${quantidade(novas)} ${novas === 1 ? 'licitação encontrada' : 'licitações encontradas'}` : null,
    tiradas > 0 ? `${quantidade(tiradas)} ${tiradas === 1 ? 'removida' : 'removidas'}` : null,
  ].filter(Boolean)
  if (partes.length === 0) return 'Nenhuma licitação nova encontrada por enquanto.'
  return `${partes.join(' · ')}.${novas > 0 ? ' Veja em "Meus matches".' : ''}`
}

export interface DadosDoFormulario {
  name: string
  keywords: string[]
  palavrasDeExclusao: string[]
  catmatCodes: string[]
  catserCodes: string[]
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  ufs: string[]
  valorMin: number | null
  valorMax: number | null
  raioKm: number | null
  origemMunicipio: string | null
  origemUf: string | null
}

export function dadosAtuaisDoItem(item: MonitoredItem): DadosDoFormulario {
  return {
    name: item.name,
    keywords: item.keywords,
    palavrasDeExclusao: item.palavrasDeExclusao ?? [],
    catmatCodes: item.catmatCodes,
    catserCodes: item.catserCodes,
    modalidades: item.modalidades,
    orgaos: item.orgaos,
    uasgCodes: item.uasgCodes,
    ufs: item.ufs,
    valorMin: item.valorMin != null ? Number(item.valorMin) : null,
    valorMax: item.valorMax != null ? Number(item.valorMax) : null,
    raioKm: item.raioKm ?? null,
    origemMunicipio: item.origemMunicipio ?? null,
    origemUf: item.origemUf ?? null,
  }
}

export function camposAlterados(antes: DadosDoFormulario, depois: DadosDoFormulario): Partial<DadosDoFormulario> {
  const alterados: Partial<DadosDoFormulario> = {}
  for (const campo of Object.keys(depois) as (keyof DadosDoFormulario)[]) {
    if (JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo])) Object.assign(alterados, { [campo]: depois[campo] })
  }
  return alterados
}
