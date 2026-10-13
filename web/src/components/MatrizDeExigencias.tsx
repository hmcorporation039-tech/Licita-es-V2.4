'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import type { ExigenciaDaMatriz, MatrizResposta, StatusDaVerificacao } from '@/lib/adminTypes'
import { Button, Carregando, Checkbox, EmptyState, ErrorState, Field, FormError, Input, Notice, Panel, Select, StatusTag, cx, type Tom } from '@/components/ui'

const ROTULO_CATEGORIA: Record<ExigenciaDaMatriz['categoria'], string> = {
  juridica: 'Jurídica',
  fiscal: 'Fiscal',
  economica: 'Econômico-financeira',
  tecnica: 'Técnica',
  proposta: 'Proposta',
  outra: 'Outra',
}

const ROTULO_RESPONSAVEL: Record<ExigenciaDaMatriz['responsavel'], string> = {
  fiscal: 'Fiscal (documentos)',
  calculista: 'Calculista (preços)',
  redator: 'Redator (proposta)',
}

const VERIFICACAO: Record<StatusDaVerificacao, { rotulo: string; tom: Tom; dica: string }> = {
  confirmado: { rotulo: 'Texto conferido no edital', tom: 'ok', dica: 'O sistema encontrou este texto no documento.' },
  parcial: {
    rotulo: 'Parecido, confira',
    tom: 'warn',
    dica: 'A maior parte das palavras está no edital, mas não igual: pode ser paráfrase ou número alterado. Confira.',
  },
  'nao-localizado': {
    rotulo: 'Não localizado',
    tom: 'danger',
    dica: 'Este texto não foi encontrado no edital. Pode ter sido interpretado de forma errada: confira antes de confiar.',
  },
  'nao-verificavel': { rotulo: 'Não verificável', tom: 'neutral', dica: 'Documento escaneado (sem texto) ou trecho curto demais para conferir.' },
}

function csvCelula(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v
  return '"' + s.replace(/"/g, '""') + '"'
}

function baixarCsv(itens: ExigenciaDaMatriz[]) {
  const linhas = [
    ['Nº', 'Exigência', 'Categoria', 'Documento', 'Página', 'Item', 'Responsável', 'Conferência', 'Atendida', 'Nota'].join(','),
    ...itens.map((e, i) =>
      [
        String(i + 1),
        e.texto,
        ROTULO_CATEGORIA[e.categoria],
        e.documento,
        e.verificacao?.paginaConfirmada ?? e.pagina,
        e.item,
        ROTULO_RESPONSAVEL[e.responsavel],
        e.verificacao ? VERIFICACAO[e.verificacao.status].rotulo : '',
        e.atendida ? 'Sim' : 'Não',
        e.nota ?? '',
      ]
        .map(csvCelula)
        .join(',')
    ),
  ]
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'matriz-de-exigencias.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function MatrizDeExigencias({ tenderId }: { tenderId: string }) {
  const [dados, setDados] = useState<MatrizResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string>('todas')
  const [responsavel, setResponsavel] = useState<string>('todos')
  const [soPendentes, setSoPendentes] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setDados(await api.get<MatrizResposta>(`/api/tenders/${tenderId}/matriz`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [tenderId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcar(e: ExigenciaDaMatriz, atendida: boolean) {
    setDados((d) => (d?.itens ? { ...d, itens: d.itens.map((i) => (i.chave === e.chave ? { ...i, atendida } : i)) } : d))
    try {
      await api.put(`/api/tenders/${tenderId}/matriz/${e.chave}`, { atendida, nota: e.nota })
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível salvar')
      await carregar()
    }
  }

  async function salvarNota(e: ExigenciaDaMatriz, nota: string) {
    try {
      await api.put(`/api/tenders/${tenderId}/matriz/${e.chave}`, { atendida: e.atendida, nota: nota.trim() || null })
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível salvar a nota')
    }
  }

  const itens = dados?.itens
  const visiveis = useMemo(
    () =>
      (itens ?? []).filter(
        (i) => (categoria === 'todas' || i.categoria === categoria) && (responsavel === 'todos' || i.responsavel === responsavel) && (!soPendentes || !i.atendida)
      ),
    [itens, categoria, responsavel, soPendentes]
  )

  if (erro && !dados) {
    return (
      <ErrorState
        message={erro}
        onRetry={() => {
          setErro(null)
          carregar()
        }}
      />
    )
  }
  if (!dados) return <Carregando texto="Carregando a matriz de exigências…" />
  if (!dados.disponivel || !itens) {
    return <EmptyState title="Matriz de exigências" description={dados.motivo ?? 'A matriz ainda não está disponível.'} />
  }

  const resumo = dados.resumo!
  const percentual = resumo.total ? Math.round((resumo.atendidas / resumo.total) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Matriz de exigências"
        actions={
          <Button size="sm" icon={Download} onClick={() => baixarCsv(itens)}>
            Exportar CSV
          </Button>
        }
        bodyClassName="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">
            <span className="font-mono">
              {resumo.atendidas} de {resumo.total}
            </span>{' '}
            exigências marcadas como atendidas. Cada linha mostra de onde veio no edital e se o texto foi conferido.
          </p>
          <div
            role="progressbar"
            aria-label="Exigências atendidas"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentual}
            className="h-1 overflow-hidden rounded-sm bg-line-soft"
          >
            <div className="h-full bg-accent" style={{ width: `${percentual}%` }} />
          </div>
        </div>

        {(resumo.verificacao['nao-localizado'] > 0 || resumo.verificacao.parcial > 0) && (
          <Notice tone="warn">
            <span className="font-mono">{resumo.verificacao['nao-localizado']}</span> exigência(s) não localizada(s) e{' '}
            <span className="font-mono">{resumo.verificacao.parcial}</span> só parecida(s) com o edital. A análise pode ter errado ou parafraseado:
            confira essas linhas no documento original antes de confiar.
          </Notice>
        )}

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Categoria">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="todas">Todas</option>
              {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="todos">Todos</option>
              {Object.entries(ROTULO_RESPONSAVEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox label="Só pendentes" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} className="sm:pb-2.5" />
        </div>
        <FormError>{erro}</FormError>
      </Panel>

      {visiveis.length === 0 ? (
        <EmptyState title="Nenhuma exigência com esses filtros." />
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft rounded border border-line bg-surface">
          {visiveis.map((e) => {
            const v = e.verificacao ? VERIFICACAO[e.verificacao.status] : null
            const pagina = e.verificacao?.paginaConfirmada ?? e.pagina
            return (
              <li key={e.chave} className="flex items-start gap-3 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={e.atendida}
                  onChange={(ev) => marcar(e, ev.target.checked)}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
                  aria-label="Marcar como atendida"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className={cx('leading-relaxed', e.atendida ? 'text-muted' : 'text-ink')}>{e.texto}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{ROTULO_CATEGORIA[e.categoria]}</span>
                    <span aria-hidden>·</span>
                    <span>{e.documento || 'documento n/d'}</span>
                    {pagina && pagina !== 'não identificada' && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          pág. <span className="font-mono">{pagina}</span>
                        </span>
                      </>
                    )}
                    {e.item && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          item <span className="font-mono">{e.item}</span>
                        </span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>{ROTULO_RESPONSAVEL[e.responsavel]}</span>
                    {v && (
                      <StatusTag tone={v.tom} title={v.dica} className="ml-1">
                        {v.rotulo}
                      </StatusTag>
                    )}
                  </div>
                  <Input
                    defaultValue={e.nota ?? ''}
                    onBlur={(ev) => ev.target.value.trim() !== (e.nota ?? '') && salvarNota(e, ev.target.value)}
                    placeholder="Nota (ex.: qual documento atende)"
                    aria-label="Nota da exigência"
                    maxLength={300}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
