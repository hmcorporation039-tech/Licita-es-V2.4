'use client'

// ============================================================
// hooks/useFavoritas.ts — Estado das licitações favoritadas ("Minhas salvas").
// Carrega uma vez o conjunto de ids favoritados (/api/tenders/favoritas/ids)
// e expõe alternar(id) otimista. Degrada em silêncio se a API ainda não tem
// a rota (deploy da web antes do backend): trata como "nenhuma favorita".
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export function useFavoritas(ativo = true) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    api
      .get<{ ids: string[] }>('/api/tenders/favoritas/ids')
      .then((r) => {
        if (vivo) setIds(new Set(r.ids))
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setPronto(true)
      })
    return () => {
      vivo = false
    }
  }, [ativo])

  const alternar = useCallback(async (tenderId: string) => {
    let marcar = false
    setIds((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(tenderId)) proximo.delete(tenderId)
      else {
        proximo.add(tenderId)
        marcar = true
      }
      return proximo
    })
    try {
      if (marcar) await api.post(`/api/tenders/${tenderId}/favorito`)
      else await api.delete(`/api/tenders/${tenderId}/favorito`)
    } catch {
      // Falhou no servidor — desfaz a mudança otimista.
      setIds((atual) => {
        const proximo = new Set(atual)
        if (marcar) proximo.delete(tenderId)
        else proximo.add(tenderId)
        return proximo
      })
    }
  }, [])

  return { ids, pronto, ehFavorita: (id: string) => ids.has(id), alternar }
}
