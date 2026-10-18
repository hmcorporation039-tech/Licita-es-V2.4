import { z } from 'zod'
import { temPalavraSignificativa } from './matching'

export const SIGLAS_DAS_UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

export const TAMANHO_MAXIMO_DA_UTM = 200
export const TAMANHO_MINIMO_DO_TERMO = 2
export const TAMANHO_MAXIMO_DO_TERMO = 120

const valorDeUtm = z
  .string()
  .trim()
  .max(TAMANHO_MAXIMO_DA_UTM)
  .transform((v) => v || undefined)
  .optional()

export const utmSchema = z.object({
  utm_source: valorDeUtm,
  utm_medium: valorDeUtm,
  utm_campaign: valorDeUtm,
  utm_content: valorDeUtm,
  utm_term: valorDeUtm,
})

export const interesseSchema = z.object({
  termo: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(TAMANHO_MINIMO_DO_TERMO).max(TAMANHO_MAXIMO_DO_TERMO).refine(temPalavraSignificativa)),
  uf: z.string().trim().toUpperCase().pipe(z.enum(SIGLAS_DAS_UFS)).optional(),
})

export type UtmDoCadastro = z.infer<typeof utmSchema>
export type InteresseDoCadastro = z.infer<typeof interesseSchema>

export interface OrigemDoCadastro extends UtmDoCadastro {
  interesse?: InteresseDoCadastro
}

export function montarOrigem(utm: UtmDoCadastro | undefined, interesse: InteresseDoCadastro | undefined): OrigemDoCadastro | undefined {
  const origem: OrigemDoCadastro = {}
  for (const [chave, valor] of Object.entries(utm ?? {}) as Array<[keyof UtmDoCadastro, string | undefined]>) {
    if (valor) origem[chave] = valor
  }
  if (interesse) origem.interesse = interesse.uf ? { termo: interesse.termo, uf: interesse.uf } : { termo: interesse.termo }
  return Object.keys(origem).length > 0 ? origem : undefined
}

export function interesseDaOrigem(origem: unknown): InteresseDoCadastro | null {
  if (!origem || typeof origem !== 'object' || !('interesse' in origem)) return null
  const lido = interesseSchema.safeParse((origem as { interesse: unknown }).interesse)
  return lido.success ? lido.data : null
}

export function nomeDoItemDoInteresse(interesse: InteresseDoCadastro): string {
  return interesse.termo.charAt(0).toLocaleUpperCase('pt-BR') + interesse.termo.slice(1)
}
