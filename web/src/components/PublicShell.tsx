import Link from 'next/link'

// Moldura das páginas públicas (sem login): cabeçalho com entrar/criar conta e
// rodapé com os documentos legais.
export default function PublicShell({ children, estreito = false }: { children: React.ReactNode; estreito?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold text-slate-900">
            Monitor de Licitações
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              Entrar
            </Link>
            <Link href="/cadastro" className="rounded bg-indigo-700 px-3 py-1.5 font-medium text-white hover:bg-indigo-800">
              Teste grátis
            </Link>
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-8 ${estreito ? 'max-w-md' : 'max-w-5xl'}`}>{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500">
          <span>© Monitor de Licitações</span>
          <span className="flex gap-4">
            <Link href="/termos" className="hover:underline">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:underline">
              Política de Privacidade
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
