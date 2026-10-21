'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Send } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { ROTULO_DO_STATUS, ROTULO_DO_TIPO, TOM_DO_STATUS, lerErrosRecentes, lerUltimaTela, type StatusDeChamado, type TipoDeChamado } from '@/lib/suporte'
import { Button, Carregando, EmptyState, Field, FormError, Input, Notice, PageHeader, Panel, Select, StatusTag, Textarea } from '@/components/ui'

interface ResumoDoChamado {
  numero: number
  tipo: TipoDeChamado
  status: StatusDeChamado
  assunto: string
  autor: string | null
  mensagens: number
  createdAt: string
  updatedAt: string
}

const TIPOS = Object.keys(ROTULO_DO_TIPO) as TipoDeChamado[]

export default function SuportePage() {
  const user = useRequireSession()
  const [chamados, setChamados] = useState<ResumoDoChamado[] | null>(null)
  const [tipo, setTipo] = useState<TipoDeChamado>('DUVIDA')
  const [assunto, setAssunto] = useState('')
  const [relato, setRelato] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [foraDoAr, setForaDoAr] = useState(false)

  const carregar = useCallback(() => {
    api
      .get<ResumoDoChamado[]>('/api/suporte/chamados')
      .then(setChamados)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 404) setForaDoAr(true)
        else setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar os chamados')
      })
  }, [])

  useEffect(() => {
    if (!user) return
    carregar()
    const pedido = new URLSearchParams(window.location.search).get('tipo')
    if (pedido && TIPOS.includes(pedido as TipoDeChamado)) setTipo(pedido as TipoDeChamado)
  }, [user, carregar])

  async function abrir(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = await api.post<{ numero: number }>('/api/suporte/chamados', { tipo, assunto, relato, tela: lerUltimaTela(), errosRecentes: lerErrosRecentes() })
      setAberto(r.numero)
      setAssunto('')
      setRelato('')
      carregar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível abrir o chamado agora. Tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  if (!user) return null

  return (
    <>
      <PageHeader eyebrow="Ajuda" title="Suporte" description="Conte o que aconteceu ou tire uma dúvida. Respondemos em dias úteis, das 9h às 18h, em até 1 dia útil." />

      {foraDoAr && (
        <Notice tone="warn" title="O suporte pelo sistema está sendo atualizado">
          Enquanto isso, escreva para <strong>suporte@licitabela.com.br</strong> que respondemos por e-mail.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Abrir um chamado">
          <form onSubmit={abrir} className="flex flex-col gap-4">
            {aberto && (
              <Notice tone="ok" title={`Chamado #${aberto} aberto`}>
                Você recebe a resposta por e-mail e aqui no sistema.{' '}
                <Link href={`/suporte/chamados/${aberto}`} className="font-semibold text-accent underline">
                  Acompanhar
                </Link>
              </Notice>
            )}
            <Field label="Assunto do chamado" id="tipo-do-chamado">
              <Select id="tipo-do-chamado" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeChamado)}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_DO_TIPO[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Resumo" id="assunto-do-chamado" required>
              <Input id="assunto-do-chamado" maxLength={120} value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: A análise do edital não termina" />
            </Field>
            <Field label="O que aconteceu" id="relato-do-chamado" required hint={tipo === 'ERRO' ? 'Diga o que você estava fazendo, o que esperava e o que apareceu na tela.' : undefined}>
              <Textarea id="relato-do-chamado" rows={6} maxLength={4000} value={relato} onChange={(e) => setRelato(e.target.value)} />
            </Field>
            <p className="text-xs text-muted">
              Para ajudar a resolver, o chamado leva junto a última tela que você abriu, o navegador, o horário e os códigos dos erros recentes desta sessão. Não escreva senhas nem dados pessoais de terceiros.
            </p>
            <FormError>{erro}</FormError>
            <div>
              <Button type="submit" variant="primary" icon={Send} loading={enviando} disabled={foraDoAr || enviando || assunto.trim().length < 3 || relato.trim().length < 10}>
                Enviar chamado
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="Seus chamados">
          {!chamados && !erro && <Carregando linhas={3} />}
          {chamados && chamados.length === 0 && <EmptyState icon={LifeBuoy} title="Nenhum chamado ainda" description="Quando você abrir um chamado, ele aparece aqui com a resposta do suporte." />}
          {chamados && chamados.length > 0 && (
            <ul className="flex flex-col divide-y divide-line-soft">
              {chamados.map((c) => (
                <li key={c.numero}>
                  <Link href={`/suporte/chamados/${c.numero}`} className="flex flex-col gap-1 py-3 -mx-2 rounded-lg px-2 hover:bg-sunken">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">#{c.numero}</span>
                      <StatusTag tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS[c.status]}</StatusTag>
                      <span className="text-xs text-muted">{ROTULO_DO_TIPO[c.tipo]}</span>
                    </span>
                    <span className="min-w-0 break-words text-sm font-medium text-ink">{c.assunto}</span>
                    <span className="text-xs text-muted">
                      Atualizado em {formatarData(c.updatedAt, { comHora: true })}
                      {c.autor ? ` · ${c.autor}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
