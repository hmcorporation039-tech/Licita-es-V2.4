'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavegacaoPublica() {
  const caminho = usePathname()
  const naEntrada = caminho === '/login'
  const noCadastro = caminho === '/cadastro'

  return (
    <nav aria-label="Conta" className="pb-topo-acoes">
      {!naEntrada && (
        <Link href="/login" className={`pb-pilula pb-pilula-vazada${noCadastro ? '' : ' pb-topo-secundario'}`}>
          Entrar
        </Link>
      )}
      {!noCadastro && (
        <Link href="/cadastro" className="pb-pilula pb-pilula-branca">
          Teste grátis
        </Link>
      )}
    </nav>
  )
}
