'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui'

const CHAVE = 'licitacao-platform:interesse-petronect'

type Estado = 'carregando' | 'inicial' | 'enviando' | 'registrado' | 'oculto'

export default function InteressePetronect() {
  const [estado, setEstado] = useState<Estado>('carregando')

  useEffect(() => {
    let guardado: string | null = null
    try {
      guardado = window.localStorage.getItem(CHAVE)
    } catch {
      guardado = null
    }
    setEstado(guardado === 'feito' || guardado === 'dispensado' ? 'oculto' : 'inicial')
  }, [])

  function guardar(valor: 'feito' | 'dispensado') {
    try {
      window.localStorage.setItem(CHAVE, valor)
    } catch {
      /* sem localStorage: segue sem lembrar */
    }
  }

  async function registrar() {
    setEstado('enviando')
    try {
      await api.post('/api/interesse', { fonte: 'PETRONECT' })
    } catch {
      /* mesmo se falhar, não insistimos — é só um sinal de interesse */
    }
    guardar('feito')
    setEstado('registrado')
  }

  function dispensar() {
    guardar('dispensado')
    setEstado('oculto')
  }

  if (estado === 'carregando' || estado === 'oculto') return null

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-accent-soft/40 px-4 py-3">
      {estado === 'registrado' ? (
        <p className="text-sm text-ink">Valeu! Registramos seu interesse na Petrobras (Petronect). Se tiver procura, a gente adiciona.</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-ink">A Bela ainda não cobre o Petronect (Petrobras).</p>
            <p className="text-xs text-muted">Vende ou quer vender pra Petrobras? Avise que você quer essa fonte — a gente prioriza pela procura.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" loading={estado === 'enviando'} onClick={registrar}>
              Quero a Petrobras
            </Button>
            <button type="button" onClick={dispensar} aria-label="Dispensar" className="inline-flex size-8 items-center justify-center rounded text-muted hover:bg-line-soft hover:text-ink">
              <X size={16} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
