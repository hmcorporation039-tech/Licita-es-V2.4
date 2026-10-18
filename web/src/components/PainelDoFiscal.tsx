'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Circle, CornerDownRight, Paperclip, TriangleAlert } from 'lucide-react'
import { abrirArquivo, api, ApiRequestError } from '@/lib/api'
import type { PainelDoFiscal as Painel, RequisitoDeHabilitacao, StatusHabilitacao } from '@/lib/adminTypes'
import { diasUteis } from '@/lib/datas'
import { Carregando, ErrorState, Notice, Panel, StatusTag, TextLink, cx, toneText, type Tom } from '@/components/ui'
import AnexarDocumentoPendente from '@/components/AnexarDocumentoPendente'

const STATUS: Record<StatusHabilitacao, { tom: Tom; rotulo: string }> = {
  verde: { tom: 'ok', rotulo: 'Em dia' },
  amarelo: { tom: 'warn', rotulo: 'Renovar' },
  vermelho: { tom: 'danger', rotulo: 'Pendente' },
  cinza: { tom: 'neutral', rotulo: 'Conferir' },
}

const ORDEM: StatusHabilitacao[] = ['vermelho', 'amarelo', 'cinza', 'verde']

const ORIGEM: Record<RequisitoDeHabilitacao['origem'], string> = {
  padrao: 'padrão da Lei 14.133',
  edital: 'citado no edital',
  'a-confirmar': 'só se o edital exigir',
  extra: 'específico do edital',
}

function dia(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors',
        ativo ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken'
      )}
    >
      {children}
    </button>
  )
}

export default function PainelDoFiscal({ tenderId }: { tenderId: string }) {
  const [dados, setDados] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<StatusHabilitacao | 'todos'>('todos')
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    setErro(null)
    api
      .get<Painel>(`/api/tenders/${tenderId}/habilitacao`)
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [tenderId, tentativa])

  if (erro) return <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
  if (!dados) return <Carregando texto="Carregando a habilitação…" />

  const { habilitacao: h, alertas, prazos } = dados
  const visiveis = h.requisitos.filter((r) => filtro === 'todos' || r.status === filtro)
  const porSecao = new Map<string, RequisitoDeHabilitacao[]>()
  for (const r of visiveis) porSecao.set(r.section, [...(porSecao.get(r.section) ?? []), r])

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Habilitação: o que o edital pede × o seu cofre"
        description={
          <>
            {h.referencia.dataSessao ? (
              <>
                Validade conferida na data da sessão: <span className="font-mono">{dia(h.referencia.dataSessao)}</span>.
              </>
            ) : (
              'A licitação não informa a data da sessão: a validade foi conferida contra hoje.'
            )}
            {!dados.analise.feita && ' Rode a análise do edital (aba Análise) para saber quais documentos específicos ele exige.'}
          </>
        }
        bodyClassName="flex flex-col gap-3"
      >
        <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
          <Filtro ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>
            Todos <span className="font-mono text-muted">{h.requisitos.length}</span>
          </Filtro>
          {ORDEM.map((s) => (
            <Filtro key={s} ativo={filtro === s} onClick={() => setFiltro(filtro === s ? 'todos' : s)}>
              <Circle size={8} fill="currentColor" strokeWidth={0} className={cx('shrink-0', toneText(STATUS[s].tom))} aria-hidden />
              {STATUS[s].rotulo} <span className="font-mono text-muted">{h.resumo[s]}</span>
            </Filtro>
          ))}
        </div>

        <p className={cx('text-sm font-medium', h.semPendenciaBloqueante ? 'text-ink-2' : toneText('danger'))}>
          {h.semPendenciaBloqueante
            ? 'Nenhum documento pendente pelo que o cofre sabe. Ainda confira os itens em cinza.'
            : `${h.resumo.vermelho} documento(s) pendente(s): resolva antes da sessão.`}
        </p>
      </Panel>

      {alertas.disponivel ? (
        alertas.itens.length > 0 && (
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <TriangleAlert size={14} className={toneText('danger')} aria-hidden />
                Exigências que parecem passar dos limites da lei
              </span>
            }
            description={alertas.aviso}
            padding="none"
          >
            {prazos && !prazos.sessaoPassou && (
              <p className="border-b border-line-soft px-4 py-2.5 text-sm text-ink-2">
                Para impugnar ou pedir esclarecimento: até <strong className="font-mono font-semibold text-ink">{dia(prazos.limiteImpugnacao)}</strong>{' '}
                {prazos.limitePassou ? '(o prazo já terminou)' : `(${diasUteis(prazos.diasUteisAteLimite)})`}.
              </p>
            )}
            <ul className="flex flex-col divide-y divide-line-soft">
              {alertas.itens.map((a) => (
                <li key={a.chave ?? a.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{a.titulo}</span>
                    <StatusTag tone={a.gravidade === 'alta' ? 'danger' : 'warn'}>{a.gravidade === 'alta' ? 'alta' : 'média'}</StatusTag>
                  </div>
                  <p className="text-ink-2">{a.detalhe}</p>
                  <p className="text-xs text-muted">Base: {a.fundamento}</p>
                  <blockquote className="border-l-2 border-line-strong pl-3 text-xs italic text-muted">{a.trecho}</blockquote>
                  {a.local && <p className="text-xs text-muted">Onde: {a.local}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        )
      ) : (
        <Notice tone="info">
          {dados.analise.feita
            ? 'Esta análise é anterior aos alertas de exigências fora da lei (garantias, índices, atestados, documentos fora do rol). Peça uma nova análise ao administrador para habilitá-los.'
            : 'Os alertas de exigências fora da lei (garantias, índices contábeis, atestados, documentos fora do rol) aparecem depois que a análise do edital é feita.'}
        </Notice>
      )}

      {[...porSecao.entries()].map(([secao, itens]) => (
        <Panel key={secao} title={secao} padding="none">
          <ul className="flex flex-col divide-y divide-line-soft">
            {itens.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-ink">
                    {r.label} <span className="text-xs text-faint">· {ORIGEM[r.origem]}</span>
                  </p>
                  <p className="text-ink-2">{r.motivo}</p>
                  {r.acao && (
                    <p className="inline-flex items-start gap-1.5 text-xs text-muted">
                      <CornerDownRight size={14} className="mt-px shrink-0" aria-hidden />
                      {r.acao}
                    </p>
                  )}
                  {r.citadoNoEdital.length > 0 && r.origem !== 'extra' && <p className="text-xs text-faint">Edital: {r.citadoNoEdital.join(' · ')}</p>}
                  {r.documento?.temArquivo && (
                    <button
                      type="button"
                      onClick={() => abrirArquivo(`/api/company-documents/${r.documento!.id}/arquivo`).catch(() => undefined)}
                      className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent"
                    >
                      <Paperclip size={12} aria-hidden />
                      Ver arquivo de “{r.documento.nome}”
                    </button>
                  )}
                  {(r.status === 'vermelho' || r.status === 'amarelo') && <AnexarDocumentoPendente requisito={r} aoConcluir={() => setTentativa((n) => n + 1)} />}
                </div>
                <StatusTag tone={STATUS[r.status].tom} dot className="shrink-0">
                  {STATUS[r.status].rotulo}
                </StatusTag>
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      <p className="text-xs text-muted">
        Cadastre os documentos, a validade e o arquivo (PDF ou imagem) em <TextLink href="/empresa">Empresa e documentos</TextLink>. Os arquivos entram no pacote de habilitação do estudo de custos.
      </p>
    </div>
  )
}
