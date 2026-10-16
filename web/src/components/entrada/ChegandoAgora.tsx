'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play } from 'lucide-react'
import { StatusTag } from '@/components/ui'
import type { AmostraDaVitrine } from '@/lib/dadosPublicos'
import PrazoNoCliente from './PrazoNoCliente'
import { prefereMenosMovimento } from './movimento'
import { frasePropria, nomeProprio } from '@/lib/textoLegivel'

const LINHAS_VISIVEIS = 4
const INTERVALO_MS = 2800

const ROTULO_CURTO_DA_FONTE: Record<string, string> = {
  PNCP: 'PNCP',
  COMPRASNET: 'ComprasNet',
  SISTEMA_S: 'Sistema S',
  SESC_REGIONAL: 'SESC',
  SESC_GO: 'SESC GO',
  SEST_SENAT: 'SEST SENAT',
  QUERIDO_DIARIO: 'Diário oficial',
  NOVACAP: 'Novacap',
  FIEG: 'FIEG',
}

export function rotuloCurtoDaFonte(fonte: string): string {
  return ROTULO_CURTO_DA_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
}

interface ItemNaTela {
  chave: number
  indice: number
}

function filaInicial(total: number): ItemNaTela[] {
  return Array.from({ length: Math.min(total, LINHAS_VISIVEIS) }, (_, i) => ({ chave: i, indice: i }))
}

function Linha({ amostra, chegando }: { amostra: AmostraDaVitrine; chegando: boolean }) {
  return (
    <li className={`flex h-(--altura-da-linha) items-start justify-between gap-3 border-b border-line-soft px-4 py-3 ${chegando ? 'item-chegando bg-sunken' : ''}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium text-ink">{frasePropria(amostra.objeto)}</p>
        <p className="truncate text-xs text-muted">
          {nomeProprio(amostra.orgao ?? '')}
          {amostra.local && ` · ${amostra.local}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PrazoNoCliente prazo={amostra.prazo} />
        <StatusTag mono>{rotuloCurtoDaFonte(amostra.fonte)}</StatusTag>
      </div>
    </li>
  )
}

export default function ChegandoAgora({ itens, ilustrativo }: { itens: AmostraDaVitrine[]; ilustrativo: boolean }) {
  const referencia = useRef<HTMLElement>(null)
  const [fila, setFila] = useState<ItemNaTela[]>(() => filaInicial(itens.length))
  const [pulsos, setPulsos] = useState(0)
  const [podeAnimar, setPodeAnimar] = useState(false)
  const [pausado, setPausado] = useState(false)
  const [naTela, setNaTela] = useState(true)
  const proximo = useRef(LINHAS_VISIVEIS)
  const contador = useRef(LINHAS_VISIVEIS)
  const ciclavel = itens.length > LINHAS_VISIVEIS + 1

  useEffect(() => {
    if (!ciclavel || prefereMenosMovimento()) return
    setPodeAnimar(true)
    const elemento = referencia.current
    if (!elemento || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver((entradas) => setNaTela(entradas.some((e) => e.isIntersecting)), { threshold: 0.1 })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [ciclavel])

  useEffect(() => {
    if (!podeAnimar || pausado || !naTela) return
    const avancar = () => {
      if (document.hidden) return
      const indice = proximo.current % itens.length
      proximo.current = indice + 1
      contador.current += 1
      const chave = contador.current
      setFila((atual) => [{ chave, indice }, ...atual].slice(0, LINHAS_VISIVEIS + 1))
      setPulsos((p) => p + 1)
    }
    const relogio = window.setInterval(avancar, INTERVALO_MS)
    return () => window.clearInterval(relogio)
  }, [podeAnimar, pausado, naTela, itens.length])

  const estiloDaJanela = { '--altura-da-linha': '5.75rem', height: `calc(${LINHAS_VISIVEIS} * var(--altura-da-linha))` } as CSSProperties
  const estiloDaLista: CSSProperties = pulsos > 0 ? { animationName: pulsos % 2 ? 'empurrar-lista-a' : 'empurrar-lista-b' } : {}

  return (
    <section ref={referencia} aria-labelledby="chegando-titulo" className="flex min-w-0 flex-col overflow-hidden rounded border border-line-strong bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className={`size-2 shrink-0 rounded-full bg-ok ${podeAnimar && !pausado ? 'ponto-ao-vivo' : ''}`} />
          <h2 id="chegando-titulo" className="truncate text-sm font-semibold text-ink">
            Licitações chegando agora
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ilustrativo ? <StatusTag>Exemplo ilustrativo</StatusTag> : <StatusTag>Amostra real</StatusTag>}
          {podeAnimar && (
            <button
              type="button"
              onClick={() => setPausado((p) => !p)}
              aria-pressed={pausado}
              aria-label={pausado ? 'Continuar a lista animada' : 'Pausar a lista animada'}
              className="inline-flex size-11 items-center justify-center rounded text-muted hover:bg-sunken hover:text-ink"
            >
              {pausado ? <Play size={14} strokeWidth={2} aria-hidden /> : <Pause size={14} strokeWidth={2} aria-hidden />}
            </button>
          )}
        </div>
      </div>
      <div aria-hidden className="relative overflow-hidden" style={estiloDaJanela}>
        <ul className="lista-chegando" style={estiloDaLista}>
          {fila.map((item, posicao) => (
            <Linha key={item.chave} amostra={itens[item.indice]} chegando={pulsos > 0 && posicao === 0} />
          ))}
        </ul>
      </div>
      <ul className="sr-only">
        {itens.map((a, i) => (
          <li key={`${a.objeto}-${i}`}>
            {frasePropria(a.objeto)}, {nomeProprio(a.orgao ?? '')}
            {a.local && `, ${a.local}`}, fonte {rotuloCurtoDaFonte(a.fonte)}
          </li>
        ))}
      </ul>
      <p className="border-t border-line-soft bg-sunken px-4 py-2.5 text-xs text-muted">
        {ilustrativo
          ? 'Exemplo ilustrativo, com dados fictícios. Busque o que você vende para ver as licitações reais.'
          : 'Amostra real de licitações abertas que o Monitor acompanha, de termos como material de limpeza, medicamentos e notebook.'}
      </p>
    </section>
  )
}
