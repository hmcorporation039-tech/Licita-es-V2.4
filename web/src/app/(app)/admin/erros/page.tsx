'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { Button, Carregando, EmptyState, ErrorState, Select } from '@/components/ui'

interface ErroGuardado {
  id: string
  origem: string
  codigoDeRastreio: string | null
  metodo: string | null
  rota: string | null
  status: number | null
  mensagem: string
  pilha: string | null
  tela: string | null
  versao: string | null
  createdAt: string
  company: { name: string } | null
}

interface PaginaDeErros {
  erros: ErroGuardado[]
  total: number
  pagina: number
  porPagina: number
}

export default function AdminErrosPage() {
  return <AdminShell titulo="Erros do sistema">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [origem, setOrigem] = useState('')
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<PaginaDeErros | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setDados(null)
    const busca = new URLSearchParams({ pagina: String(pagina), ...(origem ? { origem } : {}) })
    api
      .get<PaginaDeErros>(`/api/admin/erros?${busca}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [origem, pagina])

  useEffect(() => {
    carregar()
  }, [carregar])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Origem do erro"
          value={origem}
          onChange={(e) => {
            setPagina(1)
            setOrigem(e.target.value)
          }}
          className="w-auto"
        >
          <option value="">Todas as origens</option>
          <option value="api">API</option>
          <option value="web">Tela</option>
          <option value="worker">Rotinas</option>
        </Select>
        <p className="text-sm text-muted">Guardados por 30 dias, sem senhas nem chaves.</p>
      </div>
      {erro && (
        <ErrorState
          message={erro}
          onRetry={() => {
            setErro(null)
            carregar()
          }}
        />
      )}
      {!dados && !erro && <Carregando linhas={4} />}
      {dados && dados.erros.length === 0 && <EmptyState title="Nenhum erro guardado" description="Quando algo quebrar na API, na tela ou nas rotinas, aparece aqui." />}
      {dados && dados.erros.length > 0 && (
        <ul className="flex flex-col gap-3">
          {dados.erros.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3 text-sm">
              <span className="break-words font-medium text-ink">
                {e.origem} · {e.metodo ?? ''} {e.rota ?? e.tela ?? ''} {e.status ? `· ${e.status}` : ''}
              </span>
              <span className="break-words text-ink-2">{e.mensagem}</span>
              {e.pilha && (
                <details>
                  <summary className="cursor-pointer text-xs text-accent">Ver onde estourou</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-sunken p-2 font-mono text-2xs">{e.pilha}</pre>
                </details>
              )}
              <span className="text-xs text-muted">
                {formatarData(e.createdAt, { comHora: true })} · {e.company?.name ?? 'sem empresa'} · {e.codigoDeRastreio ?? 'sem código'} · versão {e.versao ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dados && paginas > 1 && (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted">
            Página {pagina} de {paginas}
          </span>
          <Button size="sm" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}
