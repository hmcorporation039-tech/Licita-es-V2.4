'use client'

import { useEffect } from 'react'

const PERGUNTA = 'Há alterações não salvas no estudo de custos. Sair sem salvar?'

export function useAvisoDeAlteracoesNaoSalvas(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return
    const aoFecharAba = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const aoClicarEmLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const destino = new URL(link.href, window.location.href)
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return
      if (!window.confirm(PERGUNTA)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', aoFecharAba)
    document.addEventListener('click', aoClicarEmLink, true)
    return () => {
      window.removeEventListener('beforeunload', aoFecharAba)
      document.removeEventListener('click', aoClicarEmLink, true)
    }
  }, [sujo])
}
