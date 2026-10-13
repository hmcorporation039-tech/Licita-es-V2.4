'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import brazil from '@svg-maps/brazil'
import { EmptyState, TextLink, cx } from '@/components/ui'

export type Urgencia = 'urgente' | 'andamento' | 'selecionada'

export interface TenderEscolhidaMapa {
  id: string
  municipio: string | null
  orgao: string | null
  objeto: string
  diasRestantes: number | null
  urgencia: Urgencia
}

export interface EstadoMapa {
  uf: string
  urgenciaPrioritaria: Urgencia
  tenders: TenderEscolhidaMapa[]
}

interface BrazilMapLocation {
  id: string
  name: string
  path: string
}
interface BrazilMapData {
  viewBox: string
  locations: BrazilMapLocation[]
}

const mapData = brazil as BrazilMapData

const COR: Record<Urgencia, string> = {
  urgente: 'var(--color-danger)',
  andamento: 'var(--color-indigo-600)',
  selecionada: 'var(--color-indigo-300)',
}
const COR_VAZIO = 'var(--color-line-soft)'
const COR_BORDA = 'var(--color-line-strong)'
const COR_BORDA_ATIVA = 'var(--color-ink)'

const LEGENDA: Array<{ urgencia: Urgencia; rotulo: string }> = [
  { urgencia: 'selecionada', rotulo: 'Selecionada' },
  { urgencia: 'andamento', rotulo: 'Prazo se aproximando' },
  { urgencia: 'urgente', rotulo: 'Prestes a encerrar' },
]

const LABEL_PRAZO = (dias: number | null) => {
  if (dias === null) return 'Sem prazo de encerramento definido'
  if (dias < 0) return 'Prazo já encerrado'
  if (dias === 0) return 'Encerra hoje'
  return `Encerra em ${dias} dia(s)`
}

export default function BrazilMap({ estados }: { estados: EstadoMapa[] }) {
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)

  const porUf = new Map(estados.map((e) => [e.uf, e]))
  const ativo = ufSelecionada ? porUf.get(ufSelecionada) : null
  const nomePorUf = new Map(mapData.locations.map((l) => [l.id.toUpperCase(), l.name]))

  function alternar(uf: string) {
    setUfSelecionada(uf === ufSelecionada ? null : uf)
  }

  function aoTeclar(e: KeyboardEvent<SVGPathElement>, uf: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    alternar(uf)
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex w-full shrink-0 flex-col gap-3 sm:w-[300px]">
        <svg viewBox={mapData.viewBox} className="w-full max-w-[300px] self-center" role="group" aria-label="Mapa do Brasil com as licitações escolhidas por estado">
          {mapData.locations.map((loc) => {
            const uf = loc.id.toUpperCase()
            const estado = porUf.get(uf)
            const cor = estado ? COR[estado.urgenciaPrioritaria] : COR_VAZIO
            const pisca = !!estado && estado.urgenciaPrioritaria !== 'andamento'
            const selecionado = uf === ufSelecionada
            const descricao = `${loc.name}${estado ? ` — ${estado.tenders.length} licitação(ões) escolhida(s)` : ' — nenhuma licitação escolhida'}`
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={cor}
                stroke={selecionado ? COR_BORDA_ATIVA : COR_BORDA}
                strokeWidth={selecionado ? 1.4 : 0.5}
                className={cx(pisca && 'map-blink', estado && 'cursor-pointer')}
                role={estado ? 'button' : undefined}
                tabIndex={estado ? 0 : undefined}
                aria-label={estado ? descricao : undefined}
                aria-pressed={estado ? selecionado : undefined}
                aria-hidden={estado ? undefined : true}
                onClick={() => estado && alternar(uf)}
                onKeyDown={(e) => estado && aoTeclar(e, uf)}
              >
                <title>{descricao}</title>
              </path>
            )
          })}
        </svg>
        <ul aria-label="Legenda do mapa" className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted">
          {LEGENDA.map((item) => (
            <li key={item.urgencia} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: COR[item.urgencia] }} />
              {item.rotulo}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {estados.length === 0 ? (
          <EmptyState
            title="Nenhuma licitação escolhida ainda"
            description={
              <>
                Marque licitações como &quot;interessado&quot; em <TextLink href="/matches">Meus matches</TextLink> pra elas aparecerem aqui.
              </>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" aria-label="Estados com licitações escolhidas" role="group">
              {estados.map((e) => {
                const selecionado = e.uf === ufSelecionada
                return (
                  <button
                    key={e.uf}
                    type="button"
                    onClick={() => alternar(e.uf)}
                    aria-pressed={selecionado}
                    title={nomePorUf.get(e.uf) ?? e.uf}
                    className={cx(
                      'inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs transition-colors',
                      selecionado ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
                    )}
                  >
                    <span aria-hidden className="inline-block size-1.5 rounded-sm" style={{ background: COR[e.urgenciaPrioritaria] }} />
                    <span className="font-mono">{e.uf}</span>
                    <span className="font-mono text-muted">{e.tenders.length}</span>
                  </button>
                )
              })}
            </div>

            {ativo ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">
                  {nomePorUf.get(ativo.uf) ?? ativo.uf} <span className="font-normal text-muted">· {ativo.tenders.length} licitação(ões) escolhida(s)</span>
                </p>
                <ul className="flex flex-col divide-y divide-line-soft rounded border border-line">
                  {ativo.tenders.map((t) => (
                    <li key={t.id} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                      <Link href={`/tenders/${t.id}`} className="truncate text-sm font-medium text-ink hover:text-accent hover:underline">
                        {t.municipio ?? 'Município n/d'} — {t.orgao ?? 'Órgão n/d'}
                      </Link>
                      <p className="truncate text-xs text-muted" title={t.objeto}>
                        {t.objeto}
                      </p>
                      <p className={cx('text-xs', t.urgencia === 'urgente' ? 'font-medium text-danger' : 'text-faint')}>{LABEL_PRAZO(t.diasRestantes)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">Escolha um estado no mapa ou na lista acima pra ver as licitações escolhidas ali.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
