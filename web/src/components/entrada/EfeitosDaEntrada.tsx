'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { guardarUtm } from '@/lib/rastreamento'

export default function EfeitosDaEntrada() {
  const router = useRouter()

  useEffect(() => {
    guardarUtm()
    if (getSessionUser()) router.replace('/dashboard')
  }, [router])

  return null
}
