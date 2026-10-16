'use client'

import { getImageProps } from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { prefereMenosMovimento } from './movimento'

type Formato = 'largo' | 'estreito'
type Variante = 'heroi' | 'secao'

interface Quadro {
  poster: string
  largura: number
  altura: number
  video: string
  sizes: string
}

type NavegadorComConexao = Navigator & { connection?: { saveData?: boolean } }

const TELA_LARGA = '(min-width: 768px)'
const POSTER_QUADRADO = '/bela/bela-loop-poster.webp'
const POSTER_VERTICAL = '/bela/bela-vertical-poster.webp'
const MARGEM_DE_ANTECIPACAO = '300px'

const QUADROS: Record<Variante, Record<Formato, Quadro>> = {
  heroi: {
    largo: { poster: POSTER_QUADRADO, largura: 900, altura: 900, video: '/bela/bela-loop-900', sizes: '(min-width: 1024px) 580px, 460px' },
    estreito: { poster: POSTER_VERTICAL, largura: 720, altura: 900, video: '/bela/bela-vertical-540', sizes: '72vw' },
  },
  secao: {
    largo: { poster: POSTER_VERTICAL, largura: 720, altura: 900, video: '/bela/bela-vertical-720', sizes: '(min-width: 1024px) 520px, 80vw' },
    estreito: { poster: POSTER_VERTICAL, largura: 720, altura: 900, video: '/bela/bela-vertical-540', sizes: '92vw' },
  },
}

function economiaDeDados(): boolean {
  return (navigator as NavegadorComConexao).connection?.saveData === true
}

function formatoDaTela(): Formato {
  return window.matchMedia(TELA_LARGA).matches ? 'largo' : 'estreito'
}

export default function BelaEmMovimento({ variante, alt, className }: { variante: Variante; alt: string; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [formato, setFormato] = useState<Formato | null>(null)
  const [tocando, setTocando] = useState(false)
  const quadros = QUADROS[variante]
  const prioritario = variante === 'heroi'

  useEffect(() => {
    if (prefereMenosMovimento() || economiaDeDados()) return
    const alvo = caixa.current
    if (prioritario || !alvo || typeof IntersectionObserver === 'undefined') {
      setFormato(formatoDaTela())
      return
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return
        observador.disconnect()
        setFormato(formatoDaTela())
      },
      { rootMargin: MARGEM_DE_ANTECIPACAO },
    )
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [prioritario])

  useEffect(() => {
    const elemento = video.current
    const alvo = caixa.current
    if (!formato || !elemento || !alvo) return
    let naTela = true
    const atualizar = () => {
      if (naTela && !document.hidden) elemento.play().catch(() => {})
      else elemento.pause()
    }
    const observador =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entradas) => {
            naTela = entradas.some((e) => e.isIntersecting)
            atualizar()
          })
    observador?.observe(alvo)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      observador?.disconnect()
      document.removeEventListener('visibilitychange', atualizar)
      elemento.pause()
    }
  }, [formato])

  const comum = { alt, loading: prioritario ? ('eager' as const) : ('lazy' as const), fetchPriority: prioritario ? ('high' as const) : undefined }
  const {
    props: { srcSet: srcSetLargo, sizes: sizesLargo },
  } = getImageProps({ ...comum, src: quadros.largo.poster, width: quadros.largo.largura, height: quadros.largo.altura, sizes: quadros.largo.sizes })
  const { props: estreito } = getImageProps({ ...comum, src: quadros.estreito.poster, width: quadros.estreito.largura, height: quadros.estreito.altura, sizes: quadros.estreito.sizes })
  const escolhido = formato ? quadros[formato] : null

  return (
    <div ref={caixa} className={`az-bela-movimento az-bela-movimento-${variante} ${className ?? ''}`}>
      <picture>
        <source media={TELA_LARGA} srcSet={srcSetLargo} sizes={sizesLargo} />
        <img {...estreito} alt={alt} className="az-bela-quadro" />
      </picture>
      {escolhido && (
        <video
          ref={video}
          aria-hidden
          tabIndex={-1}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          poster={escolhido.poster}
          onPlaying={() => setTocando(true)}
          className={`az-bela-quadro az-bela-video ${tocando ? 'az-bela-video-visivel' : ''}`}
        >
          <source src={`${escolhido.video}.webm`} type="video/webm" />
          <source src={`${escolhido.video}.mp4`} type="video/mp4" />
        </video>
      )}
    </div>
  )
}
