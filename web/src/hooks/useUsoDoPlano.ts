'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ResumoDeCotas } from '@/lib/adminTypes'

// Evento para quem acabou de gastar uma análise pedir que os medidores abertos se atualizem.
export const EVENTO_USO_DO_PLANO = 'uso-do-plano-mudou'
export const avisarMudancaDeUso = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_USO_DO_PLANO))
}

export interface MedidaDeAnalises {
  usadas: number
  // null = sem limite.
  limite: number | null
  restantes: number | null
  percentual: number
  esgotado: boolean
  quaseNoLimite: boolean
  renovaEm: Date | null
  plano: string
}

export function medirAnalises(r: ResumoDeCotas | null): MedidaDeAnalises | null {
  if (!r) return null
  const rec = r.recursos.find((x) => x.recurso === 'analisesIaMes')
  if (!rec) return null
  const limite = r.ilimitado ? null : rec.limite
  const restantes = limite === null ? null : Math.max(0, limite - rec.usado)
  const percentual = limite === null ? 0 : limite === 0 ? 100 : Math.min(100, Math.round((rec.usado / limite) * 100))
  return {
    usadas: rec.usado,
    limite,
    restantes,
    percentual,
    esgotado: limite !== null && rec.usado >= limite,
    quaseNoLimite: limite !== null && limite > 0 && rec.usado < limite && percentual >= 80,
    renovaEm: r.renovaEm ? new Date(r.renovaEm) : null,
    plano: r.plano.nome,
  }
}

export function useUsoDoPlano(ativo = true) {
  const [dados, setDados] = useState<ResumoDeCotas | null>(null)
  const [erro, setErro] = useState(false)

  const recarregar = useCallback(() => {
    api
      .get<ResumoDeCotas>('/api/company/usage')
      .then((r) => {
        setDados(r)
        setErro(false)
      })
      .catch(() => setErro(true))
  }, [])

  useEffect(() => {
    if (!ativo) return
    recarregar()
    window.addEventListener(EVENTO_USO_DO_PLANO, recarregar)
    return () => window.removeEventListener(EVENTO_USO_DO_PLANO, recarregar)
  }, [ativo, recarregar])

  return { dados, erro, medida: medirAnalises(dados), recarregar }
}
