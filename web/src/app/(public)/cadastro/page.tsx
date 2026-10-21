import type { Metadata } from 'next'
import { buscarEstatisticas, buscarPlanos } from '@/lib/dadosPublicos'
import { estadoDaSigla } from '@/lib/estados'
import FormularioDeCadastro, { type InteresseInicial } from './FormularioDeCadastro'

export const metadata: Metadata = { title: 'Criar conta — Licita Bela' }

const ESPERA_DOS_DADOS_DO_PAINEL_MS = 2500
const TAMANHO_MINIMO_DO_TERMO = 2
const TAMANHO_MAXIMO_DO_TERMO = 120

function primeiroValor(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) ?? ''
}

function interesseDaBusca(q: string, uf: string): InteresseInicial | null {
  const termo = q.trim().replace(/\s+/g, ' ').slice(0, TAMANHO_MAXIMO_DO_TERMO)
  if (termo.length < TAMANHO_MINIMO_DO_TERMO) return null
  return { termo, uf: estadoDaSigla(uf)?.sigla ?? '' }
}

export default async function CadastroPage({ searchParams }: PageProps<'/cadastro'>) {
  const busca = await searchParams
  const [estatisticas, planos] = await Promise.all([buscarEstatisticas(ESPERA_DOS_DADOS_DO_PAINEL_MS), buscarPlanos(ESPERA_DOS_DADOS_DO_PAINEL_MS)])
  return (
    <FormularioDeCadastro
      interesseInicial={interesseDaBusca(primeiroValor(busca.q), primeiroValor(busca.uf))}
      abertas={estatisticas?.abertas ?? null}
      orgaos={estatisticas?.orgaos ?? null}
      trialDias={planos?.trialDias ?? null}
      limitesDoTeste={planos?.planos.find((p) => p.codigo === 'TESTE')?.limites ?? null}
    />
  )
}
