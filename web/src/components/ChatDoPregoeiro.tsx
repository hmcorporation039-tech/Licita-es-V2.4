'use client'

import { useEffect, useState } from 'react'
import { CheckCheck, MessageSquareWarning } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, Notice, Panel, StatusTag, cx } from '@/components/ui'

export interface MensagemDoPregoeiro {
  id: string
  autor: string | null
  texto: string
  categoria: 'CONVOCACAO' | 'DOCUMENTO' | 'NEGOCIACAO' | 'SUSPENSAO' | 'RETOMADA' | 'ENCERRAMENTO' | 'AVISO'
  rotulo: string
  citaAEmpresa: boolean
  urgente: boolean
  lida: boolean
  createdAt: string
}

interface RespostaDoChat {
  mensagens: MensagemDoPregoeiro[]
  naoLidas: number
}

const INTERVALO_MS = 15_000

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

// Chat do pregoeiro lido pela extensão da Bela na sala de disputa. Atualiza sozinho
// a cada 15 s enquanto a página está aberta.
export default function ChatDoPregoeiro({ tenderId }: { tenderId: string }) {
  const [chat, setChat] = useState<RespostaDoChat | null>(null)
  const [marcando, setMarcando] = useState(false)

  useEffect(() => {
    let cancelado = false
    const ler = () =>
      api
        .get<RespostaDoChat>(`/api/tenders/${tenderId}/pregao/mensagens`)
        .then((r) => {
          if (!cancelado) setChat(r)
        })
        .catch(() => undefined)
    void ler()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void ler()
    }, INTERVALO_MS)
    return () => {
      cancelado = true
      clearInterval(timer)
    }
  }, [tenderId])

  async function marcarLidas() {
    setMarcando(true)
    try {
      setChat(await api.post<RespostaDoChat>(`/api/tenders/${tenderId}/pregao/mensagens/lidas`, {}))
    } catch {
      /* tenta de novo no próximo clique */
    } finally {
      setMarcando(false)
    }
  }

  const urgenteNaoLida = chat?.mensagens.find((m) => m.urgente && !m.lida)

  return (
    <Panel
      title="Chat do pregoeiro"
      description="Lido pela extensão da Bela na sala de disputa aberta no seu computador. Quando chamarem a sua empresa, a Bela avisa aqui e no celular."
      actions={
        chat && chat.naoLidas > 0 ? (
          <Button size="sm" variant="secondary" icon={CheckCheck} loading={marcando} onClick={marcarLidas}>
            Marcar {chat.naoLidas === 1 ? '1 como lida' : `${chat.naoLidas} como lidas`}
          </Button>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-3"
    >
      {urgenteNaoLida && (
        <Notice tone="danger" title={`${urgenteNaoLida.rotulo}${urgenteNaoLida.citaAEmpresa ? ' para a sua empresa' : ''}`}>
          {urgenteNaoLida.texto}
        </Notice>
      )}
      {!chat || chat.mensagens.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma mensagem ainda. Com a extensão “Bela na disputa” ligada e a sala de disputa aberta, as mensagens do pregoeiro aparecem aqui.
        </p>
      ) : (
        <ul className="flex max-h-[420px] flex-col divide-y divide-line-soft overflow-y-auto rounded-lg border border-line" aria-live="polite">
          {chat.mensagens.map((m) => (
            <li key={m.id} className={cx('flex flex-col gap-1 px-3 py-2.5 text-sm', !m.lida && 'bg-accent-soft/40')}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono">{hora(m.createdAt)}</span>
                {m.autor && <span className="font-medium text-ink-2">{m.autor}</span>}
                {m.categoria !== 'AVISO' && (
                  <StatusTag tone={m.urgente ? 'danger' : 'neutral'}>
                    {m.urgente && <MessageSquareWarning size={12} className="mr-1 inline" aria-hidden />}
                    {m.rotulo}
                  </StatusTag>
                )}
                {m.citaAEmpresa && <StatusTag tone="warn">cita a sua empresa</StatusTag>}
              </div>
              <p className="break-words text-ink">{m.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
