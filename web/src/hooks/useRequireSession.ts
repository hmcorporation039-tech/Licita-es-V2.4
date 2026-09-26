'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionUser, SessionUser } from '@/lib/session'

// Redireciona para /login se não houver usuário na sessão; enquanto isso
// retorna null para as páginas não renderizarem conteúdo prematuramente.
export function useRequireSession(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null)
  const router = useRouter()

  useEffect(() => {
    const sessionUser = getSessionUser()
    if (!sessionUser) {
      router.push('/login')
      return
    }
    setUser(sessionUser)
  }, [router])

  return user
}
