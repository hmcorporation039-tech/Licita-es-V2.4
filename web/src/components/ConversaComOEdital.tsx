'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquareText, Send } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { Button, Carregando, FormError, Notice, StatusTag, Textarea } from '@/components/ui'

type Situacao = 'sem-analise' | 'nao-preparada' | 'preparando' | 'pronta' | 'sem-texto' | 'falhou'

interface Citacao {
  documento: string
  pagina: string | null
  trecho: string
  conferencia: 'confirmado' | 'parcial'
}

interface Pergunta {
  id: string
  pergunta: string
  autor: string | null
  createdAt: string
  resposta: { texto: string; encontrado: boolean; semComprovacao: boolean; citacoes: Citacao[] }
}

interface Cota {
  usadas: number
  limite: number | null
}

interface Conversa {
  disponivel: boolean
  situacao: Situacao
  documentos: { nome: string; paginas: number; escaneado: boolean }[]
  perguntas: Pergunta[]
  cota: Cota
}

const TAMANHO_MAXIMO = 500
const INTERVALO_DE_ESPERA_MS = 4000
const ESPERA_MAXIMA_MS = 4 * 60 * 1000

const SUGESTOES = [
  'Precisa de visita técnica?',
  'Qual é o prazo de entrega?',
  'Tem benefício para ME/EPP?',
  'Que atestados de capacidade técnica são exigidos?',
  'Qual garantia é exigida?',
]

function restantes(cota: Cota): number | null {
  return cota.limite === null ? null : Math.max(0, cota.limite - cota.usadas)
}

function CitacaoDoEdital({ citacao }: { citacao: Citacao }) {
  const confirmada = citacao.conferencia === 'confirmado'
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="min-w-0 break-words font-medium text-ink-2">{citacao.documento}</span>
        {confirmada ? (
          <StatusTag tone="ok">{citacao.pagina ? `p. ${citacao.pagina} · conferido no edital` : 'conferido no edital'}</StatusTag>
        ) : (
          <StatusTag tone="warn" title="O texto citado é parecido, mas não idêntico ao do documento">
            trecho parecido · confira
          </StatusTag>
        )}
      </div>
      <blockquote className="break-words border-l-2 border-line-strong pl-3 text-xs italic text-ink-2">“{citacao.trecho}”</blockquote>
    </li>
  )
}

function Resposta({ item }: { item: Pergunta }) {
  const { resposta } = item
  return (
    <li className="flex flex-col gap-2">
      <p className="self-end rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink sm:max-w-[80%]">
        {item.pergunta}
        {item.autor && <span className="mt-0.5 block text-xs text-muted">{item.autor}</span>}
      </p>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:max-w-[90%]">
        {!resposta.encontrado && (
          <span>
            <StatusTag tone="neutral">Não está nos documentos</StatusTag>
          </span>
        )}
        <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-ink">{resposta.texto}</p>
        {resposta.semComprovacao && (
          <Notice tone="warn">Não localizamos no edital o trecho exato que embasa esta resposta. Confira no documento antes de confiar.</Notice>
        )}
        {resposta.citacoes.length > 0 && (
          <ul className="flex flex-col gap-3 border-t border-line-soft pt-3">
            {resposta.citacoes.map((c, i) => (
              <CitacaoDoEdital key={i} citacao={c} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default function ConversaComOEdital({ tenderId }: { tenderId: string }) {
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const inicioDaEspera = useRef<number | null>(null)
  const fim = useRef<HTMLDivElement | null>(null)

  const carregar = useCallback(() => api.get<Conversa>(`/api/tenders/${tenderId}/conversa`).then(setConversa), [tenderId])

  useEffect(() => {
    carregar().catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar a conversa com o edital'))
  }, [carregar])

  useEffect(() => {
    if (!conversa?.disponivel) return
    if (conversa.situacao === 'nao-preparada') {
      api
        .post<{ situacao: Situacao }>(`/api/tenders/${tenderId}/conversa/preparar`)
        .then((r) => setConversa((atual) => (atual ? { ...atual, situacao: r.situacao } : atual)))
        .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível preparar o edital para a conversa'))
      return
    }
    if (conversa.situacao !== 'preparando') {
      inicioDaEspera.current = null
      return
    }
    inicioDaEspera.current ??= Date.now()
    if (Date.now() - inicioDaEspera.current > ESPERA_MAXIMA_MS) return
    const espera = setTimeout(() => void carregar().catch(() => undefined), INTERVALO_DE_ESPERA_MS)
    return () => clearTimeout(espera)
  }, [conversa, tenderId, carregar])

  useEffect(() => {
    if (enviando) fim.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [enviando])

  async function perguntar(texto: string) {
    const limpa = texto.replace(/\s+/g, ' ').trim()
    if (limpa.length < 3 || enviando) return
    setErro(null)
    setEnviando(limpa)
    try {
      const r = await api.post<{ pergunta: Pergunta; cota: Cota }>(`/api/tenders/${tenderId}/conversa/perguntas`, { pergunta: limpa })
      setConversa((atual) => (atual ? { ...atual, perguntas: [...atual.perguntas, r.pergunta], cota: r.cota } : atual))
      setPergunta('')
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível responder agora. Tente de novo em instantes.')
    } finally {
      setEnviando(null)
    }
  }

  if (conversa && (!conversa.disponivel || conversa.situacao === 'sem-analise')) return null

  const sobram = conversa ? restantes(conversa.cota) : null
  const esgotou = sobram === 0
  const escaneados = conversa?.documentos.filter((d) => d.escaneado) ?? []

  return (
    <section aria-labelledby="titulo-conversa" className="flex flex-col gap-4 border-t border-line-soft pt-5">
      <div className="flex flex-col gap-1">
        <h3 id="titulo-conversa" className="inline-flex items-center gap-2 text-base font-semibold text-ink">
          <MessageSquareText size={18} aria-hidden />
          Pergunte ao edital
        </h3>
        <p className="max-w-prose text-sm text-muted">
          Tire dúvidas sobre esta licitação. A resposta mostra o trecho e a página do edital de onde saiu, conferidos pelo sistema.
        </p>
      </div>

      {!conversa && !erro && <Carregando linhas={2} />}

      {conversa && (conversa.situacao === 'preparando' || conversa.situacao === 'nao-preparada') && (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Preparando o edital para a conversa… leva menos de um minuto.
        </p>
      )}

      {conversa?.situacao === 'sem-texto' && (
        <Notice tone="info">Os documentos desta licitação são imagens escaneadas, sem texto que a conversa consiga ler. Consulte o edital original.</Notice>
      )}

      {conversa?.situacao === 'falhou' && (
        <Notice tone="warn">Não conseguimos baixar os documentos para a conversa agora. A fonte de origem pode estar fora do ar; tente de novo daqui a alguns minutos.</Notice>
      )}

      {conversa && conversa.situacao === 'pronta' && (
        <>
          {escaneados.length > 0 && (
            <p className="text-xs text-muted">
              {escaneados.length === 1 ? 'O documento' : 'Os documentos'} {escaneados.map((d) => `“${d.nome}”`).join(', ')}{' '}
              {escaneados.length === 1 ? 'é imagem escaneada e fica' : 'são imagens escaneadas e ficam'} de fora da conversa.
            </p>
          )}

          {conversa.perguntas.length > 0 && (
            <ul className="flex flex-col gap-5">
              {conversa.perguntas.map((p) => (
                <Resposta key={p.id} item={p} />
              ))}
            </ul>
          )}

          {enviando && (
            <div className="flex flex-col gap-2">
              <p className="self-end rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink sm:max-w-[80%]">{enviando}</p>
              <p role="status" className="inline-flex items-center gap-2 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Procurando no edital…
              </p>
            </div>
          )}
          <div ref={fim} />

          {conversa.perguntas.length === 0 && !enviando && !esgotou && (
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <Button key={s} variant="secondary" size="sm" onClick={() => void perguntar(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          {esgotou ? (
            <Notice tone="warn" title="Perguntas do mês esgotadas">
              O seu plano inclui {conversa.cota.limite} perguntas ao edital por mês. Para perguntar mais, fale com o administrador.
            </Notice>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void perguntar(pergunta)
              }}
            >
              <label htmlFor="pergunta-ao-edital" className="sr-only">
                Sua pergunta sobre o edital
              </label>
              <Textarea
                id="pergunta-ao-edital"
                rows={2}
                maxLength={TAMANHO_MAXIMO}
                value={pergunta}
                disabled={!!enviando}
                placeholder="Ex.: Aceita atestado de outra cidade? Qual o prazo para recurso?"
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void perguntar(pergunta)
                  }
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {sobram === null ? 'Sem limite de perguntas no seu plano.' : `${sobram === 1 ? 'Resta 1 pergunta' : `Restam ${sobram} perguntas`} este mês.`}
                </span>
                <Button type="submit" variant="primary" icon={Send} loading={!!enviando} disabled={!!enviando || pergunta.trim().length < 3}>
                  Perguntar
                </Button>
              </div>
            </form>
          )}

          <p className="text-xs text-muted">
            Respostas feitas por inteligência artificial a partir do texto dos documentos. Podem errar: confira a página citada antes de decidir ou enviar a
            proposta.
          </p>
        </>
      )}

      <FormError>{erro}</FormError>
    </section>
  )
}
