'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionUser } from '@/lib/session'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace(getSessionUser() ? '/dashboard' : '/login')
  }, [router])

  return null
}
