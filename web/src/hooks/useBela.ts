'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { belaFalaAsRespostas, calar, definirBelaFalaAsRespostas, falaDisponivel, falar, ouvir, vozDisponivel, type EscutaEmAndamento } from '@/lib/bela'

export function useEscuta() {
  const [disponivel, setDisponivel] = useState(false)
  const [verificado, setVerificado] = useState(false)
  const [ouvindo, setOuvindo] = useState(false)
  const [parcial, setParcial] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const escuta = useRef<EscutaEmAndamento | null>(null)

  useEffect(() => {
    setDisponivel(vozDisponivel())
    setVerificado(true)
    return () => escuta.current?.cancelar()
  }, [])

  const alternar = useCallback(async (): Promise<string | null> => {
    if (escuta.current) {
      escuta.current.parar()
      return null
    }
    calar()
    setErro(null)
    setParcial('')
    setOuvindo(true)
    const atual = ouvir({ onParcial: setParcial })
    escuta.current = atual
    try {
      const texto = await atual.promessa
      return texto || null
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ouvir. Tente de novo.')
      return null
    } finally {
      escuta.current = null
      setOuvindo(false)
    }
  }, [])

  const cancelar = useCallback(() => {
    escuta.current?.cancelar()
    setParcial('')
    setErro(null)
  }, [])

  return { disponivel, verificado, ouvindo, parcial, erro, alternar, cancelar }
}

export function useFalaDaBela() {
  const [disponivel, setDisponivel] = useState(false)
  const [ligada, setLigada] = useState(true)
  const ligadaRef = useRef(true)

  useEffect(() => {
    const preferencia = belaFalaAsRespostas()
    setDisponivel(falaDisponivel())
    setLigada(preferencia)
    ligadaRef.current = preferencia
    if (falaDisponivel()) window.speechSynthesis.getVoices()
  }, [])

  const mudar = useCallback((nova: boolean) => {
    setLigada(nova)
    ligadaRef.current = nova
    definirBelaFalaAsRespostas(nova)
    if (!nova) calar()
  }, [])

  const dizer = useCallback((texto: string) => {
    if (ligadaRef.current) falar(texto)
  }, [])

  return { disponivel, ligada, mudar, dizer, calar }
}
