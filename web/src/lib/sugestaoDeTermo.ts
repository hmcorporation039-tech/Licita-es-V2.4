import { api } from './api'

export interface SugestaoDeTermo {
  original: string
  sugerido: string
  similaridade: number
}

// Pergunta à API a palavra real mais parecida quando a busca não achou nada.
// Nunca derruba a tela: qualquer erro vira "sem sugestão".
export async function buscarSugestaoDeTermo(termos: string[]): Promise<SugestaoDeTermo | null> {
  const limpos = termos.map((t) => t.trim()).filter(Boolean)
  if (limpos.length === 0) return null
  try {
    const resposta = await api.get<{ sugestao: SugestaoDeTermo | null }>(`/api/tenders/sugestao-de-termo?termos=${encodeURIComponent(limpos.join(','))}`)
    return resposta.sugestao
  } catch {
    return null
  }
}
