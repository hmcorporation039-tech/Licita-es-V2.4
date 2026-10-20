'use client'

import { useEffect, useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import { rastrear } from '@/lib/rastreamento'

interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function jaInstalado(): boolean {
  const navegador = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navegador.standalone === true
}

function ehIphone(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function InstalarApp() {
  const [pedido, setPedido] = useState<PedidoDeInstalacao | null>(null)
  const [iphone, setIphone] = useState(false)
  const [instalado, setInstalado] = useState(true)
  const [mostrarPassos, setMostrarPassos] = useState(false)

  useEffect(() => {
    setInstalado(jaInstalado())
    setIphone(ehIphone())
    const aoPoderInstalar = (e: Event) => {
      e.preventDefault()
      setPedido(e as PedidoDeInstalacao)
    }
    const aoInstalar = () => {
      setInstalado(true)
      setPedido(null)
      rastrear('app_instalado', {})
    }
    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  if (instalado || (!pedido && !iphone)) return null

  async function instalar() {
    if (pedido) {
      await pedido.prompt()
      const escolha = await pedido.userChoice
      rastrear('app_instalar_escolha', { escolha: escolha.outcome })
      setPedido(null)
      return
    }
    setMostrarPassos((atual) => !atual)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/10 p-2 text-nav-ink">
      <button
        type="button"
        onClick={instalar}
        aria-expanded={iphone ? mostrarPassos : undefined}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-white/15 focus-visible:outline-white"
      >
        <Smartphone size={18} aria-hidden />
        <span className="flex flex-col leading-4">
          Instalar o app
          <span className="text-2xs font-normal text-nav-muted">Ícone na tela do celular</span>
        </span>
      </button>
      {mostrarPassos && (
        <div className="relative rounded-lg bg-surface p-3 pr-8 text-xs leading-5 text-ink">
          <button type="button" onClick={() => setMostrarPassos(false)} aria-label="Fechar" className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded text-muted hover:text-ink">
            <X size={14} aria-hidden />
          </button>
          <p className="font-semibold">No iPhone, pelo Safari:</p>
          <ol className="mt-1 list-decimal pl-4">
            <li>
              Toque em <Share size={12} className="inline align-[-1px]" aria-label="Compartilhar" /> Compartilhar.
            </li>
            <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo;.</li>
            <li>Toque em &ldquo;Adicionar&rdquo;.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
