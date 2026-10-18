'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Mic, Pause, Play } from 'lucide-react'
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
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diário municipal',
  TCE_CE: 'TCE-CE',
  TCE_PI: 'TCE-PI',
  TCE_TO: 'TCE-TO',
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
    <li className={`az-tela-linha ${chegando ? 'item-chegando' : ''}`}>
      <div className={`az-tela-item ${chegando ? 'az-tela-item-novo' : ''}`}>
        <p className="az-tela-objeto">{frasePropria(amostra.objeto)}</p>
        <p className="az-tela-orgao">
          {nomeProprio(amostra.orgao ?? '')}
          {amostra.local && ` · ${amostra.local}`}
        </p>
        <div className="az-tela-rodape-item">
          <PrazoNoCliente prazo={amostra.prazo} />
          <span className="az-fonte-tag">{rotuloCurtoDaFonte(amostra.fonte)}</span>
        </div>
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

  const estiloDaLista: CSSProperties = { '--altura-da-linha': '6.75rem', ...(pulsos > 0 ? { animationName: pulsos % 2 ? 'empurrar-lista-a' : 'empurrar-lista-b' } : {}) } as CSSProperties

  return (
    <section ref={referencia} aria-labelledby="chegando-titulo" className="az-tela-app">
      <div className="az-tela-topo">
        <div className="min-w-0">
          <p className="az-tela-sobretitulo">
            <span aria-hidden className={`az-ponto-vivo ${podeAnimar && !pausado ? 'ponto-ao-vivo' : ''}`} />
            {ilustrativo ? 'Exemplo ilustrativo' : 'Amostra real, ao vivo'}
          </p>
          <h2 id="chegando-titulo" className="az-tela-titulo">
            Chegando agora
          </h2>
        </div>
        {podeAnimar && (
          <button
            type="button"
            onClick={() => setPausado((p) => !p)}
            aria-pressed={pausado}
            aria-label={pausado ? 'Continuar a lista animada' : 'Pausar a lista animada'}
            className="az-tela-pausa"
          >
            {pausado ? <Play size={16} strokeWidth={2.5} aria-hidden /> : <Pause size={16} strokeWidth={2.5} aria-hidden />}
          </button>
        )}
      </div>
      <div aria-hidden className="az-tela-janela">
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
      <div aria-hidden className="az-tela-microfone">
        <span className="az-tela-microfone-botao">
          <Mic size={14} strokeWidth={2.5} />
        </span>
        Fale com a Bela
      </div>
    </section>
  )
}
