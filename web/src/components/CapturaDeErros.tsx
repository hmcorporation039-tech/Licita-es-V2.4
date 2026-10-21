'use client'

import { useEffect } from 'react'
import { enviarErroDaTela } from '@/lib/suporte'

export default function CapturaDeErros() {
  useEffect(() => {
    const aoErrar = (e: ErrorEvent) => enviarErroDaTela(e.error ?? e.message)
    const aoRejeitar = (e: PromiseRejectionEvent) => enviarErroDaTela(e.reason)
    window.addEventListener('error', aoErrar)
    window.addEventListener('unhandledrejection', aoRejeitar)
    return () => {
      window.removeEventListener('error', aoErrar)
      window.removeEventListener('unhandledrejection', aoRejeitar)
    }
  }, [])
  return null
}
