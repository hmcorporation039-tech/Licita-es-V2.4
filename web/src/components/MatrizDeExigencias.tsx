'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import type { ExigenciaDaMatriz, MatrizResposta, StatusDaVerificacao } from '@/lib/adminTypes'

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

const VERIFICACAO: Record<StatusDaVerificacao, { rotulo: string; classe: string; dica: string }> = {
  confirmado: { rotulo: 'Texto conferido no edital', classe: 'bg-emerald-100 text-emerald-800', dica: 'O sistema encontrou este texto no documento.' },
  parcial: {
    rotulo: 'Parecido, confira',
    classe: 'bg-amber-100 text-amber-900',
    dica: 'A maior parte das palavras está no edital, mas não igual: pode ser paráfrase ou número alterado. Confira.',
  },
  'nao-localizado': {
    rotulo: 'Não localizado',
    classe: 'bg-red-100 text-red-800',
    dica: 'Este texto não foi encontrado no edital. Pode ter sido inventado pela IA: confira antes de confiar.',
  },
  'nao-verificavel': { rotulo: 'Não verificável', classe: 'bg-slate-100 text-slate-600', dica: 'Documento escaneado (sem texto) ou trecho curto demais para conferir.' },
}

function csvCelula(v: string): string {
  // Planilhas tratam =, +, - e @ no início da célula como fórmula.
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

// Matriz de exigências do edital: cada exigência com o texto literal, o arquivo, a
// página e o item de onde veio, quem deve atendê-la, e se o texto foi conferido no documento.
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
    // Atualiza na hora; se falhar, recarrega o estado verdadeiro.
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

  if (erro && !dados) return <p className="text-sm text-red-600">{erro}</p>
  if (!dados) return <p className="text-sm text-slate-500">Carregando...</p>
  if (!dados.disponivel || !itens) {
    return <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">{dados.motivo ?? 'A matriz ainda não está disponível.'}</p>
  }

  const resumo = dados.resumo!
  const campo = 'rounded border border-slate-300 px-2 py-1 text-sm'

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Matriz de exigências</h2>
          <button onClick={() => baixarCsv(itens)} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Exportar CSV
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {resumo.atendidas} de {resumo.total} exigências marcadas como atendidas. Cada linha mostra de onde veio no edital e se o texto foi conferido.
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${resumo.total ? Math.round((resumo.atendidas / resumo.total) * 100) : 0}%` }} />
        </div>
        {(resumo.verificacao['nao-localizado'] > 0 || resumo.verificacao.parcial > 0) && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            ⚠ {resumo.verificacao['nao-localizado']} exigência(s) não localizada(s) e {resumo.verificacao.parcial} só parecida(s) com o edital. A IA pode ter errado ou
            parafraseado: confira essas linhas no documento original antes de confiar.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600">
            Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
              <option value="todas">Todas</option>
              {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            Responsável
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
              <option value="todos">Todos</option>
              {Object.entries(ROTULO_RESPONSAVEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só pendentes
          </label>
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </section>

      <ul className="flex flex-col gap-2">
        {visiveis.map((e) => {
          const v = e.verificacao ? VERIFICACAO[e.verificacao.status] : null
          const pagina = e.verificacao?.paginaConfirmada ?? e.pagina
          return (
            <li key={e.chave} className={`rounded border p-3 text-sm ${e.atendida ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={e.atendida} onChange={(ev) => marcar(e, ev.target.checked)} className="mt-1" aria-label="Marcar como atendida" />
                <div className="min-w-0 flex-1">
                  <p className={e.atendida ? 'text-slate-500' : 'text-slate-900'}>{e.texto}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ROTULO_CATEGORIA[e.categoria]} · {e.documento || 'documento n/d'}
                    {pagina && pagina !== 'não identificada' ? ` · pág. ${pagina}` : ''}
                    {e.item ? ` · item ${e.item}` : ''} · {ROTULO_RESPONSAVEL[e.responsavel]}
                  </p>
                  {v && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${v.classe}`} title={v.dica}>
                      {v.rotulo}
                    </span>
                  )}
                  <input
                    defaultValue={e.nota ?? ''}
                    onBlur={(ev) => ev.target.value.trim() !== (e.nota ?? '') && salvarNota(e, ev.target.value)}
                    placeholder="Nota (ex.: qual documento atende)"
                    maxLength={300}
                    className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
              </div>
            </li>
          )
        })}
        {visiveis.length === 0 && <li className="text-sm text-slate-500">Nenhuma exigência com esses filtros.</li>}
      </ul>
    </div>
  )
}
