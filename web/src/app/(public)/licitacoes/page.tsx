import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicProse } from '@/components/PublicShell'
import { ESTADOS } from '@/lib/estados'
import { enderecoDoSite } from '@/lib/enderecoDoSite'
import { RAMOS_PUBLICOS, caminhoDoRamo, ramoDoSlug, type RamoPublico } from '@/lib/ramosPublicos'

const NO_ESTADO = [
  ['limpeza', 'limpeza'],
  ['construcao-e-obras', 'obras'],
  ['informatica', 'informática'],
]
  .map(([slug, rotulo]) => ({ ramo: ramoDoSlug(slug), rotulo }))
  .filter((x): x is { ramo: RamoPublico; rotulo: string } => x.ramo !== null)

const DESCRICAO =
  'Licitações abertas em todo o Brasil, separadas por ramo e por estado: limpeza, obras, informática, alimentação, medicamentos e mais. Atualizadas a cada hora a partir do PNCP e dos diários oficiais.'

export const metadata: Metadata = {
  metadataBase: enderecoDoSite(),
  title: { absolute: 'Licitações abertas por ramo e estado · Licita Bela' },
  description: DESCRICAO,
  alternates: { canonical: '/licitacoes' },
}

export default function LicitacoesPorRamo() {
  return (
    <PublicProse titulo="Licitações abertas por ramo e estado" rotulo="Todo o Brasil">
      <p className="text-lg text-ink-2">
        A Licita Bela acompanha licitações de todos os 27 estados, do PNCP, do Sistema S, de portais estaduais e de diários
        oficiais municipais. Escolha o seu ramo para ver as que estão com prazo de proposta aberto hoje.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {RAMOS_PUBLICOS.map((r) => (
          <li key={r.slug} className="rounded-2xl border border-line p-4">
            <Link href={caminhoDoRamo(r)} className="text-lg font-bold text-accent hover:underline">
              {r.nome}
            </Link>
            <p className="mt-1 text-sm text-muted">{r.exemplos.slice(0, 3).join(' · ')}</p>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 mt-10 text-xl font-bold text-ink">Por estado</h2>
      <p className="mb-3 text-sm text-muted">Licitações de limpeza, informática, obras e outros ramos em cada estado:</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {ESTADOS.map((e) => (
          <li key={e.sigla}>
            <span className="font-semibold text-ink">{e.nome}</span>:{' '}
            {NO_ESTADO.map(({ ramo, rotulo }, i) => (
              <span key={ramo.slug}>
                {i > 0 && ', '}
                <Link href={caminhoDoRamo(ramo, e)} className="text-accent hover:underline">
                  {rotulo}
                </Link>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </PublicProse>
  )
}
