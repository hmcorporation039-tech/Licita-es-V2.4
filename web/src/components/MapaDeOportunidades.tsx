'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import brazil from '@svg-maps/brazil'
import { api } from '@/lib/api'
import { EmptyState, TextLink, cx } from '@/components/ui'
import { rotuloDoPrazoNoMapa } from '@/lib/prazoNoMapa'
import type { TenderEscolhidaMapa, Urgencia } from '@/components/BrazilMap'

interface LocalDoMapa {
  id: string
  name: string
  path: string
}

const mapa = brazil as { viewBox: string; locations: LocalDoMapa[] }
const nomePorUf = new Map(mapa.locations.map((l) => [l.id.toUpperCase(), l.name]))

const FAIXAS = [
  { ate: 0, rotulo: 'Nenhuma', mistura: 0 },
  { ate: 0.25, rotulo: 'Poucas', mistura: 22 },
  { ate: 0.5, rotulo: '', mistura: 42 },
  { ate: 0.75, rotulo: '', mistura: 64 },
  { ate: 1, rotulo: 'Muitas', mistura: 90 },
]

const TEXTO_DO_PRAZO: Record<Urgencia, string> = {
  urgente: 'font-medium text-danger',
  andamento: 'font-medium text-warn',
  selecionada: 'text-faint',
  encerrada: 'text-muted',
}

function corDaFaixa(mistura: number): string {
  if (mistura === 0) return 'var(--color-line-soft)'
  return `color-mix(in srgb, var(--color-accent) ${mistura}%, var(--color-surface))`
}

function corDoEstado(total: number, maximo: number): string {
  if (total === 0 || maximo === 0) return corDaFaixa(0)
  const proporcao = total / maximo
  const faixa = FAIXAS.find((f) => f.ate > 0 && proporcao <= f.ate) ?? FAIXAS[FAIXAS.length - 1]
  return corDaFaixa(faixa.mistura)
}

function oportunidades(n: number): string {
  if (n === 0) return 'nenhuma oportunidade aberta'
  return n === 1 ? '1 oportunidade aberta' : `${n.toLocaleString('pt-BR')} oportunidades abertas`
}

interface DetalheDoEstado {
  uf: string
  total: number
  tenders: TenderEscolhidaMapa[]
}

export default function MapaDeOportunidades() {
  const [totais, setTotais] = useState<Map<string, number> | null>(null)
  const [erro, setErro] = useState(false)
  const [ufEmFoco, setUfEmFoco] = useState<string | null>(null)
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheDoEstado | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  useEffect(() => {
    api
      .get<{ estados: Array<{ uf: string; total: number }> }>('/api/dashboard/mapa/oportunidades')
      .then((r) => setTotais(new Map(r.estados.map((e) => [e.uf, e.total]))))
      .catch(() => setErro(true))
  }, [])

  useEffect(() => {
    if (!ufSelecionada) {
      setDetalhe(null)
      return
    }
    let cancelado = false
    setCarregandoDetalhe(true)
    api
      .get<DetalheDoEstado>(`/api/dashboard/mapa/oportunidades/${ufSelecionada}`)
      .then((r) => {
        if (!cancelado) setDetalhe(r)
      })
      .catch(() => {
        if (!cancelado) setDetalhe({ uf: ufSelecionada, total: 0, tenders: [] })
      })
      .finally(() => {
        if (!cancelado) setCarregandoDetalhe(false)
      })
    return () => {
      cancelado = true
    }
  }, [ufSelecionada])

  const maximo = totais ? Math.max(0, ...totais.values()) : 0
  const totalGeral = totais ? [...totais.values()].reduce((a, b) => a + b, 0) : 0
  const ranking = totais ? [...totais.entries()].sort((a, b) => b[1] - a[1]) : []
  const ufDoRotulo = ufEmFoco ?? ufSelecionada

  function alternar(uf: string) {
    setUfSelecionada((atual) => (atual === uf ? null : uf))
  }

  function aoTeclar(e: KeyboardEvent<SVGPathElement>, uf: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    alternar(uf)
  }

  if (erro) return <p className="text-sm text-muted">Não deu para carregar o mapa agora. Ele tenta de novo quando a página for recarregada.</p>

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[300px]">
        <p className="min-h-5 text-sm text-ink" aria-live="polite">
          {ufDoRotulo ? (
            <>
              <span className="font-semibold">{nomePorUf.get(ufDoRotulo) ?? ufDoRotulo}</span>
              <span className="text-muted"> · {oportunidades(totais?.get(ufDoRotulo) ?? 0)}</span>
            </>
          ) : (
            <span className="text-muted">Passe o mouse sobre um estado</span>
          )}
        </p>
        <svg viewBox={mapa.viewBox} className="w-full max-w-[300px] self-center" role="group" aria-label="Mapa do Brasil com as oportunidades abertas por estado" onMouseLeave={() => setUfEmFoco(null)}>
          {mapa.locations.map((loc) => {
            const uf = loc.id.toUpperCase()
            const total = totais?.get(uf) ?? 0
            const selecionado = uf === ufSelecionada
            const emFoco = uf === ufEmFoco
            const descricao = `${loc.name} — ${oportunidades(total)}`
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={corDoEstado(total, maximo)}
                stroke={selecionado || emFoco ? 'var(--color-ink)' : 'var(--color-line-strong)'}
                strokeWidth={selecionado ? 1.6 : emFoco ? 1.1 : 0.5}
                className="cursor-pointer transition-[stroke-width] outline-none focus-visible:stroke-[var(--color-accent)]"
                role="button"
                tabIndex={0}
                aria-label={descricao}
                aria-pressed={selecionado}
                onMouseEnter={() => setUfEmFoco(uf)}
                onFocus={() => setUfEmFoco(uf)}
                onBlur={() => setUfEmFoco(null)}
                onClick={() => alternar(uf)}
                onKeyDown={(e) => aoTeclar(e, uf)}
              >
                <title>{descricao}</title>
              </path>
            )
          })}
        </svg>
        <div className="flex items-center gap-2 text-2xs text-muted" aria-label="Legenda do mapa">
          <span>Nenhuma</span>
          <span className="flex h-2 flex-1 overflow-hidden rounded-sm">
            {FAIXAS.map((f) => (
              <span key={f.mistura} className="flex-1" style={{ background: corDaFaixa(f.mistura) }} />
            ))}
          </span>
          <span>Muitas</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!totais ? (
          <p className="text-sm text-muted">Carregando o mapa…</p>
        ) : totalGeral === 0 ? (
          <EmptyState
            title="Nenhuma oportunidade aberta ainda"
            description={
              <>
                As oportunidades aparecem aqui quando uma licitação aberta combina com os seus <TextLink href="/items">itens monitorados</TextLink>.
              </>
            }
          />
        ) : (
          <>
            <p className="text-sm text-muted">
              {oportunidades(totalGeral)} em {ranking.length} {ranking.length === 1 ? 'estado' : 'estados'}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estados com oportunidades">
              {ranking.map(([uf, total]) => {
                const selecionado = uf === ufSelecionada
                return (
                  <button
                    key={uf}
                    type="button"
                    onClick={() => alternar(uf)}
                    onMouseEnter={() => setUfEmFoco(uf)}
                    onMouseLeave={() => setUfEmFoco(null)}
                    aria-pressed={selecionado}
                    title={nomePorUf.get(uf) ?? uf}
                    className={cx(
                      'inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs transition-colors',
                      selecionado ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
                    )}
                  >
                    <span aria-hidden className="inline-block size-1.5 rounded-sm" style={{ background: corDoEstado(total, maximo) }} />
                    <span className="font-mono">{uf}</span>
                    <span className="font-mono text-muted">{total}</span>
                  </button>
                )
              })}
            </div>

            {!ufSelecionada ? (
              <p className="text-sm text-muted">Clique num estado no mapa ou na lista para ver as oportunidades de lá.</p>
            ) : carregandoDetalhe || !detalhe ? (
              <p className="text-sm text-muted">Carregando {nomePorUf.get(ufSelecionada) ?? ufSelecionada}…</p>
            ) : detalhe.total === 0 ? (
              <p className="text-sm text-muted">{nomePorUf.get(detalhe.uf) ?? detalhe.uf} não tem oportunidade aberta para os seus itens agora.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">
                  {nomePorUf.get(detalhe.uf) ?? detalhe.uf} <span className="font-normal text-muted">· {oportunidades(detalhe.total)}</span>
                </p>
                <ul className="flex flex-col divide-y divide-line-soft rounded border border-line">
                  {detalhe.tenders.map((t) => (
                    <li key={t.id} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                      <Link href={`/tenders/${t.id}`} className="truncate text-sm font-medium text-ink hover:text-accent hover:underline">
                        {t.municipio ?? 'Município n/d'} — {t.orgao ?? 'Órgão n/d'}
                      </Link>
                      <p className="truncate text-xs text-muted" title={t.objeto}>
                        {t.objeto}
                      </p>
                      <p className={cx('text-xs', TEXTO_DO_PRAZO[t.urgencia])}>{rotuloDoPrazoNoMapa(t.horasRestantes)}</p>
                    </li>
                  ))}
                </ul>
                {detalhe.total > detalhe.tenders.length && (
                  <p className="text-xs text-muted">
                    Mostrando as {detalhe.tenders.length} mais recentes. <TextLink href="/matches">Ver todos os matches</TextLink>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
