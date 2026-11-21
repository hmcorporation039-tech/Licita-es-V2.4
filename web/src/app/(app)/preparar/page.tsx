'use client'

// "Preparar a empresa": o que a empresa precisa ter uma vez antes de disputar
// qualquer licitação. Cada passo diz para que serve, como conseguir e onde (site
// oficial). Quando o documento fica pronto, o botão leva ao cofre já com o
// formulário aberto naquele documento. Um #id no endereço (ex.: /preparar#cndt,
// que a Bela usa) abre e destaca aquele passo.

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CircleCheck, ExternalLink } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import type { CompanyDocument } from '@/lib/types'
import {
  PASSOS_DO_PREPARO,
  linkParaCadastrarNoCofre,
  resumoDoPreparo,
  situacaoDoDocumento,
  type PassoDoPreparo,
  type SituacaoDoDocumento,
} from '@/lib/prepararEmpresa'
import { Carregando, ErrorState, LinkButton, PageHeader, StatusTag, TextLink, cx, type Tom } from '@/components/ui'

const ROTULO: Record<SituacaoDoDocumento, string> = {
  pronto: 'Pronto no cofre',
  vencendo: 'Vence em breve',
  vencido: 'Vencido',
  falta: 'Falta',
}

const TOM: Record<SituacaoDoDocumento, Tom> = {
  pronto: 'ok',
  vencendo: 'warn',
  vencido: 'danger',
  falta: 'neutral',
}

function passoDoEndereco(): string | null {
  const id = window.location.hash.replace(/^#/, '')
  return PASSOS_DO_PREPARO.some((p) => p.id === id) ? id : null
}

function Passo({ passo, numero, situacao, destacado, ehOProximo }: { passo: PassoDoPreparo; numero: number; situacao: SituacaoDoDocumento | null; destacado: boolean; ehOProximo: boolean }) {
  const pronto = situacao === 'pronto'
  const [aberto, setAberto] = useState(!pronto)
  useEffect(() => {
    if (destacado) setAberto(true)
  }, [destacado])

  return (
    <li
      id={passo.id}
      className={cx(
        'scroll-mt-24 rounded-xl border px-3 py-3 sm:px-4',
        destacado ? 'border-accent bg-accent-soft ring-2 ring-accent-line' : pronto ? 'border-ok-line bg-ok-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        {pronto ? (
          <CircleCheck size={22} className="mt-0.5 shrink-0 text-ok" aria-label="Pronto" />
        ) : (
          <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent-line text-xs font-bold text-accent" aria-hidden>
            {numero}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{passo.titulo}</h2>
            {situacao && <StatusTag tone={TOM[situacao]}>{ROTULO[situacao]}</StatusTag>}
            {!passo.vaiProCofre && <StatusTag>Feito fora da Bela</StatusTag>}
          </div>
          <p className="text-sm text-muted">{passo.paraQue}</p>

          {pronto && !aberto ? (
            <button type="button" onClick={() => setAberto(true)} className="self-start text-sm font-semibold text-accent underline underline-offset-[3px]">
              Ver como tirar de novo
            </button>
          ) : (
            <>
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 text-sm text-ink-2">
                {passo.comoTirar.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {passo.site && (
                  <a
                    href={passo.site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-sunken sm:min-h-9"
                  >
                    {passo.site.rotulo}
                    <ExternalLink size={15} aria-hidden />
                  </a>
                )}
                {passo.vaiProCofre && (
                  <LinkButton href={linkParaCadastrarNoCofre(passo.id)} variant={ehOProximo || destacado ? 'primary' : 'secondary'} iconRight={ArrowRight} className="min-h-11 sm:min-h-9">
                    {situacao === 'falta' ? 'Já tirei, guardar no cofre' : 'Guardar a versão nova no cofre'}
                  </LinkButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export default function PrepararEmpresaPage() {
  const user = useRequireSession()
  const [docs, setDocs] = useState<CompanyDocument[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [destaque, setDestaque] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setErro(null)
    api
      .get<CompanyDocument[]>('/api/company-documents')
      .then(setDocs)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar os seus documentos.'))
  }, [])

  useEffect(() => {
    if (user) carregar()
  }, [user, carregar])

  // Destaca o passo do endereço depois que a lista aparece, e de novo se a Bela
  // trocar o #passo com a página já aberta.
  useEffect(() => {
    if (!docs) return
    function irAoPasso() {
      const id = passoDoEndereco()
      setDestaque(id)
      if (id) window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    irAoPasso()
    window.addEventListener('hashchange', irAoPasso)
    return () => window.removeEventListener('hashchange', irAoPasso)
  }, [docs])

  if (!user) return null

  const resumo = docs ? resumoDoPreparo(docs) : null

  return (
    <>
      <PageHeader
        title="Preparar a empresa"
        description="O que a sua empresa precisa ter antes de participar de qualquer licitação. Faça uma vez só; eu aviso quando algo for vencer."
      />

      {erro ? (
        <ErrorState message={erro} onRetry={carregar} />
      ) : !docs || !resumo ? (
        <Carregando linhas={4} texto="Conferindo o seu cofre…" />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-2xl border border-accent-line bg-surface p-4 shadow-sm">
            <p className="text-sm text-ink">
              <span className="font-semibold">
                {resumo.prontos} de {resumo.documentos} documentos prontos no cofre.
              </span>{' '}
              {resumo.proximo ? (
                <>
                  Próximo: <TextLink href={`#${resumo.proximo}`}>{PASSOS_DO_PREPARO.find((p) => p.id === resumo.proximo)?.titulo}</TextLink>.
                </>
              ) : (
                'Tudo pronto. Agora é escolher a licitação.'
              )}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={resumo.documentos} aria-valuenow={resumo.prontos} aria-label="Documentos prontos">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round((resumo.prontos / resumo.documentos) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted">
              Eu explico e levo você até o site certo, mas quem tira as certidões e entra nos portais é você: eu nunca entro em site nenhum no seu lugar. Cada edital pode pedir mais
              documentos; dentro de cada licitação eu mostro o que falta para ela.
            </p>
          </section>

          <ol className="flex flex-col gap-3">
            {PASSOS_DO_PREPARO.map((p, i) => (
              <Passo key={p.id} passo={p} numero={i + 1} situacao={p.vaiProCofre ? situacaoDoDocumento(p.id, docs) : null} destacado={destaque === p.id} ehOProximo={resumo.proximo === p.id} />
            ))}
          </ol>
        </div>
      )}
    </>
  )
}
