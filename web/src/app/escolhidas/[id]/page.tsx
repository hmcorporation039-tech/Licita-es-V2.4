'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError, baixarArquivo } from '@/lib/api'
import { DadosDoEstudo, EstudoResposta, PesquisaDePrecosResposta, ResultadoDoEstudo } from '@/lib/estudoTypes'

const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')

// Interpreta o que a pessoa digitou ("1.500,50", "1500,5", "0,5", "500"). Vazio ou inválido = null.
function lerNumero(texto: string): number | null {
  let t = texto.replace(/[^0-9.,]/g, '')
  if (t === '') return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (!/^[0-9]+\.[0-9]{1,2}$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

// Campo numérico: vazio = null. Com `moeda`, mostra "R$ 1.500,00" quando não está sendo editado;
// ao clicar, mostra só o número (selecionado) para digitar por cima, sem o "0" sobrando na frente.
function Numero({
  valor,
  aoMudar,
  passo = '0.01',
  moeda = false,
  className = '',
  placeholder,
}: {
  valor: number | null
  aoMudar: (v: number | null) => void
  passo?: string
  moeda?: boolean
  className?: string
  placeholder?: string
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const inteiro = passo === '1'
  const formatado =
    valor === null
      ? ''
      : moeda
        ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : valor.toLocaleString('pt-BR', { maximumFractionDigits: inteiro ? 0 : 4 })
  return (
    <input
      type="text"
      inputMode={inteiro ? 'numeric' : 'decimal'}
      placeholder={placeholder}
      value={editando ?? formatado}
      onFocus={(e) => {
        setEditando(valor === null ? '' : String(valor).replace('.', ','))
        const campoDigitado = e.target
        setTimeout(() => campoDigitado.select(), 0)
      }}
      onChange={(e) => {
        setEditando(e.target.value)
        aoMudar(lerNumero(e.target.value))
      }}
      onBlur={() => setEditando(null)}
      className={`rounded border border-slate-300 px-2 py-1 text-sm ${className}`}
    />
  )
}

const campo = 'mb-0.5 block text-xs text-slate-600'

export default function EstudoDeCustosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useRequireSession()
  const [estudo, setEstudo] = useState<EstudoResposta | null>(null)
  const [dados, setDados] = useState<DadosDoEstudo | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoEstudo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [pesquisando, setPesquisando] = useState<string | null>(null)
  const [escopoUf, setEscopoUf] = useState<'BR' | 'UF'>('BR')
  const [meses, setMeses] = useState(12)
  const [amostras, setAmostras] = useState<Record<string, PesquisaDePrecosResposta>>({})
  const versaoCalculo = useRef(0)

  useEffect(() => {
    if (!user) return
    api
      .get<EstudoResposta>(`/api/estudos/${id}`)
      .then((r) => {
        setEstudo(r)
        setDados(r.dados)
        setResultado(r.resultado)
      })
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar o estudo'))
  }, [user, id])

  // Recalcula no servidor enquanto o usuário digita (sem gravar).
  useEffect(() => {
    if (!dados || !sujo) return
    const minha = ++versaoCalculo.current
    const t = setTimeout(() => {
      api
        .post<{ resultado: ResultadoDoEstudo }>(`/api/estudos/${id}/calcular`, { dados })
        .then((r) => {
          if (minha === versaoCalculo.current) setResultado(r.resultado)
        })
        .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao calcular'))
    }, 400)
    return () => clearTimeout(t)
  }, [dados, sujo, id])

  const alterar = useCallback((f: (d: DadosDoEstudo) => DadosDoEstudo) => {
    setDados((d) => (d ? f(d) : d))
    setSujo(true)
    setAviso(null)
  }, [])

  async function salvar(): Promise<boolean> {
    if (!dados) return false
    setSalvando(true)
    setErro(null)
    try {
      const r = await api.put<EstudoResposta>(`/api/estudos/${id}`, { dados })
      setEstudo(r)
      setResultado(r.resultado)
      setSujo(false)
      setAviso('Estudo salvo.')
      return true
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao salvar')
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function baixarPdf() {
    // O PDF usa o que está salvo: salva antes para sair igual ao que está na tela.
    if (sujo && !(await salvar())) return
    try {
      await baixarArquivo(`/api/estudos/${id}/pdf`, `estudo-de-viabilidade-${id.slice(0, 8)}.pdf`)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao gerar o PDF')
    }
  }

  async function pesquisarItem(itemId: string) {
    if (!estudo) return
    setPesquisando(itemId)
    setErro(null)
    try {
      const r = await api.post<PesquisaDePrecosResposta>(`/api/estudos/${id}/precos`, {
        itemId,
        uf: escopoUf === 'UF' ? estudo.tender.uf : null,
        meses,
      })
      setAmostras((a) => ({ ...a, [itemId]: r }))
      if (r.estatisticas) {
        const e = r.estatisticas
        alterar((d) => ({
          ...d,
          mercado: { ...d.mercado, [itemId]: { mediana: e.mediana, minimo: e.minimo, maximo: e.maximo, amostras: e.amostras, uf: r.filtro.uf, meses: r.filtro.meses, consultadoEm: r.consultadoEm } },
        }))
      } else {
        setAviso('Nenhuma compra encontrada para esse item nesse filtro. Tente ampliar o período ou pesquisar no Brasil todo.')
      }
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro na pesquisa de preços')
    } finally {
      setPesquisando(null)
    }
  }

  async function pesquisarTodos() {
    if (!estudo) return
    for (const it of estudo.itens.filter((i) => i.codigoCatalogo)) await pesquisarItem(it.id)
  }

  if (!user) return null
  if (erro && !estudo) {
    return (
      <div>
        <Link href="/escolhidas" className="text-sm text-indigo-700 hover:underline">
          ← Voltar às licitações escolhidas
        </Link>
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>
      </div>
    )
  }
  if (!estudo || !dados || !resultado) return <p className="text-sm text-slate-500">Carregando...</p>

  const t = estudo.tender
  const linhaPorItem = new Map(resultado.itens.map((l) => [l.id, l]))
  const temCatalogo = estudo.itens.some((i) => i.codigoCatalogo)
  const corLucro = resultado.lucro >= 0 ? 'text-emerald-700' : 'text-red-700'

  return (
    <div className="pb-24">
      <Link href="/escolhidas" className="text-sm text-indigo-700 hover:underline">
        ← Licitações escolhidas
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Estudo de custos e viabilidade</h1>
      <p className="mt-1 text-sm text-slate-700">{t.objeto.slice(0, 300)}</p>
      <p className="text-sm text-slate-500">
        {t.orgao ?? 'órgão n/d'} · {[t.municipio, t.uf].filter(Boolean).join('/') || 'local n/d'} · estimado pelo órgão: {brl(t.valorEstimado)}
        {t.encerramentoAt || t.aberturaAt ? ` · sessão: ${new Date((t.encerramentoAt ?? t.aberturaAt)!).toLocaleDateString('pt-BR')}` : ''}
      </p>

      {!estudo.base.definida && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          A base de entregas da empresa não está cadastrada, então a distância não pode ser estimada. Cadastre a cidade em{' '}
          <Link href="/empresa" className="underline">
            Empresa
          </Link>{' '}
          ou informe os quilômetros à mão abaixo.
        </p>
      )}
      {erro && <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      {/* ---------------- Itens ---------------- */}
      <section className="mt-5 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-medium text-slate-900">1. Itens, preços de mercado e seus valores</h2>
          {temCatalogo && (
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <div>
                <label className={campo}>Pesquisar preços em</label>
                <select value={escopoUf} onChange={(e) => setEscopoUf(e.target.value as 'BR' | 'UF')} className="rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="BR">Brasil todo</option>
                  {t.uf && <option value="UF">Só {t.uf}</option>}
                </select>
              </div>
              <div>
                <label className={campo}>Período</label>
                <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm">
                  {[6, 12, 24, 36].map((m) => (
                    <option key={m} value={m}>
                      {m} meses
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={pesquisarTodos} disabled={pesquisando !== null} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                {pesquisando ? 'Pesquisando…' : 'Pesquisar todos os itens'}
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          O preço de mercado é o que órgãos públicos efetivamente pagaram (Compras.gov.br), por código CATMAT/CATSER, sem valores absurdos. O seu custo e o seu preço de venda são seus.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs text-slate-600">
              <tr>
                <th className="py-2 pr-2">Item</th>
                <th className="px-2 py-2">Qtd.</th>
                <th className="px-2 py-2">Estimado (órgão)</th>
                <th className="px-2 py-2">Mercado (pago)</th>
                <th className="px-2 py-2">Seu custo un.</th>
                <th className="px-2 py-2">Seu preço un.</th>
                <th className="px-2 py-2">Mínimo un.</th>
              </tr>
            </thead>
            <tbody>
              {estudo.itens.map((it) => {
                const e = dados.itens[it.id] ?? { custoUnit: null, precoVendaUnit: null }
                const m = dados.mercado[it.id]
                const l = linhaPorItem.get(it.id)
                const amostra = amostras[it.id]
                return (
                  <tr key={it.id} className="border-t border-slate-100 align-top">
                    <td className="max-w-[260px] py-2 pr-2">
                      <span className="text-slate-900">
                        {it.numero ? `${it.numero}. ` : ''}
                        {it.descricao.slice(0, 160)}
                      </span>
                      {it.codigoCatalogo && <span className="block text-xs text-slate-500">{it.tipoCatalogo === 'SERVICO' ? 'CATSER' : 'CATMAT'} {it.codigoCatalogo}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {it.quantidade.toLocaleString('pt-BR')} {it.unidade ?? ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{brl(it.valorEstimadoUnit)}</td>
                    <td className="px-2 py-2 text-xs">
                      {m ? (
                        <div>
                          <div className="text-sm font-medium text-slate-900">{brl(m.mediana)}</div>
                          <div className="text-slate-500">
                            {brl(m.minimo)} a {brl(m.maximo)}
                          </div>
                          <div className="text-slate-500">
                            {m.amostras} compra(s), {m.uf ?? 'Brasil'}, {m.meses} meses
                          </div>
                          {amostra && amostra.recentes[0] && (
                            <div className="text-slate-400">
                              última: {brl(amostra.recentes[0].precoUnitario)} ({amostra.recentes[0].uf ?? '—'})
                            </div>
                          )}
                          <button onClick={() => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: e.custoUnit, precoVendaUnit: m.mediana } } }))} className="mt-1 text-indigo-700 hover:underline">
                            usar como meu preço
                          </button>
                        </div>
                      ) : it.codigoCatalogo ? (
                        <button onClick={() => pesquisarItem(it.id)} disabled={pesquisando !== null} className="rounded border border-indigo-300 px-2 py-1 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                          {pesquisando === it.id ? 'Pesquisando…' : 'Pesquisar preço'}
                        </button>
                      ) : (
                        <span className="text-slate-400">sem código de catálogo</span>
                      )}
                      {m && it.codigoCatalogo && (
                        <button onClick={() => pesquisarItem(it.id)} disabled={pesquisando !== null} className="ml-2 text-xs text-slate-500 hover:underline">
                          atualizar
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Numero moeda valor={e.custoUnit} aoMudar={(v) => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: v, precoVendaUnit: e.precoVendaUnit } } }))} className="w-28" placeholder="R$" />
                    </td>
                    <td className="px-2 py-2">
                      <Numero moeda valor={e.precoVendaUnit} aoMudar={(v) => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: e.custoUnit, precoVendaUnit: v } } }))} className="w-28" placeholder="R$" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-700">{brl(l?.precoMinimoUnit ?? null)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Deslocamento ---------------- */}
      <section className="mt-4 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-base font-medium text-slate-900">2. Deslocamento até o local da entrega</h2>
        <p className="mt-1 text-sm text-slate-600">
          Base: <strong>{estudo.base.municipio ? `${estudo.base.municipio}/${estudo.base.uf}` : 'não cadastrada'}</strong> → {[t.municipio, t.uf].filter(Boolean).join('/') || 'local n/d'}
          {estudo.distanciaLinhaRetaKm !== null && (
            <>
              {' '}
              · {estudo.distanciaLinhaRetaKm} km em linha reta (≈ {resultado.deslocamento.origem === 'estimado' ? resultado.deslocamento.kmIda : Math.round(estudo.distanciaLinhaRetaKm * 1.3)} km por estrada)
            </>
          )}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className={campo}>Km de ida (se souber)</label>
            <Numero valor={dados.deslocamento.kmIdaInformado} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, kmIdaInformado: v } }))} passo="1" className="w-full" placeholder="automático" />
          </div>
          <div>
            <label className={campo}>Viagens</label>
            <Numero valor={dados.deslocamento.viagens} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, viagens: Math.round(v ?? 0) } }))} passo="1" className="w-full" />
          </div>
          <div>
            <label className={campo}>R$ por km</label>
            <Numero moeda valor={dados.deslocamento.valorPorKm} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, valorPorKm: v ?? 0 } }))} className="w-full" />
          </div>
          <div>
            <label className={campo}>Pedágio por viagem</label>
            <Numero moeda valor={dados.deslocamento.pedagioPorViagem} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, pedagioPorViagem: v ?? 0 } }))} className="w-full" />
          </div>
          <div>
            <label className={campo}>Hospedagem/diárias por viagem</label>
            <Numero moeda valor={dados.deslocamento.hospedagemPorViagem} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, hospedagemPorViagem: v ?? 0 } }))} className="w-full" />
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {resultado.deslocamento.kmIda !== null ? `Ida e volta: ${resultado.deslocamento.kmIdaEVolta} km · ` : ''}custo por viagem {brl(resultado.deslocamento.custoPorViagem)} · total {brl(resultado.custoDeslocamento)}
        </p>
      </section>

      {/* ---------------- Impostos e outros ---------------- */}
      <section className="mt-4 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-base font-medium text-slate-900">3. Impostos, margem e outros custos</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className={campo}>Impostos sobre a venda (%)</label>
            <Numero valor={dados.impostosPct} aoMudar={(v) => alterar((d) => ({ ...d, impostosPct: Math.min(100, v ?? 0) }))} className="w-full" />
          </div>
          <div>
            <label className={campo}>Margem de lucro desejada (%)</label>
            <Numero valor={dados.margemDesejadaPct} aoMudar={(v) => alterar((d) => ({ ...d, margemDesejadaPct: Math.min(100, v ?? 0) }))} className="w-full" />
          </div>
        </div>
        <div className="mt-3">
          <label className={campo}>Outros custos (frete, instalação, mão de obra, garantia exigida, etc.)</label>
          {dados.outrosCustos.map((o, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input
                value={o.descricao}
                onChange={(e) => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) }))}
                placeholder="Descrição"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <Numero moeda valor={o.valor} aoMudar={(v) => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.map((x, j) => (j === i ? { ...x, valor: v ?? 0 } : x)) }))} className="w-32" placeholder="R$" />
              <button onClick={() => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.filter((_, j) => j !== i) }))} className="text-sm text-red-600 hover:underline">
                remover
              </button>
            </div>
          ))}
          {dados.outrosCustos.length < 40 && (
            <button onClick={() => alterar((d) => ({ ...d, outrosCustos: [...d.outrosCustos, { descricao: '', valor: 0 }] }))} className="text-sm text-indigo-700 hover:underline">
              + adicionar custo
            </button>
          )}
        </div>
      </section>

      {/* ---------------- Prazo ---------------- */}
      <section className="mt-4 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-base font-medium text-slate-900">4. Prazo de entrega ou execução</h2>
        {estudo.prazoDoEdital && <p className="mt-1 text-sm text-slate-600">O edital diz: “{estudo.prazoDoEdital}”. Confira e ajuste abaixo.</p>}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className={campo}>Prazo do edital (dias)</label>
            <Numero valor={dados.prazo.exigidoDias} aoMudar={(v) => alterar((d) => ({ ...d, prazo: { ...d.prazo, exigidoDias: v === null ? null : Math.round(v) } }))} passo="1" className="w-full" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-1 text-sm text-slate-700">
              <input type="checkbox" checked={dados.prazo.exigidoEmDiasUteis} onChange={(e) => alterar((d) => ({ ...d, prazo: { ...d.prazo, exigidoEmDiasUteis: e.target.checked } }))} /> dias úteis
            </label>
          </div>
          <div>
            <label className={campo}>Seu prazo de preparo (dias)</label>
            <Numero valor={dados.prazo.preparoDias} aoMudar={(v) => alterar((d) => ({ ...d, prazo: { ...d.prazo, preparoDias: Math.round(v ?? 0) } }))} passo="1" className="w-full" />
          </div>
          <div>
            <label className={campo}>Assinatura prevista</label>
            <input
              type="date"
              value={dados.prazo.assinatura ?? ''}
              onChange={(e) => alterar((d) => ({ ...d, prazo: { ...d.prazo, assinatura: e.target.value || null } }))}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Você precisa de {resultado.prazo.diasNecessarios} dia(s) ({dados.prazo.preparoDias} de preparo + {resultado.prazo.diasDeTransporte} de transporte).{' '}
          {resultado.prazo.situacao && (
            <span className={resultado.prazo.situacao === 'ok' ? 'font-medium text-emerald-700' : resultado.prazo.situacao === 'apertado' ? 'font-medium text-amber-700' : 'font-medium text-red-700'}>
              {resultado.prazo.situacao === 'ok' ? 'Cabe no prazo' : resultado.prazo.situacao === 'apertado' ? 'Prazo apertado' : 'Prazo inviável'} (folga de {resultado.prazo.folgaDias} dia(s)).
            </span>
          )}
          {resultado.prazo.dataEntregaPrevista && ` Entrega prevista: ${dataBr(resultado.prazo.dataEntregaPrevista)}${resultado.prazo.dataLimite ? ` · limite: ${dataBr(resultado.prazo.dataLimite)}` : ''}.`}
        </p>
      </section>

      {/* ---------------- Resultado ---------------- */}
      <section className="mt-4 rounded border border-slate-300 bg-slate-50 p-4">
        <h2 className="text-base font-medium text-slate-900">Resultado</h2>
        <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
          <p>Receita: <strong>{brl(resultado.receita)}</strong></p>
          <p>Custo dos itens: {brl(resultado.custoItens)}</p>
          <p>Deslocamento: {brl(resultado.custoDeslocamento)}</p>
          <p>Outros custos: {brl(resultado.custoOutros)}</p>
          <p>Impostos: {brl(resultado.impostos)}</p>
          <p>Custo total: <strong>{brl(resultado.custoTotal)}</strong></p>
        </div>
        <p className={`mt-3 text-2xl font-semibold ${corLucro}`}>
          {resultado.lucro >= 0 ? 'Lucro' : 'Prejuízo'}: {brl(resultado.lucro)}
          {resultado.margemPct !== null && <span className="ml-2 text-base font-normal">(margem {resultado.margemPct.toLocaleString('pt-BR')}%)</span>}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Preço mínimo para a margem de {dados.margemDesejadaPct}%: <strong>{resultado.receitaMinima === null ? '—' : brl(resultado.receitaMinima)}</strong>
        </p>

        {resultado.cenarios.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-600">
                <tr>
                  <th className="py-1">Se você der o lance…</th>
                  <th className="py-1">Valor</th>
                  <th className="py-1">Lucro / prejuízo</th>
                  <th className="py-1">Margem</th>
                </tr>
              </thead>
              <tbody>
                {resultado.cenarios.map((c) => (
                  <tr key={c.nome} className="border-t border-slate-200">
                    <td className="py-1 pr-2">{c.nome}</td>
                    <td className="py-1 pr-2">{brl(c.receita)}</td>
                    <td className={`py-1 pr-2 font-medium ${c.lucro >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{brl(c.lucro)}</td>
                    <td className="py-1">{c.margemPct === null ? '—' : `${c.margemPct.toLocaleString('pt-BR')}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultado.avisos.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
            {resultado.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Apoio à decisão: distância estimada em linha reta com correção; preços de mercado são os de compras anteriores de órgãos públicos; custos, impostos e prazos são os que você informou.
        </p>
      </section>

      {/* ---------------- Ações ---------------- */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {sujo ? 'Alterações não salvas.' : estudo.salvoEm ? `Salvo em ${new Date(estudo.salvoEm).toLocaleString('pt-BR')}.` : 'Estudo ainda não salvo.'}
          </p>
          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando || !sujo} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar estudo'}
            </button>
            <button onClick={baixarPdf} disabled={salvando} className="rounded border border-indigo-600 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              Baixar PDF — vou concorrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
