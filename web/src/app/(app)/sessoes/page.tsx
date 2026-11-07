'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import type { MensagemDoPregoeiro } from '@/components/ChatDoPregoeiro'
import { Carregando, EmptyState, ErrorState, PageHeader, Panel, StatusTag, cx } from '@/components/ui'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'

interface Sessao {
  tenderId: string
  objeto: string
  orgao: string | null
  numeroControle: string | null
  fonte: string
  sessaoEm: string | null
  naoLidas: number
  urgentes: number
  ultimaMensagem: MensagemDoPregoeiro | null
}

const INTERVALO_MS = 20_000

function quando(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

// "Minhas sessões": as disputas que a empresa acompanha, com o chat do pregoeiro de
// cada uma. Quem pede ação (convocação, documento, negociação) aparece primeiro.
export default function SessoesPage() {
  const user = useRequireSession()
  const [sessoes, setSessoes] = useState<Sessao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelado = false
    const ler = () =>
      api
        .get<{ sessoes: Sessao[] }>('/api/sessoes')
        .then((r) => {
          if (!cancelado) {
            setSessoes(r.sessoes)
            setErro(null)
          }
        })
        .catch((e) => {
          if (!cancelado) setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar as sessões.')
        })
    void ler()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void ler()
    }, INTERVALO_MS)
    return () => {
      cancelado = true
      clearInterval(timer)
    }
  }, [user, tentativa])

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Minhas sessões"
        description="As disputas que você acompanha pela Bela, com o chat do pregoeiro de cada uma. Atualiza sozinha enquanto a página está aberta."
      />
      {erro ? (
        <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
      ) : !sessoes ? (
        <Carregando linhas={4} texto="Carregando as sessões…" />
      ) : sessoes.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Nenhuma sessão acompanhada"
          description="Abra uma licitação escolhida e entre em “Pregão com a Bela”. Com a extensão ligada na sala de disputa, o chat do pregoeiro aparece aqui."
        />
      ) : (
        <Panel padding="none" title={`${sessoes.length} ${sessoes.length === 1 ? 'sessão' : 'sessões'}`}>
          <ul className="flex flex-col divide-y divide-line-soft">
            {sessoes.map((s) => (
              <li key={s.tenderId}>
                <Link href={`/tenders/${s.tenderId}/pregao`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-sunken focus-visible:bg-sunken">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.objeto}</span>
                    {s.urgentes > 0 && <StatusTag tone="danger" dot>{s.urgentes === 1 ? '1 pede ação' : `${s.urgentes} pedem ação`}</StatusTag>}
                    {s.naoLidas > 0 && <StatusTag tone="accent">{s.naoLidas === 1 ? '1 nova' : `${s.naoLidas} novas`}</StatusTag>}
                  </div>
                  <p className="text-xs text-muted">
                    {[s.orgao, ROTULOS_DE_FONTE[s.fonte] ?? s.fonte, s.sessaoEm ? `sessão ${quando(s.sessaoEm)}` : null].filter(Boolean).join(' · ')}
                  </p>
                  {s.ultimaMensagem && (
                    <p className={cx('line-clamp-2 text-sm', s.ultimaMensagem.urgente && !s.ultimaMensagem.lida ? 'text-ink' : 'text-ink-2')}>
                      <span className="font-mono text-xs text-faint">{quando(s.ultimaMensagem.createdAt)}</span>{' '}
                      {s.ultimaMensagem.autor ? `${s.ultimaMensagem.autor}: ` : ''}
                      {s.ultimaMensagem.texto}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
