'use client'

// "Primeiros passos" no painel, só para quem está no teste (a API decide em
// GET /api/dashboard/primeiros-passos). Cada passo fica feito sozinho quando a
// empresa faz a ação; o cartão some quando os três estão feitos. "Esconder por
// hoje" guarda o dia só neste navegador e o cartão volta no dia seguinte.

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ArrowRight, CircleCheck, X } from 'lucide-react'
import { api } from '@/lib/api'
import { LinkButton, TextLink, cx } from '@/components/ui'

type IdDoPasso = 'oQueVende' | 'salvarLicitacao' | 'perguntarAoEdital'

export interface PrimeirosPassosDaApi {
  mostrar: boolean
  feitos: number
  total: number
  passos: Array<{ id: IdDoPasso; feito: boolean }>
  matches: number
  buscando: boolean
}

const CHAVE = 'licita-bela:primeiros-passos-escondido-em'

function hoje(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function lerEscondidoEm(): string | null {
  try {
    return window.localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

function guardarEscondidoEm(dia: string) {
  try {
    window.localStorage.setItem(CHAVE, dia)
  } catch {}
}

const numero = (n: number) => n.toLocaleString('pt-BR')

export function textosDoPasso(id: IdDoPasso, dados: Pick<PrimeirosPassosDaApi, 'matches' | 'buscando'>) {
  const ondeTemLicitacao = dados.matches > 0 ? '/matches' : '/tenders'
  const verLicitacoes = dados.matches > 0 ? `Ver as ${numero(dados.matches)} que achei` : 'Ver licitações abertas'
  switch (id) {
    case 'oQueVende':
      return {
        titulo: 'Diga o que a sua empresa vende',
        explicacao: 'Eu uso isso para procurar licitações para você todos os dias.',
        href: '/items',
        botao: 'Cadastrar o que vendo',
      }
    case 'salvarLicitacao':
      return {
        titulo: 'Salve uma licitação que te interessa',
        explicacao: dados.buscando
          ? 'Ainda estou procurando licitações para você. Assim que eu achar, abra uma e toque em "Salvar".'
          : 'Abra uma licitação e toque em "Salvar". Ela fica guardada em "Minhas salvas".',
        href: ondeTemLicitacao,
        botao: verLicitacoes,
      }
    case 'perguntarAoEdital':
      return {
        titulo: 'Pergunte algo ao edital',
        explicacao: 'Dentro de uma licitação, use "Pergunte ao edital". Exemplo: "Quais documentos pede?" Eu respondo mostrando o trecho do edital.',
        href: ondeTemLicitacao,
        botao: verLicitacoes,
      }
  }
}

export default function PrimeirosPassos() {
  const [dados, setDados] = useState<PrimeirosPassosDaApi | null>(null)
  const [escondido, setEscondido] = useState(true)

  useEffect(() => {
    let ativo = true
    setEscondido(lerEscondidoEm() === hoje())
    api
      .get<PrimeirosPassosDaApi>('/api/dashboard/primeiros-passos')
      .then((r) => {
        if (ativo) setDados(r)
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])

  if (!dados || !dados.mostrar || escondido) return null

  const proximo = dados.passos.find((p) => !p.feito)?.id

  function esconder() {
    guardarEscondidoEm(hoje())
    setEscondido(true)
  }

  return (
    <section aria-label="Primeiros passos" className="relative flex flex-col gap-4 rounded-2xl border border-accent-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <Image
          src="/bela/v2/bela-640.webp"
          alt=""
          width={640}
          height={605}
          sizes="48px"
          className="h-12 w-12 shrink-0 rounded-xl bg-accent-soft object-cover object-top"
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-ink">Primeiros passos</p>
          <p className="text-sm text-muted">
            Faça estas {dados.total} coisas e você vai ver como eu trabalho para você. {dados.feitos} de {dados.total} feitas.
          </p>
        </div>
        <button type="button" onClick={esconder} aria-label="Esconder os primeiros passos por hoje" title="Esconder por hoje" className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink">
          <X size={18} />
        </button>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={dados.total} aria-valuenow={dados.feitos} aria-label="Passos feitos">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round((dados.feitos / dados.total) * 100)}%` }} />
      </div>

      <ol className="flex flex-col gap-2">
        {dados.passos.map((p, i) => {
          const t = textosDoPasso(p.id, dados)
          const ehOProximo = p.id === proximo
          return (
            <li
              key={p.id}
              className={cx(
                'flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between',
                p.feito ? 'border-ok-line bg-ok-soft' : ehOProximo ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface'
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                {p.feito ? (
                  <CircleCheck size={22} className="mt-0.5 shrink-0 text-ok" aria-label="Feito" />
                ) : (
                  <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent-line text-xs font-bold text-accent" aria-hidden>
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p className={cx('text-sm font-semibold', p.feito ? 'text-ok line-through decoration-ok-line' : 'text-ink')}>{t.titulo}</p>
                  {!p.feito && <p className="text-sm text-muted">{t.explicacao}</p>}
                </div>
              </div>
              {!p.feito &&
                (ehOProximo ? (
                  <LinkButton href={t.href} variant="primary" size="sm" iconRight={ArrowRight} className="shrink-0 self-start sm:self-center">
                    {t.botao}
                  </LinkButton>
                ) : (
                  <TextLink href={t.href} className="shrink-0 self-start text-sm sm:self-center">
                    {t.botao}
                  </TextLink>
                ))}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
