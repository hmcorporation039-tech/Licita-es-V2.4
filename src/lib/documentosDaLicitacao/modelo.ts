import { z } from 'zod'

export const TIPOS_DE_DOCUMENTO = ['proposta', 'declaracoes'] as const
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number]

const MAX_TEXTO = 5000
const MAX_BLOCOS = 200
const MAX_LINHAS = 500
const MAX_COLUNAS = 8

const texto = z.string().max(MAX_TEXTO)

export const blocoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('titulo'), texto: texto.min(1) }),
  z.object({ tipo: z.literal('paragrafo'), texto }),
  z.object({
    tipo: z.literal('tabela'),
    colunas: z.array(z.string().max(80)).min(1).max(MAX_COLUNAS),
    linhas: z.array(z.array(z.string().max(1000)).max(MAX_COLUNAS)).max(MAX_LINHAS),
    rodape: z.array(z.string().max(200)).max(MAX_COLUNAS).optional(),
    alinharDireita: z.array(z.number().int().min(0).max(MAX_COLUNAS - 1)).max(MAX_COLUNAS).optional(),
  }),
  z.object({ tipo: z.literal('assinatura'), local: z.string().max(200) }),
  z.object({ tipo: z.literal('quebra') }),
])

export const documentoSchema = z.object({
  tipo: z.enum(TIPOS_DE_DOCUMENTO),
  titulo: z.string().min(1).max(200),
  blocos: z.array(blocoSchema).min(1).max(MAX_BLOCOS),
})

export type Bloco = z.infer<typeof blocoSchema>
export type DocumentoDaLicitacao = z.infer<typeof documentoSchema>

export interface Proponente {
  razaoSocial: string
  documento: string
  qualificacao: string
  endereco: string
  cidadeUf: string
  telefone: string
  email: string
  responsavel: string
  responsavelCpf: string
  responsavelCargo: string
  dadosBancarios: string
  pendencias: string[]
}

export interface Certame {
  orgao: string
  numero: string
  modalidade: string
  objeto: string
  sessao: string
}

export function marcador(campo: string): string {
  return `[preencher: ${campo}]`
}
