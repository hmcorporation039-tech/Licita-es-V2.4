'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { ROTULO_DO_STATUS, ROTULO_DO_TIPO, TOM_DO_STATUS, type StatusDeChamado, type TipoDeChamado } from '@/lib/suporte'
import { Carregando, EmptyState, ErrorState, StatusTag, Table, TableWrap, Td, Th, THead, Tr, cx } from '@/components/ui'

interface LinhaDoChamado {
  numero: number
  tipo: TipoDeChamado
  status: StatusDeChamado
  origem: string
  assunto: string
  diagnosticoStatus: string | null
  createdAt: string
  updatedAt: string
  company: { id: string; name: string }
  user: { name: string | null; email: string } | null
  mensagens: number
}

interface ListaDeChamados {
  chamados: LinhaDoChamado[]
  porStatus: Record<string, number>
}

const FILTROS: Array<{ valor: StatusDeChamado | ''; rotulo: string }> = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'ABERTO', rotulo: 'Abertos' },
  { valor: 'EM_ANALISE', rotulo: 'Em análise' },
  { valor: 'AGUARDANDO_CLIENTE', rotulo: 'Respondidos' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvidos' },
]

export default function AdminChamadosPage() {
  return <AdminShell titulo="Chamados de suporte">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [status, setStatus] = useState<StatusDeChamado | ''>('ABERTO')
  const [dados, setDados] = useState<ListaDeChamados | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setDados(null)
    api
      .get<ListaDeChamados>(`/api/admin/chamados${status ? `?status=${status}` : ''}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [status])

  useEffect(() => {
    carregar()
  }, [carregar])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por situação">
        {FILTROS.map((f) => (
          <button
            key={f.rotulo}
            type="button"
            aria-pressed={status === f.valor}
            onClick={() => setStatus(f.valor)}
            className={cx('rounded-full border px-3 py-1 text-sm font-medium', status === f.valor ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')}
          >
            {f.rotulo}
            {f.valor && dados?.porStatus[f.valor] ? <span className="ml-1 font-mono text-xs">{dados.porStatus[f.valor]}</span> : null}
          </button>
        ))}
        <Link href="/admin/erros" className="ml-auto text-sm font-semibold text-accent hover:underline">
          Erros do sistema
        </Link>
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
      {dados && dados.chamados.length === 0 && <EmptyState title="Nenhum chamado aqui" description="Quando um cliente abrir um chamado, ele aparece nesta lista e você recebe um aviso." />}
      {dados && dados.chamados.length > 0 && (
        <TableWrap minWidth={760}>
          <Table>
            <THead>
              <tr>
                <Th>#</Th>
                <Th>Assunto</Th>
                <Th>Empresa</Th>
                <Th>Situação</Th>
                <Th>Atualizado</Th>
              </tr>
            </THead>
            <tbody>
              {dados.chamados.map((c) => (
                <Tr key={c.numero} interactive>
                  <Td className="font-mono text-xs">
                    <Link href={`/admin/chamados/${c.numero}`} className="text-accent hover:underline">
                      #{c.numero}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/chamados/${c.numero}`} className="flex flex-col hover:underline">
                      <span className="font-medium text-ink">{c.assunto}</span>
                      <span className="text-xs text-muted">
                        {ROTULO_DO_TIPO[c.tipo]}
                        {c.origem === 'ATENDIMENTO' ? ' · aberto pelo atendimento' : ''}
                        {c.diagnosticoStatus === 'PRONTO' ? ' · diagnóstico pronto' : ''}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex flex-col">
                      <span>{c.company.name}</span>
                      <span className="text-xs text-muted">{c.user?.name ?? c.user?.email ?? 'usuário removido'}</span>
                    </span>
                  </Td>
                  <Td>
                    <StatusTag tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS[c.status]}</StatusTag>
                  </Td>
                  <Td muted>{formatarData(c.updatedAt, { comHora: true })}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  )
}
