import { api, baixarArquivo, enviarArquivo } from './api'

export type TipoDeCusto = 'MATERIAL' | 'MAO_DE_OBRA' | 'SERVICO'
export type FonteDePreco = 'PROPRIA' | 'REFERENCIA'

export interface PrecoBase {
  id: string
  descricao: string
  unidade: string | null
  tipo: TipoDeCusto
  custoUnitario: string
  fonte: FonteDePreco
  observacao: string | null
  dataDoPreco: string
  desatualizado: boolean
  atualizadoEm: string
}

export interface DadosDoPreco {
  descricao: string
  unidade: string | null
  tipo: TipoDeCusto
  custoUnitario: number
  fonte: FonteDePreco
  observacao: string | null
  dataDoPreco?: string
}

export const ROTULO_DO_TIPO: Record<TipoDeCusto, string> = {
  MATERIAL: 'Material',
  MAO_DE_OBRA: 'Mão de obra',
  SERVICO: 'Serviço',
}

export const ROTULO_DA_FONTE: Record<FonteDePreco, string> = {
  PROPRIA: 'Própria',
  REFERENCIA: 'Referência',
}

export interface ResultadoDaImportacao {
  importados: number
  ignorados: number
}

export const listarPrecos = (q?: string) => api.get<PrecoBase[]>(`/api/base-de-precos${q ? `?q=${encodeURIComponent(q)}` : ''}`)
export const criarPreco = (dados: DadosDoPreco) => api.post<PrecoBase>('/api/base-de-precos', dados)
export const atualizarPreco = (id: string, dados: DadosDoPreco) => api.put<PrecoBase>(`/api/base-de-precos/${id}`, dados)
export const removerPreco = (id: string) => api.delete<void>(`/api/base-de-precos/${id}`)
export const exportarBaseDePrecos = () => baixarArquivo('/api/base-de-precos/exportar', 'base-de-precos.xlsx')
export const importarBaseDePrecos = (arquivo: File) => enviarArquivo<ResultadoDaImportacao>('/api/base-de-precos/importar', arquivo, { metodo: 'POST' })
