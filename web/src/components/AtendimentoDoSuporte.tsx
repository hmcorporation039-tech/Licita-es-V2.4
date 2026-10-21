'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessagesSquare, Send } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { lerErrosRecentes, lerUltimaTela } from '@/lib/suporte'
import { Button, Carregando, FormError, Notice, Panel, StatusTag, Textarea, cx } from '@/components/ui'

interface CitacaoDaLei {
  artigo: string
  trecho: string
  conferencia: 'confirmado' | 'parcial'
}

interface Mensagem {
  id: string
  papel: 'USUARIO' | 'ATENDIMENTO' | 'ESPECIALISTA'
  texto: string
  createdAt: string
  citacoes?: CitacaoDaLei[]
  semComprovacao?: boolean
  aviso?: string
  chamado?: number | null
}

interface Cota {
  usadas: number
  limite: number | null
}

interface Conversa {
  disponivel: boolean
  mensagens: Mensagem[]
  cota: Cota
}

const TAMANHO_MAXIMO = 1000

const SUGESTOES = ['Como cadastro um item para monitorar?', 'Quantas análises ainda tenho este mês?', 'Qual o prazo para recorrer no pregão?', 'Deu erro ao analisar o edital']

function CitacaoDaLeiConferida({ citacao }: { citacao: CitacaoDaLei }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink-2">Lei 14.133, art. {citacao.artigo}</span>
        {citacao.conferencia === 'confirmado' ? (
          <StatusTag tone="ok">conferido na lei</StatusTag>
        ) : (
          <StatusTag tone="warn" title="O texto citado é parecido, mas não idêntico ao da lei">
            trecho parecido · confira
          </StatusTag>
        )}
      </span>
      <blockquote className="break-words border-l-2 border-line-strong pl-3 text-xs italic text-ink-2">“{citacao.trecho}”</blockquote>
    </li>
  )
}

function Balao({ m }: { m: Mensagem }) {
  if (m.papel === 'USUARIO') return <p className="self-end whitespace-pre-line break-words rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink sm:max-w-[80%]">{m.texto}</p>
  return (
    <div className="flex flex-col gap-2 self-start rounded-lg border border-line bg-surface px-3 py-3 sm:max-w-[90%]">
      <span className="text-xs font-semibold text-muted">{m.papel === 'ESPECIALISTA' ? 'Especialista em licitações' : 'Atendimento'}</span>
      <p className="max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-ink">{m.texto}</p>
      {m.semComprovacao && <Notice tone="warn">Não localizamos na Lei 14.133 o trecho exato que embasa esta resposta. Confira antes de usar.</Notice>}
      {m.citacoes && m.citacoes.length > 0 && (
        <ul className="flex flex-col gap-3 border-t border-line-soft pt-3">
          {m.citacoes.map((c, i) => (
            <CitacaoDaLeiConferida key={i} citacao={c} />
          ))}
        </ul>
      )}
      {m.aviso && <p className="text-xs text-muted">{m.aviso}</p>}
      {m.chamado && (
        <Link href={`/suporte/chamados/${m.chamado}`} className="self-start text-xs font-semibold text-accent underline">
          Acompanhar o chamado #{m.chamado}
        </Link>
      )}
    </div>
  )
}

export default function AtendimentoDoSuporte({ aoAbrirChamado }: { aoAbrirChamado: () => void }) {
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement | null>(null)

  const carregar = useCallback(() => api.get<Conversa>('/api/suporte/conversa').then(setConversa), [])

  useEffect(() => {
    carregar().catch((e) => {
      if (e instanceof ApiRequestError && e.status === 404) setConversa({ disponivel: false, mensagens: [], cota: { usadas: 0, limite: 0 } })
      else setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar o atendimento')
    })
  }, [carregar])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [conversa?.mensagens.length, enviando])

  async function enviar(mensagem: string) {
    const limpa = mensagem.replace(/\s+/g, ' ').trim()
    if (limpa.length < 2 || enviando) return
    setErro(null)
    setEnviando(limpa)
    try {
      const r = await api.post<{ pergunta: Mensagem; resposta: Mensagem; cota: Cota }>('/api/suporte/conversa', { mensagem: limpa, tela: lerUltimaTela(), errosRecentes: lerErrosRecentes() })
      setConversa((atual) => (atual ? { ...atual, mensagens: [...atual.mensagens, r.pergunta, r.resposta], cota: r.cota } : atual))
      setTexto('')
      if (r.resposta.chamado) aoAbrirChamado()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'O atendimento não conseguiu responder agora. Tente de novo em instantes.')
    } finally {
      setEnviando(null)
    }
  }

  if (conversa && !conversa.disponivel) return null

  const sobram = conversa && conversa.cota.limite !== null ? Math.max(0, conversa.cota.limite - conversa.cota.usadas) : null
  const esgotou = sobram === 0

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <MessagesSquare size={18} aria-hidden />
          Converse com o atendimento
        </span>
      }
      description="Tire dúvidas sobre o sistema ou sobre licitações. Se for um erro ou algo que o atendimento não souber, ele abre um chamado para a equipe."
    >
      <div className="flex flex-col gap-4">
        {!conversa && !erro && <Carregando linhas={2} />}
        {conversa && (
          <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto pr-1">
            {conversa.mensagens.map((m) => (
              <Balao key={m.id} m={m} />
            ))}
            {enviando && (
              <>
                <p className="self-end whitespace-pre-line break-words rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink sm:max-w-[80%]">{enviando}</p>
                <p role="status" className="inline-flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Respondendo…
                </p>
              </>
            )}
            <div ref={fim} />
          </div>
        )}

        {conversa && conversa.mensagens.length === 0 && !enviando && !esgotou && (
          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <Button key={s} variant="secondary" size="sm" onClick={() => void enviar(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {conversa && esgotou && (
          <Notice tone="warn" title="Mensagens do mês esgotadas">
            O seu plano inclui {conversa.cota.limite} mensagens ao atendimento por mês. Você ainda pode abrir um chamado abaixo.
          </Notice>
        )}

        {conversa && !esgotou && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(texto)
            }}
          >
            <label htmlFor="mensagem-ao-atendimento" className="sr-only">
              Sua mensagem ao atendimento
            </label>
            <Textarea
              id="mensagem-ao-atendimento"
              rows={2}
              maxLength={TAMANHO_MAXIMO}
              value={texto}
              disabled={!!enviando}
              placeholder="Escreva sua dúvida. Não escreva senhas nem dados de cartão."
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void enviar(texto)
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cx('text-xs text-muted')}>
                {sobram === null ? 'Sem limite de mensagens no seu plano.' : `${sobram === 1 ? 'Resta 1 mensagem' : `Restam ${sobram} mensagens`} este mês.`}
              </span>
              <Button type="submit" variant="primary" icon={Send} loading={!!enviando} disabled={!!enviando || texto.trim().length < 2}>
                Enviar
              </Button>
            </div>
          </form>
        )}
        <p className="text-xs text-muted">Respostas feitas por inteligência artificial. Podem errar: para decisões importantes, confirme com a equipe ou com um advogado.</p>
        <FormError>{erro}</FormError>
      </div>
    </Panel>
  )
}
