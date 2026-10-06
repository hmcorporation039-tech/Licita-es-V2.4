// ============================================================
// lib/cep.ts — Consulta de CEP para preencher o endereço da empresa. Os Correios só oferecem a
// API oficial mediante contrato; usamos o ViaCEP (base dos Correios, gratuito, sem chave) e,
// se ele falhar, a BrasilAPI. Só o CEP (8 dígitos) entra na URL, e os hosts são fixos.
// ============================================================

export interface EnderecoDoCep {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export class CepNaoEncontradoError extends Error {}
export class CepIndisponivelError extends Error {}

type Buscar = (url: string) => Promise<unknown>

async function buscarJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const texto = (v: unknown, max = 120): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function normalizarCep(valor: string): string | null {
  const d = valor.replace(/\D/g, '')
  return d.length === 8 ? d : null
}

function doViaCep(cep: string, j: unknown): EnderecoDoCep | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (o.erro) return null
  const uf = texto(o.uf, 2).toUpperCase()
  const cidade = texto(o.localidade)
  if (!cidade || uf.length !== 2) return null
  return { cep, logradouro: texto(o.logradouro), complemento: texto(o.complemento), bairro: texto(o.bairro), cidade, uf }
}

function daBrasilApi(cep: string, j: unknown): EnderecoDoCep | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const uf = texto(o.state, 2).toUpperCase()
  const cidade = texto(o.city)
  if (!cidade || uf.length !== 2) return null
  return { cep, logradouro: texto(o.street), complemento: '', bairro: texto(o.neighborhood), cidade, uf }
}

const cache = new Map<string, { em: number; valor: EnderecoDoCep }>()
const VALIDADE_MS = 24 * 60 * 60 * 1000

export async function consultarCep(valor: string, buscar: Buscar = buscarJson, agora = Date.now()): Promise<EnderecoDoCep> {
  const cep = normalizarCep(valor)
  if (!cep) throw new CepNaoEncontradoError('CEP inválido: informe os 8 dígitos.')
  const guardado = cache.get(cep)
  if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.valor

  let respondeu = false
  const tentativas: [string, (c: string, j: unknown) => EnderecoDoCep | null][] = [
    [`https://viacep.com.br/ws/${cep}/json/`, doViaCep],
    [`https://brasilapi.com.br/api/cep/v1/${cep}`, daBrasilApi],
  ]
  for (const [url, ler] of tentativas) {
    try {
      const endereco = ler(cep, await buscar(url))
      respondeu = true
      if (endereco) {
        cache.set(cep, { em: agora, valor: endereco })
        if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
        return endereco
      }
    } catch {
      // tenta a próxima fonte
    }
  }
  if (respondeu) throw new CepNaoEncontradoError('CEP não encontrado. Confira os números ou preencha o endereço à mão.')
  throw new CepIndisponivelError('Não foi possível consultar o CEP agora. Preencha o endereço à mão ou tente de novo em instantes.')
}

export function limparCacheDeCep(): void {
  cache.clear()
}

export interface CamposDeEndereco {
  endereco?: string | null
  enderecoNumero?: string | null
  enderecoComplemento?: string | null
  enderecoBairro?: string | null
  enderecoCidade?: string | null
  enderecoUf?: string | null
  cep?: string | null
}

// "Rua das Flores, 120 - Sala 2 - Centro - Goiânia/GO - CEP 74000-000" (só o que estiver preenchido).
export function montarEndereco(c: CamposDeEndereco): string | null {
  const rua = [c.endereco?.trim(), c.enderecoNumero?.trim()].filter(Boolean).join(', ')
  const cidade = [c.enderecoCidade?.trim(), c.enderecoUf?.trim()].filter(Boolean).join('/')
  const cep = c.cep ? normalizarCep(c.cep) : null
  const partes = [rua, c.enderecoComplemento?.trim(), c.enderecoBairro?.trim(), cidade, cep ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : c.cep?.trim()].filter(Boolean)
  return partes.length > 0 ? partes.join(' - ') : null
}
