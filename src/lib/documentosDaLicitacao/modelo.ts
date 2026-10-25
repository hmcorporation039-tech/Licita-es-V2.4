import { z } from 'zod'

export const TIPOS_DE_DOCUMENTO = ['proposta', 'declaracoes', 'impugnacao', 'esclarecimento', 'recurso'] as const
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number]

const MAX_TEXTO = 5000
const MAX_BLOCOS = 200
const MAX_LINHAS = 500
const MAX_COLUNAS = 8
const MAX_QUEBRAS = 40
const MAX_CARACTERES = 200_000
export const MAX_LINHAS_NO_DOCUMENTO = 1000
export const MAX_CELULAS_NO_DOCUMENTO = 4000

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

export function vemAntesDaAssinatura(blocos: Bloco[], indice: number): boolean {
  for (let j = indice + 1; j < blocos.length; j++) {
    const bloco = blocos[j]
    if (bloco.tipo === 'paragrafo' && !bloco.texto.trim()) continue
    return bloco.tipo === 'assinatura'
  }
  return false
}

function caracteresDosBlocos(blocos: Array<z.infer<typeof blocoSchema>>): number {
  return blocos.reduce((total, b) => {
    if (b.tipo === 'titulo' || b.tipo === 'paragrafo') return total + b.texto.length
    if (b.tipo === 'assinatura') return total + b.local.length
    if (b.tipo === 'tabela') return total + [...b.colunas, ...(b.rodape ?? []), ...b.linhas.flat()].reduce((t, c) => t + c.length, 0)
    return total
  }, 0)
}

function celulasDasTabelas(blocos: Array<z.infer<typeof blocoSchema>>): number {
  return blocos.reduce((total, b) => (b.tipo === 'tabela' ? total + b.linhas.reduce((t, l) => t + l.length, 0) : total), 0)
}

function linhasDasTabelas(blocos: Array<z.infer<typeof blocoSchema>>): number {
  return blocos.reduce((total, b) => (b.tipo === 'tabela' ? total + b.linhas.length : total), 0)
}

export const documentoSchema = z.object({
  tipo: z.enum(TIPOS_DE_DOCUMENTO),
  titulo: z.string().min(1).max(200),
  blocos: z
    .array(blocoSchema)
    .min(1)
    .max(MAX_BLOCOS)
    .refine((blocos) => blocos.filter((b) => b.tipo === 'quebra').length <= MAX_QUEBRAS, { message: `No máximo ${MAX_QUEBRAS} quebras de página por documento.` })
    .refine((blocos) => caracteresDosBlocos(blocos) <= MAX_CARACTERES, { message: 'O documento ficou grande demais. Divida em arquivos menores.' })
    .refine((blocos) => linhasDasTabelas(blocos) <= MAX_LINHAS_NO_DOCUMENTO, { message: `No máximo ${MAX_LINHAS_NO_DOCUMENTO} linhas de tabela por documento. Divida em arquivos menores.` })
    .refine((blocos) => celulasDasTabelas(blocos) <= MAX_CELULAS_NO_DOCUMENTO, { message: `No máximo ${MAX_CELULAS_NO_DOCUMENTO} células de tabela por documento. Divida em arquivos menores.` }),
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
  referencia: string
  modalidade: string
  feminino: boolean
  objeto: string
  sessao: string
}

export function marcador(campo: string): string {
  return `[preencher: ${campo}]`
}
