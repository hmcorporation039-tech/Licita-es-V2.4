'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Mic, Search, Square, X } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import type { FiltrosDaBela, Paginated, PedidoDaBela, Tender } from '@/lib/types'
import { MODALIDADE_OPTIONS } from '@/lib/modalidades'
import { useEscuta, useFalaDaBela } from '@/hooks/useBela'
import { Button, Checkbox, cx, FormError, Input, LinkButton, Notice, Prazo, StatusTag } from '@/components/ui'

const LIMITE_DO_PEDIDO = 500
const RESULTADOS_NA_BELA = 5
const EXEMPLO = 'licitação de estrutura metálica no DF'

type EstadoDaBela =
  | { fase: 'ocioso' }
  | { fase: 'pensando'; pedido: string }
  | { fase: 'desconhecida'; pedido: string; resumo: string }
  | { fase: 'resultado'; pedido: string; filtros: FiltrosDaBela; total: number; itens: Tender[] }
  | { fase: 'erro'; pedido: string; mensagem: string }

type TenderComEncerramento = Tender & { encerramentoAt?: string | null }

const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])

function fimDasPropostas(t: TenderComEncerramento): string | null {
  if (t.encerramentoAt) return t.encerramentoAt
  if (FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(t.fonte)) return null
  return t.aberturaAt
}

function rotuloDaModalidade(valor: string): string {
  return MODALIDADE_OPTIONS.find((o) => o.value === valor)?.label ?? valor
}

function parametrosDosFiltros(filtros: FiltrosDaBela): URLSearchParams {
  const qs = new URLSearchParams()
  if (filtros.q) qs.set('q', filtros.q)
  if (filtros.uf) qs.set('uf', filtros.uf)
  if (filtros.municipio) qs.set('municipio', filtros.municipio)
  if (filtros.modalidade) qs.set('modalidade', filtros.modalidade)
  if (filtros.situacao) qs.set('situacao', filtros.situacao)
  return qs
}

function linkDaLista(filtros: FiltrosDaBela): string {
  const qs = parametrosDosFiltros(filtros)
  qs.set('relacionadas', '0')
  return `/tenders?${qs.toString()}`
}

function localDoFiltro(filtros: FiltrosDaBela): string | null {
  if (filtros.municipio) return `em ${filtros.municipio}`
  if (filtros.uf === 'DF') return 'no DF'
  if (filtros.uf) return `na UF ${filtros.uf}`
  return null
}

function fraseDoResultado(filtros: FiltrosDaBela, total: number, primeira: Tender | undefined): string {
  const assunto = [filtros.q ? `de ${filtros.q}` : null, filtros.modalidade ? `por ${rotuloDaModalidade(filtros.modalidade).toLowerCase()}` : null, localDoFiltro(filtros)]
    .filter(Boolean)
    .join(' ')
  if (total === 0) return `Não encontrei licitações ${assunto}. Tente outras palavras.`.replace(/\s+\./, '.')
  const quantidade = total === 1 ? 'uma licitação' : `${total.toLocaleString('pt-BR')} licitações`
  const inicio = `Encontrei ${quantidade}${assunto ? ` ${assunto}` : ''}.`
  return primeira?.orgao ? `${inicio} A primeira é do órgão ${primeira.orgao}.` : inicio
}

function FiltrosAplicados({ filtros }: { filtros: FiltrosDaBela }) {
  const chips = [
    filtros.q ? `Objeto: “${filtros.q}”` : null,
    filtros.municipio ? `${filtros.municipio}/${filtros.uf ?? ''}` : filtros.uf ? `UF ${filtros.uf}` : null,
    filtros.modalidade ? rotuloDaModalidade(filtros.modalidade) : null,
    filtros.situacao === 'ABERTA' ? 'Abertas' : null,
  ].filter((c): c is string => Boolean(c))
  return (
    <ul aria-label="Filtros entendidos" className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c} className="max-w-full">
          <StatusTag tone="accent">{c}</StatusTag>
        </li>
      ))}
    </ul>
  )
}

function ResultadosDaBusca({ estado, onAbrir }: { estado: Extract<EstadoDaBela, { fase: 'resultado' }>; onAbrir: () => void }) {
  const { filtros, total, itens } = estado
  return (
    <div className="flex flex-col gap-3">
      <FiltrosAplicados filtros={filtros} />
      <p className="text-sm text-ink" aria-live="polite">
        {total === 0 ? (
          'Nenhuma licitação encontrada com esses filtros.'
        ) : (
          <>
            <span className="font-mono font-semibold">{total.toLocaleString('pt-BR')}</span> {total === 1 ? 'licitação encontrada' : 'licitações encontradas'}
            {total > itens.length && <span className="text-muted"> · mostrando as {itens.length} de prazo mais próximo</span>}
          </>
        )}
      </p>
      {itens.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
          {itens.map((t) => {
            const objeto = t.objetoResumido ?? t.objeto
            return (
              <li key={t.id}>
                <Link href={`/tenders/${t.id}`} onClick={onAbrir} className="flex min-h-11 min-w-0 flex-col gap-1 px-3 py-2.5 hover:bg-accent-soft/60">
                  <span className="line-clamp-2 break-words text-sm font-medium text-ink" title={objeto}>
                    {objeto}
                  </span>
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 truncate text-xs text-muted">
                      {t.orgao ?? 'Órgão n/d'}
                      {t.uf ? ` · ${t.municipio ? `${t.municipio}/` : ''}${t.uf}` : ''}
                    </span>
                    <Prazo data={fimDasPropostas(t)} layout="inline" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {total > 0 && (
        <LinkButton href={linkDaLista(filtros)} onClick={onAbrir} variant="primary" iconRight={ArrowRight} className="h-11! w-full sm:h-10! sm:w-auto sm:self-start">
          Ver todas na lista
        </LinkButton>
      )}
    </div>
  )
}

export function AvatarDaBela({ tamanho = 32, className }: { tamanho?: number; className?: string }) {
  const largura = Math.round(tamanho * 2.6)
  return (
    <span aria-hidden className={cx('relative inline-block shrink-0 overflow-hidden rounded-full bg-nav-2', className)} style={{ width: tamanho, height: tamanho }}>
      <Image
        src="/bela/bela-640.webp"
        alt=""
        width={640}
        height={605}
        sizes={`${largura}px`}
        className="absolute h-auto max-w-none"
        style={{ width: largura, left: Math.round(tamanho * -0.76), top: Math.round(tamanho * -0.1) }}
      />
    </span>
  )
}

export function BotaoDaBela({ onAbrir, className, rotulo = 'Bela', detalhe }: { onAbrir: () => void; className?: string; rotulo?: string; detalhe?: string }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      className={cx(
        'inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-white/10 py-1 pl-1 pr-3.5 text-left text-sm font-bold text-white transition-colors hover:border-white/50 hover:bg-white/20',
        className,
      )}
    >
      <AvatarDaBela tamanho={detalhe ? 40 : 32} className="ring-2 ring-white/80" />
      <span className="flex min-w-0 flex-col">
        <span className="font-display leading-tight">{rotulo}</span>
        {detalhe && <span className="truncate text-2xs font-medium text-nav-muted">{detalhe}</span>}
      </span>
      {detalhe && <Mic size={16} strokeWidth={2} className="ml-auto shrink-0 text-nav-muted" aria-hidden />}
    </button>
  )
}

export default function Bela({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const microfone = useRef<HTMLButtonElement>(null)
  const ultimaBusca = useRef(0)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<EstadoDaBela>({ fase: 'ocioso' })
  const escuta = useEscuta()
  const fala = useFalaDaBela()
  const { cancelar: cancelarEscuta } = escuta
  const { calar } = fala

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberta && !dialogo.open) {
      dialogo.showModal()
      const primeiroControle = microfone.current ?? campo.current
      primeiroControle?.focus()
    }
    if (!aberta && dialogo.open) dialogo.close()
    if (!aberta) {
      cancelarEscuta()
      calar()
      ultimaBusca.current++
    }
  }, [aberta, cancelarEscuta, calar])

  async function processar(bruto: string) {
    const pedido = bruto.replace(/\s+/g, ' ').trim().slice(0, LIMITE_DO_PEDIDO)
    if (!pedido) return
    const numero = ++ultimaBusca.current
    setEstado({ fase: 'pensando', pedido })
    try {
      const interpretado = await api.post<PedidoDaBela>('/api/bela/interpretar', { texto: pedido, contexto: 'busca' })
      if (numero !== ultimaBusca.current) return
      if (interpretado.acao !== 'buscar') {
        const resumo =
          interpretado.acao === 'lance' ? 'Para acompanhar lances, abra a licitação e entre em "Pregão com a Bela".' : interpretado.resumo
        setEstado({ fase: 'desconhecida', pedido, resumo })
        fala.dizer(resumo)
        return
      }
      const qs = parametrosDosFiltros(interpretado.filtros)
      qs.set('page', '1')
      qs.set('pageSize', String(RESULTADOS_NA_BELA))
      qs.set('ordem', 'prazo')
      const lista = await api.get<Paginated<Tender>>(`/api/tenders?${qs.toString()}`)
      if (numero !== ultimaBusca.current) return
      setEstado({ fase: 'resultado', pedido, filtros: interpretado.filtros, total: lista.total, itens: lista.items })
      fala.dizer(fraseDoResultado(interpretado.filtros, lista.total, lista.items[0]))
    } catch (e) {
      if (numero !== ultimaBusca.current) return
      setEstado({ fase: 'erro', pedido, mensagem: e instanceof ApiRequestError ? e.message : 'Não foi possível buscar agora. Verifique a conexão e tente de novo.' })
    }
  }

  async function aoTocarNoMicrofone() {
    const ouvido = await escuta.alternar()
    if (!ouvido) return
    setTexto(ouvido)
    await processar(ouvido)
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault()
    void processar(texto)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="bela-titulo"
      aria-describedby="bela-descricao"
      onCancel={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(600px,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-cartao-alto"
    >
      {aberta && (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarDaBela tamanho={48} className="ring-2 ring-accent-soft" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 id="bela-titulo" className="text-xl font-extrabold">
                  Bela
                </h2>
                <p id="bela-descricao" className="text-sm text-muted">
                  Peça uma busca de licitações falando ou digitando.
                </p>
              </div>
            </div>
            <button type="button" onClick={onFechar} aria-label="Fechar a Bela" className="-mr-1.5 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded text-muted hover:bg-line-soft hover:text-ink">
              <X size={18} aria-hidden />
            </button>
          </div>

          {escuta.disponivel && (
            <div className="flex flex-col gap-2">
              <Button
                ref={microfone}
                variant={escuta.ouvindo ? 'danger' : 'primary'}
                icon={escuta.ouvindo ? Square : Mic}
                onClick={aoTocarNoMicrofone}
                aria-pressed={escuta.ouvindo}
                className="h-14! w-full text-base!"
              >
                {escuta.ouvindo ? 'Ouvindo… toque para parar' : 'Toque e fale'}
              </Button>
              <p aria-live="polite" className="text-sm text-ink-2 empty:hidden">
                {escuta.ouvindo ? escuta.parcial || 'Pode falar. Ex.: “pregão de móveis em Brasília”.' : ''}
              </p>
              <FormError>{escuta.erro}</FormError>
            </div>
          )}

          {escuta.verificado && !escuta.disponivel && (
            <Notice tone="info">Este navegador não reconhece voz (Firefox e Safari no iPhone, por exemplo). Digite o pedido abaixo.</Notice>
          )}

          <form onSubmit={aoEnviar} className="flex gap-2" role="search">
            <Input
              ref={campo}
              value={texto}
              maxLength={LIMITE_DO_PEDIDO}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`ou digite: ${EXEMPLO}`}
              aria-label="Pedido para a Bela"
              enterKeyHint="search"
              className="h-11! min-w-0 flex-1 sm:h-10!"
            />
            <Button type="submit" icon={Search} loading={estado.fase === 'pensando'} disabled={!texto.trim()} className="h-11! sm:h-10!" aria-label="Buscar">
              <span className="hidden sm:inline">Buscar</span>
            </Button>
          </form>

          {fala.disponivel && (
            <Checkbox label="Bela fala as respostas" checked={fala.ligada} onChange={(e) => fala.mudar(e.target.checked)} className="min-h-11 sm:min-h-0" />
          )}

          {estado.fase === 'pensando' && (
            <p role="status" className="text-sm text-muted">
              Procurando “{estado.pedido}”…
            </p>
          )}
          {estado.fase === 'desconhecida' && <Notice tone="warn">{estado.resumo}</Notice>}
          {estado.fase === 'erro' && <Notice tone="danger">{estado.mensagem}</Notice>}
          {estado.fase === 'resultado' && <ResultadosDaBusca estado={estado} onAbrir={onFechar} />}
        </div>
      )}
    </dialog>
  )
}
