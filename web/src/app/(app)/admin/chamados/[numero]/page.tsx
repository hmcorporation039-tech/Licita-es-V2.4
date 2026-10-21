'use client'

import { use, useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { ROTULO_DO_STATUS, ROTULO_DO_TIPO, TOM_DO_STATUS, type ErroRecente, type StatusDeChamado, type TipoDeChamado } from '@/lib/suporte'
import { ListaDeMensagens, ResponderChamado, type MensagemDoChamado } from '@/components/ConversaDoChamado'
import DiagnosticoDoChamado, { type Diagnostico } from '@/components/DiagnosticoDoChamado'
import { Carregando, DescriptionList, ErrorState, Panel, Select, StatusTag } from '@/components/ui'

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
}

interface ChamadoDoAdmin {
  numero: number
  tipo: TipoDeChamado
  status: StatusDeChamado
  origem: string
  assunto: string
  relato: string
  createdAt: string
  contexto: { tela?: string | null; navegador?: string | null; horario?: string; versao?: string | null; errosRecentes?: ErroRecente[] }
  diagnostico: Diagnostico | null
  diagnosticoStatus: string | null
  diagnosticoEm: string | null
  company: { id: string; name: string; planCode: string }
  user: { name: string | null; email: string; companyRole: string } | null
  mensagens: Array<{ id: string; autor: 'CLIENTE' | 'SUPORTE'; texto: string; createdAt: string; user: { name: string | null } | null }>
  erros: ErroGuardado[]
}

const STATUS = Object.keys(ROTULO_DO_STATUS) as StatusDeChamado[]

export default function AdminChamadoPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = use(params)
  return <AdminShell titulo={`Chamado #${numero}`}>{() => <Conteudo numero={numero} />}</AdminShell>
}

function Conteudo({ numero }: { numero: string }) {
  const [c, setC] = useState<ChamadoDoAdmin | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api
      .get<ChamadoDoAdmin>(`/api/admin/chamados/${encodeURIComponent(numero)}`)
      .then(setC)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [numero])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro)
    return (
      <ErrorState
        message={erro}
        onRetry={() => {
          setErro(null)
          carregar()
        }}
      />
    )
  if (!c) return <Carregando linhas={5} />

  const mensagens: MensagemDoChamado[] = c.mensagens.map((m) => ({ id: m.id, autor: m.autor, texto: m.texto, createdAt: m.createdAt, nome: m.user?.name ?? null }))
  const errosDaTela = c.contexto.errosRecentes ?? []

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel
          title={c.assunto}
          actions={
            <Select
              aria-label="Situação do chamado"
              value={c.status}
              onChange={(e) =>
                api
                  .patch(`/api/admin/chamados/${c.numero}`, { status: e.target.value })
                  .then(carregar)
                  .catch((err) => setErro(err instanceof ApiRequestError ? err.message : 'Erro ao mudar a situação'))
              }
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_DO_STATUS[s]}
                </option>
              ))}
            </Select>
          }
        >
          <div className="flex flex-col gap-6">
            <ListaDeMensagens relato={c.relato} autorDoRelato={c.user?.name ?? c.user?.email ?? null} abertoEm={c.createdAt} mensagens={mensagens} ladoDoSuporte />
            <ResponderChamado
              rotulo="Resposta ao cliente (vai por e-mail e aparece no sistema)"
              permitirResolver
              onEnviar={async (texto, resolver) => {
                try {
                  await api.post(`/api/admin/chamados/${c.numero}/mensagens`, { texto, resolver })
                  carregar()
                } catch (e) {
                  throw new Error(e instanceof ApiRequestError ? e.message : 'Não foi possível enviar agora')
                }
              }}
            />
          </div>
        </Panel>
        <DiagnosticoDoChamado numero={c.numero} diagnostico={c.diagnostico} status={c.diagnosticoStatus} geradoEm={c.diagnosticoEm} onAtualizar={carregar} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Quem e onde">
          <DescriptionList
            columns={1}
            items={[
              { label: 'Situação', value: <StatusTag tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS[c.status]}</StatusTag> },
              { label: 'Tipo', value: `${ROTULO_DO_TIPO[c.tipo]}${c.origem === 'ATENDIMENTO' ? ' (aberto pelo atendimento)' : ''}` },
              { label: 'Empresa', value: `${c.company.name} · plano ${c.company.planCode}` },
              { label: 'Usuário', value: c.user ? `${c.user.name ? `${c.user.name} · ` : ''}${c.user.email} (${c.user.companyRole === 'OWNER' ? 'dono' : 'membro'})` : 'usuário removido' },
              { label: 'Aberto em', value: formatarData(c.createdAt, { comHora: true }) },
              { label: 'Última tela', value: c.contexto.tela ?? '—', mono: true },
              { label: 'Navegador', value: c.contexto.navegador ?? '—' },
              { label: 'Versão no ar', value: c.contexto.versao ?? '—', mono: true },
            ]}
          />
        </Panel>
        <Panel title={`Erros que o cliente viu (${errosDaTela.length})`}>
          {errosDaTela.length === 0 ? (
            <p className="text-sm text-muted">Nenhum erro registrado na sessão do cliente.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-xs">
              {errosDaTela.map((e, i) => (
                <li key={i} className="break-words rounded-lg border border-line-soft p-2">
                  <span className="font-mono">{e.status ?? 'tela'}</span> {e.rota} — {e.mensagem}
                  <span className="block text-muted">
                    {e.quando ? formatarData(e.quando, { comHora: true }) : ''} {e.codigo ? `· ${e.codigo}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Erros guardados no sistema (${c.erros.length})`} description="Pelo código de rastreio e pelo usuário, até 30 minutos antes do chamado.">
          {c.erros.length === 0 ? (
            <p className="text-sm text-muted">Nenhum erro do servidor ou da tela ligado a este chamado.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-xs">
              {c.erros.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-line-soft p-2">
                  <span className="break-words font-medium text-ink">
                    {e.origem} · {e.metodo ?? ''} {e.rota ?? e.tela ?? ''} {e.status ? `· ${e.status}` : ''}
                  </span>
                  <span className="break-words">{e.mensagem}</span>
                  {e.pilha && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-sunken p-2 font-mono text-2xs">{e.pilha}</pre>}
                  <span className="text-muted">
                    {formatarData(e.createdAt, { comHora: true })} · {e.codigoDeRastreio ?? 'sem código'} · versão {e.versao ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
