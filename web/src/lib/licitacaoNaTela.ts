import { dataDaLicitacao } from './datas'

const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])

export interface DatasNaTela {
  fonte: string
  encerramentoAt?: string | null
  aberturaAt?: string | null
}

export function fimDasPropostas(t: DatasNaTela): string | null {
  if (t.encerramentoAt) return dataDaLicitacao(t.encerramentoAt, t.fonte)
  if (FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(t.fonte)) return null
  return dataDaLicitacao(t.aberturaAt, t.fonte)
}

export function localDaLicitacao(t: { municipio?: string | null; uf?: string | null }): string {
  if (t.municipio) return t.uf ? `${t.municipio}/${t.uf}` : t.municipio
  return t.uf ?? 'UF n/d'
}
