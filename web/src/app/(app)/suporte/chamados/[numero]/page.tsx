'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { ROTULO_DO_STATUS, ROTULO_DO_TIPO, TOM_DO_STATUS, type StatusDeChamado, type TipoDeChamado } from '@/lib/suporte'
import { ListaDeMensagens, ResponderChamado, type MensagemDoChamado } from '@/components/ConversaDoChamado'
import { Carregando, ErrorState, PageHeader, Panel, StatusTag } from '@/components/ui'

interface Chamado {
  numero: number
  tipo: TipoDeChamado
  status: StatusDeChamado
  assunto: string
  relato: string
  autor: string | null
  createdAt: string
  mensagens: MensagemDoChamado[]
}

export default function ChamadoPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = use(params)
  const user = useRequireSession()
  const [chamado, setChamado] = useState<Chamado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api
      .get<Chamado>(`/api/suporte/chamados/${encodeURIComponent(numero)}`)
      .then(setChamado)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar o chamado'))
  }, [numero])

  useEffect(() => {
    if (user) carregar()
  }, [user, carregar])

  if (!user) return null

  return (
    <>
      <PageHeader back={{ href: '/suporte', label: 'Suporte' }} eyebrow={`Chamado #${numero}`} title={chamado?.assunto ?? 'Chamado'} />
      {erro && <ErrorState message={erro} onRetry={() => { setErro(null); carregar() }} />}
      {!chamado && !erro && <Carregando linhas={3} />}
      {chamado && (
        <Panel
          title={
            <span className="flex flex-wrap items-center gap-2">
              <StatusTag tone={TOM_DO_STATUS[chamado.status]}>{ROTULO_DO_STATUS[chamado.status]}</StatusTag>
              <span className="text-sm font-normal text-muted">{ROTULO_DO_TIPO[chamado.tipo]}</span>
            </span>
          }
        >
          <div className="flex flex-col gap-6">
            <ListaDeMensagens relato={chamado.relato} autorDoRelato={chamado.autor} abertoEm={chamado.createdAt} mensagens={chamado.mensagens} ladoDoSuporte={false} />
            <ResponderChamado
              rotulo={chamado.status === 'RESOLVIDO' ? 'Escreva aqui para reabrir o chamado' : 'Escreva uma resposta ao suporte'}
              onEnviar={async (texto) => {
                try {
                  await api.post(`/api/suporte/chamados/${chamado.numero}/mensagens`, { texto })
                  carregar()
                } catch (e) {
                  throw new Error(e instanceof ApiRequestError ? e.message : 'Não foi possível enviar agora')
                }
              }}
            />
          </div>
        </Panel>
      )}
    </>
  )
}
