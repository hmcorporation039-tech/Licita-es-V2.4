'use client'

import { useState } from 'react'
import Link from 'next/link'
import brazil from '@svg-maps/brazil'

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

// Cores no estilo "farol" — mesma lógica descrita pelo usuário: verde =
// escolhida sem urgência, amarelo = prazo se aproximando, vermelho = prestes
// a encerrar. Vermelho e verde piscam (mais urgência de atenção / reforço
// visual de "selecionada"); amarelo fica estável, já é um alerta por si só.
const COR: Record<Urgencia, string> = {
  urgente: '#dc2626',
  andamento: '#d97706',
  selecionada: '#16a34a',
}
const COR_VAZIO = '#e2e8f0'

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

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <svg
        viewBox={mapData.viewBox}
        className="w-full max-w-sm shrink-0"
        role="img"
        aria-label="Mapa do Brasil com as licitações escolhidas por estado"
      >
        {mapData.locations.map((loc) => {
          const uf = loc.id.toUpperCase()
          const estado = porUf.get(uf)
          const cor = estado ? COR[estado.urgenciaPrioritaria] : COR_VAZIO
          const pisca = !!estado && estado.urgenciaPrioritaria !== 'andamento'
          return (
            <path
              key={loc.id}
              d={loc.path}
              fill={cor}
              stroke={uf === ufSelecionada ? '#1e293b' : '#94a3b8'}
              strokeWidth={uf === ufSelecionada ? 1.4 : 0.5}
              className={`${pisca ? 'map-blink' : ''} ${estado ? 'cursor-pointer' : ''}`}
              onClick={() => estado && setUfSelecionada(uf === ufSelecionada ? null : uf)}
            >
              <title>
                {loc.name}
                {estado ? ` — ${estado.tenders.length} licitação(ões) escolhida(s)` : ' — nenhuma licitação escolhida'}
              </title>
            </path>
          )
        })}
      </svg>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR.selecionada }} />
            Selecionada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR.andamento }} />
            Em andamento (prazo se aproximando)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR.urgente }} />
            Prestes a encerrar
          </span>
        </div>

        {estados.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma licitação escolhida ainda. Marque licitações como &quot;interessado&quot; em{' '}
            <Link href="/matches" className="text-indigo-700 hover:underline">
              Meus matches
            </Link>{' '}
            pra elas aparecerem aqui.
          </p>
        ) : ativo ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              {ativo.uf} — {ativo.tenders.length} licitação(ões) escolhida(s)
            </p>
            <ul className="flex flex-col gap-2">
              {ativo.tenders.map((t) => (
                <li key={t.id} className="rounded border border-slate-200 p-2 text-xs">
                  <Link href={`/tenders/${t.id}`} className="font-medium text-indigo-700 hover:underline">
                    {t.municipio ?? 'Município n/d'} — {t.orgao ?? 'Órgão n/d'}
                  </Link>
                  <p className="mt-0.5 truncate text-slate-500" title={t.objeto}>
                    {t.objeto}
                  </p>
                  <p className="mt-0.5 text-slate-400">{LABEL_PRAZO(t.diasRestantes)}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Clique num estado colorido pra ver as licitações escolhidas ali.</p>
        )}
      </div>
    </div>
  )
}
