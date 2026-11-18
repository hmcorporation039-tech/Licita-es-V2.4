'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { Carregando, ErrorState, Notice, StatusTag, TextLink } from '@/components/ui'

interface ItemDoContrato {
  numero: number
  descricao: string
  complemento: string | null
  quantidade: number | null
  unidade: string | null
  valorEstimado: number | null
  valorHomologado: number | null
  nichos: string[]
}

interface DetalheDoContrato {
  contrato: { id: string; municipio: string | null; uf: string | null; assinatura: string | null; vigenciaFim: string | null; linkPncp: string | null }
  compra: { controle: string; link: string } | null
  itens: { total: number; doNicho: ItemDoContrato[]; outros: ItemDoContrato[]; outrosOcultos: number }
  subcontratacao: {
    situacao: 'permite' | 'proibe' | 'nao_encontrei'
    trecho: string | null
    limite: string | null
    parcelas: string | null
    documento: string | null
    explicacao: string
    documentosLidos: string[]
    linkArquivos: string | null
  }
  parcial: boolean
  avisos: string[]
}

const ROTULO_DA_SITUACAO = {
  permite: { tom: 'ok', texto: 'Permite subcontratar parte' },
  proibe: { tom: 'danger', texto: 'Não permite subcontratar' },
  nao_encontrei: { tom: 'neutral', texto: 'Regra não encontrada' },
} as const

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v < 1000 ? 2 : 0 })
const dia = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null)
const quantidade = (i: ItemDoContrato) =>
  i.quantidade !== null ? `${i.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${i.unidade ? ` ${i.unidade.toLowerCase()}` : ''}` : null

function LinhaDoItem({ item }: { item: ItemDoContrato }) {
  const qtd = quantidade(item)
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">
          <span className="mr-1.5 font-mono text-xs text-muted">{item.numero}.</span>
          {item.descricao}
        </p>
        {item.complemento && <p className="line-clamp-2 break-words text-xs text-muted">{item.complemento}</p>}
        {item.nichos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.nichos.map((n) => (
              <StatusTag key={n} tone="accent">
                {n}
              </StatusTag>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2 sm:flex-col sm:items-end sm:text-right">
        {qtd && <span>{qtd}</span>}
        {item.valorHomologado !== null ? (
          <span className="font-mono font-semibold text-ink">{brl(item.valorHomologado)} homologado</span>
        ) : item.valorEstimado !== null ? (
          <span className="font-mono">{brl(item.valorEstimado)} estimado</span>
        ) : null}
      </div>
    </li>
  )
}

// "O que o contrato pede": itens da compra no PNCP (os do nicho primeiro) e se o edital deixa
// o ganhador subcontratar. Busca na API ao abrir; sem IA.
export default function OQueOContratoPede({ contratoId, id }: { contratoId: string; id: string }) {
  const [detalhe, setDetalhe] = useState<DetalheDoContrato | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  const carregar = useCallback(() => {
    setErro(null)
    setDetalhe(null)
    let vivo = true
    api
      .get<DetalheDoContrato>(`/api/obras/contratos/${encodeURIComponent(contratoId)}/detalhe`)
      .then((d) => vivo && setDetalhe(d))
      .catch((e) => vivo && setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível consultar o contrato no PNCP agora.'))
    return () => {
      vivo = false
    }
  }, [contratoId])

  useEffect(() => carregar(), [carregar, tentativa])

  return (
    <section id={id} aria-label="O que o contrato pede" className="flex flex-col gap-3 rounded border border-line bg-surface px-3 py-3">
      {erro ? (
        <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
      ) : !detalhe ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-xs text-muted">Consultando os itens e o edital no PNCP… pode levar até 20 segundos.</p>
          <Carregando linhas={4} texto="Consultando o PNCP…" />
        </div>
      ) : (
        <ConteudoDoDetalhe d={detalhe} />
      )}
    </section>
  )
}

function ConteudoDoDetalhe({ d }: { d: DetalheDoContrato }) {
  const s = d.subcontratacao
  const rotulo = ROTULO_DA_SITUACAO[s.situacao]
  const local = d.contrato.municipio ? `${d.contrato.municipio}${d.contrato.uf ? `/${d.contrato.uf}` : ''}` : d.contrato.uf
  const fim = dia(d.contrato.vigenciaFim)
  return (
    <>
      <p className="text-xs text-muted">
        {[local ? `Local: ${local}` : null, fim ? `Prazo: vigência até ${fim}` : null, d.itens.total > 0 ? `${d.itens.total} ${d.itens.total === 1 ? 'item' : 'itens'} na compra` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {d.avisos.map((a) => (
        <Notice key={a} tone="warn">
          {a}
        </Notice>
      ))}

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Pode subcontratar?</h3>
          <StatusTag tone={rotulo.tom} dot>
            {rotulo.texto}
          </StatusTag>
        </div>
        <p className="text-sm text-ink-2">{s.explicacao}</p>
        {s.parcelas && (
          <p className="break-words text-sm text-ink-2">
            <span className="font-semibold text-ink">Partes que o edital deixa subcontratar:</span> {s.parcelas}
          </p>
        )}
        {s.trecho && (
          <figure className="rounded border-l-2 border-line bg-sunken px-3 py-2">
            <blockquote className="break-words text-xs italic text-ink-2">“{s.trecho}”</blockquote>
            {s.documento && <figcaption className="mt-1 break-words text-2xs text-muted">Trecho de: {s.documento}</figcaption>}
          </figure>
        )}
        {s.linkArquivos && (
          <TextLink href={s.linkArquivos} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-sm">
            {s.situacao === 'nao_encontrei' ? 'Ver os arquivos no PNCP' : 'Conferir no PNCP'} <ExternalLink size={14} aria-hidden />
          </TextLink>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-ink">Itens do seu nicho {d.itens.doNicho.length > 0 ? `(${d.itens.doNicho.length})` : ''}</h3>
        {d.itens.doNicho.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line-soft rounded border border-line-soft">
            {d.itens.doNicho.map((i) => (
              <LinhaDoItem key={i.numero} item={i} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">
            {d.itens.total === 0
              ? 'Não há itens da compra para mostrar.'
              : d.itens.total === 1
                ? 'A compra tem um item só, com a obra inteira: os serviços do seu nicho estão dentro dele (veja a planilha nos arquivos do PNCP).'
                : 'Nenhum item cita os seus nichos pelo nome. Veja os outros itens abaixo.'}
          </p>
        )}
      </div>

      {d.itens.outros.length > 0 && (
        <details className="rounded border border-line-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Outros itens ({d.itens.outros.length + d.itens.outrosOcultos})
          </summary>
          <ul className="flex flex-col divide-y divide-line-soft border-t border-line-soft">
            {d.itens.outros.map((i) => (
              <LinhaDoItem key={i.numero} item={i} />
            ))}
          </ul>
          {d.itens.outrosOcultos > 0 && <p className="border-t border-line-soft px-3 py-2 text-xs text-muted">E mais {d.itens.outrosOcultos} itens: veja a compra no PNCP.</p>}
        </details>
      )}

      <p className="text-2xs text-muted">
        Itens e edital publicados no PNCP; a regra foi procurada no texto dos arquivos, sem garantia. Quem decide subcontratar é a empresa que ganhou, dentro do que o contrato permite.
      </p>
    </>
  )
}
