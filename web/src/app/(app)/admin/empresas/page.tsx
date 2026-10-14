'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import AdminShell, { RotuloDoPlano, useNomesDosPlanos } from '@/components/AdminShell'
import { formatarData } from '@/lib/datas'
import { api, ApiRequestError } from '@/lib/api'
import type { EmpresaResumo } from '@/lib/adminTypes'
import { Button, Carregando, EmptyState, ErrorState, Field, Input, StatusTag, Table, TableWrap, Td, TextLink, THead, Th, Tr } from '@/components/ui'

interface Lista {
  total: number
  page: number
  limit: number
  empresas: EmpresaResumo[]
}

const nf = new Intl.NumberFormat('pt-BR')

export default function AdminEmpresasPage() {
  return <AdminShell titulo="Empresas">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [dados, setDados] = useState<Lista | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const nomesDosPlanos = useNomesDosPlanos()

  const carregar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q.trim()) params.set('q', q.trim())
      setDados(await api.get<Lista>(`/api/admin/companies?${params}`))
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [q, page])

  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
  }, [carregar])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limit)) : 1

  return (
    <div className="flex flex-col gap-4">
      <Field label="Buscar empresa" className="w-full max-w-md">
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Nome, CNPJ ou e-mail"
        />
      </Field>

      {erro && <ErrorState message={erro} onRetry={carregar} />}

      {!dados && !erro && <Carregando linhas={6} />}

      {dados && dados.empresas.length === 0 && (
        <EmptyState
          title="Nenhuma empresa encontrada."
          description={q.trim() ? 'Nenhum nome, CNPJ ou e-mail corresponde à busca. Tente outro termo.' : 'Ainda não há empresas cadastradas na plataforma.'}
        />
      )}

      {dados && dados.empresas.length > 0 && (
        <TableWrap minWidth={820}>
          <Table>
            <THead>
              <tr>
                <Th>Empresa</Th>
                <Th>Plano</Th>
                <Th align="right">Usuários</Th>
                <Th align="right">Itens</Th>
                <Th align="right">Docs</Th>
                <Th align="right">IA/mês</Th>
                <Th align="right">Criada em</Th>
              </tr>
            </THead>
            <tbody>
              {dados.empresas.map((e) => (
                <Tr key={e.id} interactive>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <TextLink href={`/admin/empresas/${e.id}`}>
                        {e.nome}
                      </TextLink>
                      {e.cnpj || e.cpf ? (
                        <span className="font-mono text-xs text-muted">{e.cnpj ?? e.cpf}</span>
                      ) : (
                        <span className="text-xs text-muted">{e.tipo === 'PESSOA_FISICA' ? 'pessoa física' : '—'}</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RotuloDoPlano codigo={e.planCode} nome={nomesDosPlanos[e.planCode]} />
                      {e.quotaOverrides && (
                        <StatusTag tone="accent" title="Limites combinados só com esta empresa">
                          ajustado
                        </StatusTag>
                      )}
                    </div>
                  </Td>
                  <Td numeric>{nf.format(e.usuarios)}</Td>
                  <Td numeric>{nf.format(e.itensMonitorados)}</Td>
                  <Td numeric>{nf.format(e.documentos)}</Td>
                  <Td numeric>{nf.format(e.analisesIaNoMes)}</Td>
                  <Td numeric muted>
                    {formatarData(e.criadaEm)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {dados && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>
            <span className="font-mono text-ink-2">{nf.format(dados.total)}</span> empresa(s)
          </span>
          <nav aria-label="Paginação" className="flex items-center gap-2">
            <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="font-mono text-ink-2" aria-live="polite">
              {page} / {paginas}
            </span>
            <Button size="sm" iconRight={ChevronRight} disabled={page >= paginas} onClick={() => setPage(page + 1)}>
              Próxima
            </Button>
          </nav>
        </div>
      )}
    </div>
  )
}
