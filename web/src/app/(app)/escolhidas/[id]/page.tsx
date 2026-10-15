'use client'

import { formatarData } from '@/lib/datas'
import { use, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileDown, FileSignature, FolderArchive, Gavel, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError, baixarArquivo } from '@/lib/api'
import { DadosDoEstudo, EstudoResposta, PesquisaDePrecosResposta, ResultadoDoEstudo } from '@/lib/estudoTypes'
import {
  Button,
  Carregando,
  Checkbox,
  DescriptionList,
  Field,
  Input,
  LinkButton,
  Metric,
  MetricRow,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  TextLink,
  Th,
  THead,
  Tr,
  cx,
} from '@/components/ui'

const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso: string | null) => formatarData(iso)

function ComSeparadores({ partes }: { partes: ReactNode[] }) {
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i}>
          {parte}
          {i < partes.length - 1 && (
            <span aria-hidden className="ml-2 text-faint">
              ·
            </span>
          )}
        </span>
      ))}
    </>
  )
}

function lerNumero(texto: string): number | null {
  let t = texto.replace(/[^0-9.,]/g, '')
  if (t === '') return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (!/^[0-9]+\.[0-9]{1,2}$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

type AtributosDoCampo = Pick<ComponentProps<'input'>, 'id' | 'aria-describedby' | 'aria-invalid' | 'aria-label' | 'required'>

function Numero({
  valor,
  aoMudar,
  passo = '0.01',
  moeda = false,
  placeholder,
  ...atributos
}: {
  valor: number | null
  aoMudar: (v: number | null) => void
  passo?: string
  moeda?: boolean
  placeholder?: string
} & AtributosDoCampo) {
  const [editando, setEditando] = useState<string | null>(null)
  const inteiro = passo === '1'
  const formatado =
    valor === null || valor === 0
      ? ''
      : moeda
        ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : valor.toLocaleString('pt-BR', { maximumFractionDigits: inteiro ? 0 : 4 })
  return (
    <Input
      {...atributos}
      type="text"
      inputMode={inteiro ? 'numeric' : 'decimal'}
      placeholder={placeholder ?? (moeda ? 'R$ 0,00' : '0')}
      value={editando ?? formatado}
      onFocus={(e) => {
        setEditando(valor === null || valor === 0 ? '' : String(valor).replace('.', ','))
        const campoDigitado = e.target
        setTimeout(() => campoDigitado.select(), 0)
      }}
      onChange={(e) => {
        setEditando(e.target.value)
        aoMudar(lerNumero(e.target.value))
      }}
      onBlur={() => setEditando(null)}
      className="font-mono"
    />
  )
}

function Valor({ children, forte = false }: { children: ReactNode; forte?: boolean }) {
  return <span className={cx('font-mono', forte ? 'font-semibold text-ink' : 'text-ink-2')}>{children}</span>
}

const SITUACAO_DO_PRAZO = {
  ok: { rotulo: 'Cabe no prazo', tom: 'neutral' },
  apertado: { rotulo: 'Prazo apertado', tom: 'warn' },
  inviavel: { rotulo: 'Prazo inviável', tom: 'danger' },
} as const

export default function EstudoDeCustosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useRequireSession()
  const router = useRouter()
  const [estudo, setEstudo] = useState<EstudoResposta | null>(null)
  const [dados, setDados] = useState<DadosDoEstudo | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoEstudo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [gerandoPacote, setGerandoPacote] = useState(false)
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
    if (sujo && !(await salvar())) return
    try {
      await baixarArquivo(`/api/estudos/${id}/pdf`, `dossie-da-licitacao-${id.slice(0, 8)}.pdf`)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao gerar o PDF')
    }
  }

  async function baixarPacote() {
    if (sujo && !(await salvar())) return
    setGerandoPacote(true)
    try {
      await baixarArquivo(`/api/estudos/${id}/pacote`, `pacote-de-habilitacao-${id.slice(0, 8)}.zip`)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao gerar o pacote')
    } finally {
      setGerandoPacote(false)
    }
  }

  async function abrirProposta() {
    if (sujo && !(await salvar())) return
    router.push(`/tenders/${id}/documentos?tipo=proposta`)
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

  const voltar = { href: '/escolhidas', label: 'Licitações escolhidas' }

  if (!user) return null
  if (erro && !estudo) {
    return (
      <>
        <PageHeader back={voltar} title="Estudo de custos e viabilidade" />
        <Notice tone="danger">{erro}</Notice>
      </>
    )
  }
  if (!estudo || !dados || !resultado) {
    return (
      <>
        <PageHeader back={voltar} title="Estudo de custos e viabilidade" />
        <Carregando linhas={6} texto="Carregando o estudo…" />
      </>
    )
  }

  const t = estudo.tender
  const linhaPorItem = new Map(resultado.itens.map((l) => [l.id, l]))
  const temCatalogo = estudo.itens.some((i) => i.codigoCatalogo)
  const custosAcimaDoEstimado = t.valorEstimado !== null && t.valorEstimado !== undefined && t.valorEstimado > 0 && resultado.custoTotal > t.valorEstimado
  const local = [t.municipio, t.uf].filter(Boolean).join('/')
  const destino = local || 'local n/d'
  const dataDaSessao = t.encerramentoAt ?? t.aberturaAt
  const situacao = resultado.prazo.situacao ? SITUACAO_DO_PRAZO[resultado.prazo.situacao] : null

  return (
    <>
      <PageHeader
        back={voltar}
        title="Estudo de custos e viabilidade"
        description={
          <div className="flex flex-col gap-1">
            <p className="max-w-4xl text-ink-2">{t.objeto.slice(0, 300)}</p>
            <p className="flex flex-wrap gap-x-2 gap-y-0.5">
              <ComSeparadores
                partes={[
                  t.orgao,
                  local,
                  <>
                    estimado pelo órgão: <Valor>{brl(t.valorEstimado)}</Valor>
                  </>,
                  dataDaSessao && (
                    <>
                      sessão: <Valor>{formatarData(dataDaSessao)}</Valor>
                    </>
                  ),
                ].filter(Boolean)}
              />
            </p>
          </div>
        }
      />

      {!estudo.base.definida && (
        <Notice tone="warn">
          A base de entregas da empresa não está cadastrada, então a distância não pode ser estimada. Cadastre a cidade em <TextLink href="/empresa">Empresa</TextLink> ou
          informe os quilômetros à mão abaixo.
        </Notice>
      )}
      {erro && <Notice tone="danger">{erro}</Notice>}
      {aviso && <Notice tone="info">{aviso}</Notice>}

      <Panel
        title="1. Itens, preços de mercado e seus valores"
        description="O preço de mercado é o que órgãos públicos efetivamente pagaram (Compras.gov.br), por código CATMAT/CATSER, sem valores absurdos. O seu custo e o seu preço de venda são seus."
      >
        <div className="flex flex-col gap-4">
          {temCatalogo && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Pesquisar preços em" className="w-full sm:w-44">
                <Select value={escopoUf} onChange={(e) => setEscopoUf(e.target.value as 'BR' | 'UF')}>
                  <option value="BR">Brasil todo</option>
                  {t.uf && <option value="UF">Só {t.uf}</option>}
                </Select>
              </Field>
              <Field label="Período" className="w-full sm:w-36">
                <Select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                  {[6, 12, 24, 36].map((m) => (
                    <option key={m} value={m}>
                      {m} meses
                    </option>
                  ))}
                </Select>
              </Field>
              <Button icon={Search} onClick={pesquisarTodos} disabled={pesquisando !== null} loading={pesquisando !== null}>
                {pesquisando ? 'Pesquisando…' : 'Pesquisar todos os itens'}
              </Button>
            </div>
          )}

          <TableWrap minWidth={940}>
            <Table>
              <THead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qtd.</Th>
                  <Th align="right">Estimado (órgão)</Th>
                  <Th>Mercado (pago)</Th>
                  <Th>Seu custo un.</Th>
                  <Th>Seu preço un.</Th>
                  <Th align="right">Mínimo un.</Th>
                </tr>
              </THead>
              <tbody>
                {estudo.itens.map((it) => {
                  const e = dados.itens[it.id] ?? { custoUnit: null, precoVendaUnit: null }
                  const m = dados.mercado[it.id]
                  const l = linhaPorItem.get(it.id)
                  const amostra = amostras[it.id]
                  const nomeDoItem = it.numero ? `item ${it.numero}` : it.descricao.slice(0, 40)
                  return (
                    <Tr key={it.id}>
                      <Td className="max-w-[260px]">
                        <span className="line-clamp-2 text-ink" title={it.descricao}>
                          {it.numero ? <span className="font-mono text-muted">{it.numero}. </span> : ''}
                          {it.descricao}
                        </span>
                        {it.codigoCatalogo && (
                          <span className="mt-0.5 block font-mono text-2xs text-muted">
                            {it.tipoCatalogo === 'SERVICO' ? 'CATSER' : 'CATMAT'} {it.codigoCatalogo}
                          </span>
                        )}
                      </Td>
                      <Td numeric>
                        {it.quantidade.toLocaleString('pt-BR')} <span className="text-muted">{it.unidade ?? ''}</span>
                      </Td>
                      <Td numeric>{brl(it.valorEstimadoUnit)}</Td>
                      <Td className="min-w-[200px] text-xs">
                        {m ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-sm font-medium text-ink">{brl(m.mediana)}</span>
                            <span className="font-mono text-muted">
                              {brl(m.minimo)} a {brl(m.maximo)}
                            </span>
                            <span className="text-muted">
                              <span className="font-mono">{m.amostras}</span> compra(s), {m.uf ?? 'Brasil'}, <span className="font-mono">{m.meses}</span> meses
                            </span>
                            {amostra && amostra.recentes[0] && (
                              <span className="text-faint">
                                última: <span className="font-mono">{brl(amostra.recentes[0].precoUnitario)}</span> ({amostra.recentes[0].uf ?? '—'})
                              </span>
                            )}
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <button
                                type="button"
                                onClick={() => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: e.custoUnit, precoVendaUnit: m.mediana } } }))}
                                className="font-medium text-accent hover:underline"
                              >
                                usar como meu preço
                              </button>
                              {it.codigoCatalogo && (
                                <button
                                  type="button"
                                  onClick={() => pesquisarItem(it.id)}
                                  disabled={pesquisando !== null}
                                  className="inline-flex items-center gap-1 text-muted hover:text-ink disabled:opacity-50"
                                >
                                  <RefreshCw size={12} aria-hidden className={pesquisando === it.id ? 'animate-spin' : undefined} />
                                  atualizar
                                </button>
                              )}
                            </span>
                          </div>
                        ) : it.codigoCatalogo ? (
                          <Button size="sm" icon={Search} onClick={() => pesquisarItem(it.id)} disabled={pesquisando !== null} loading={pesquisando === it.id}>
                            {pesquisando === it.id ? 'Pesquisando…' : 'Pesquisar preço'}
                          </Button>
                        ) : (
                          <span className="text-faint">sem código de catálogo</span>
                        )}
                      </Td>
                      <Td>
                        <div className="w-36">
                          <Numero
                            moeda
                            aria-label={`Seu custo unitário, ${nomeDoItem}`}
                            valor={e.custoUnit}
                            aoMudar={(v) => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: v, precoVendaUnit: e.precoVendaUnit } } }))}
                          />
                        </div>
                      </Td>
                      <Td>
                        <div className="w-36">
                          <Numero
                            moeda
                            aria-label={`Seu preço unitário, ${nomeDoItem}`}
                            valor={e.precoVendaUnit}
                            aoMudar={(v) => alterar((d) => ({ ...d, itens: { ...d.itens, [it.id]: { custoUnit: e.custoUnit, precoVendaUnit: v } } }))}
                          />
                        </div>
                      </Td>
                      <Td numeric className="text-ink-2">
                        {brl(l?.precoMinimoUnit ?? null)}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      </Panel>

      <Panel
        title="2. Deslocamento até o local da entrega"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            Base: <strong className="font-semibold text-ink-2">{estudo.base.municipio ? `${estudo.base.municipio}/${estudo.base.uf}` : 'não cadastrada'}</strong>
            <ArrowRight size={12} aria-label="até" />
            {destino}
            {estudo.distanciaLinhaRetaKm !== null && (
              <>
                {' '}
                · <span className="font-mono">{estudo.distanciaLinhaRetaKm} km</span> em linha reta (≈{' '}
                <span className="font-mono">
                  {resultado.deslocamento.origem === 'estimado' ? resultado.deslocamento.kmIda : Math.round(estudo.distanciaLinhaRetaKm * 1.3)} km
                </span>{' '}
                por estrada)
              </>
            )}
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Km de ida (se souber)">
              <Numero valor={dados.deslocamento.kmIdaInformado} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, kmIdaInformado: v } }))} passo="1" placeholder="automático" />
            </Field>
            <Field label="Viagens">
              <Numero valor={dados.deslocamento.viagens} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, viagens: Math.round(v ?? 0) } }))} passo="1" />
            </Field>
            <Field label="R$ por km">
              <Numero moeda valor={dados.deslocamento.valorPorKm} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, valorPorKm: v ?? 0 } }))} />
            </Field>
            <Field label="Pedágio por viagem">
              <Numero moeda valor={dados.deslocamento.pedagioPorViagem} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, pedagioPorViagem: v ?? 0 } }))} />
            </Field>
            <Field label="Hospedagem/diárias por viagem">
              <Numero moeda valor={dados.deslocamento.hospedagemPorViagem} aoMudar={(v) => alterar((d) => ({ ...d, deslocamento: { ...d.deslocamento, hospedagemPorViagem: v ?? 0 } }))} />
            </Field>
          </div>
          <p className="border-t border-line-soft pt-3 text-sm text-ink-2">
            {resultado.deslocamento.kmIda !== null && (
              <>
                Ida e volta: <Valor>{resultado.deslocamento.kmIdaEVolta} km</Valor> ·{' '}
              </>
            )}
            custo por viagem <Valor>{brl(resultado.deslocamento.custoPorViagem)}</Valor> · total <Valor forte>{brl(resultado.custoDeslocamento)}</Valor>
          </p>
        </div>
      </Panel>

      <Panel title="3. Impostos, margem e outros custos">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Impostos sobre a venda (%)">
              <Numero valor={dados.impostosPct} aoMudar={(v) => alterar((d) => ({ ...d, impostosPct: Math.min(100, v ?? 0) }))} />
            </Field>
            <Field label="Margem de lucro desejada (%)">
              <Numero valor={dados.margemDesejadaPct} aoMudar={(v) => alterar((d) => ({ ...d, margemDesejadaPct: Math.min(100, v ?? 0) }))} />
            </Field>
          </div>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-xs font-medium text-muted">Outros custos (frete, instalação, mão de obra, garantia exigida, etc.)</legend>
            {dados.outrosCustos.map((o, i) => (
              <div key={i} className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label={`Descrição do custo ${i + 1}`}
                    value={o.descricao}
                    onChange={(e) => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) }))}
                    placeholder="Descrição"
                  />
                </div>
                <div className="w-32 shrink-0 sm:w-40">
                  <Numero
                    moeda
                    aria-label={`Valor do custo ${i + 1}`}
                    valor={o.valor}
                    aoMudar={(v) => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.map((x, j) => (j === i ? { ...x, valor: v ?? 0 } : x)) }))}
                  />
                </div>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Remover custo ${i + 1}`}
                  onClick={() => alterar((d) => ({ ...d, outrosCustos: d.outrosCustos.filter((_, j) => j !== i) }))}
                />
              </div>
            ))}
            {dados.outrosCustos.length < 40 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Plus}
                  onClick={() => alterar((d) => ({ ...d, outrosCustos: [...d.outrosCustos, { descricao: '', valor: 0 }] }))}
                >
                  Adicionar custo
                </Button>
              </div>
            )}
          </fieldset>
        </div>
      </Panel>

      <Panel
        title="4. Prazo de entrega ou execução"
        description={estudo.prazoDoEdital ? `O edital diz: “${estudo.prazoDoEdital}”. Confira e ajuste abaixo.` : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Field label="Prazo do edital (dias)">
                <Numero
                  valor={dados.prazo.exigidoDias}
                  aoMudar={(v) => alterar((d) => ({ ...d, prazo: { ...d.prazo, exigidoDias: v === null ? null : Math.round(v) } }))}
                  passo="1"
                />
              </Field>
              <Checkbox
                label="Dias úteis"
                checked={dados.prazo.exigidoEmDiasUteis}
                onChange={(e) => alterar((d) => ({ ...d, prazo: { ...d.prazo, exigidoEmDiasUteis: e.target.checked } }))}
              />
            </div>
            <Field label="Seu prazo de preparo (dias)">
              <Numero valor={dados.prazo.preparoDias} aoMudar={(v) => alterar((d) => ({ ...d, prazo: { ...d.prazo, preparoDias: Math.round(v ?? 0) } }))} passo="1" />
            </Field>
            <Field label="Assinatura prevista">
              <Input
                type="date"
                value={dados.prazo.assinatura ?? ''}
                onChange={(e) => alterar((d) => ({ ...d, prazo: { ...d.prazo, assinatura: e.target.value || null } }))}
                className="font-mono"
              />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3 text-sm text-ink-2">
            <p>
              Você precisa de <Valor forte>{resultado.prazo.diasNecessarios}</Valor> dia(s) (<Valor>{dados.prazo.preparoDias}</Valor> de preparo +{' '}
              <Valor>{resultado.prazo.diasDeTransporte}</Valor> de transporte).
            </p>
            {situacao && (
              <p className="flex flex-wrap items-center gap-2">
                <StatusTag tone={situacao.tom} dot>
                  {situacao.rotulo}
                </StatusTag>
                <span>
                  folga de <Valor>{resultado.prazo.folgaDias}</Valor> dia(s).
                </span>
              </p>
            )}
            {resultado.prazo.dataEntregaPrevista && (
              <p>
                Entrega prevista: <Valor>{dataBr(resultado.prazo.dataEntregaPrevista)}</Valor>
                {resultado.prazo.dataLimite && (
                  <>
                    {' '}
                    · limite: <Valor>{dataBr(resultado.prazo.dataLimite)}</Valor>
                  </>
                )}
                .
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Resultado">
        <div className="flex flex-col gap-4">
          <MetricRow>
            <Metric label="Total dos custos" value={brl(resultado.custoTotal)} tone={custosAcimaDoEstimado ? 'danger' : 'default'} className="col-span-2 sm:col-span-1" />
            <Metric
              label={resultado.receita > 0 ? (resultado.lucro >= 0 ? 'Lucro estimado' : 'Resultado com os seus preços') : 'Lucro estimado'}
              value={resultado.receita > 0 ? brl(resultado.lucro) : '—'}
              tone={resultado.receita > 0 && resultado.lucro < 0 ? 'warn' : 'default'}
              detail={
                resultado.receita > 0
                  ? resultado.margemPct !== null
                    ? `margem ${resultado.margemPct.toLocaleString('pt-BR')}%`
                    : undefined
                  : 'Informe os preços de venda dos itens para ver o lucro estimado.'
              }
            />
            <Metric
              label={`Preço mínimo para a margem de ${dados.margemDesejadaPct}%`}
              value={resultado.receitaMinima === null ? '—' : brl(resultado.receitaMinima)}
            />
          </MetricRow>

          {custosAcimaDoEstimado && (
            <Notice tone="danger" title="Custo acima do valor estimado pelo órgão">
              O total dos custos ({brl(resultado.custoTotal)}) é maior que o valor estimado pelo órgão ({brl(t.valorEstimado)}). Concorrer nesse valor daria prejuízo.
            </Notice>
          )}

          <DescriptionList
            columns={3}
            items={[
              { label: 'Receita', value: brl(resultado.receita), mono: true },
              { label: 'Custo dos itens', value: brl(resultado.custoItens), mono: true },
              { label: 'Deslocamento', value: brl(resultado.custoDeslocamento), mono: true },
              { label: 'Outros custos', value: brl(resultado.custoOutros), mono: true },
              { label: 'Impostos', value: brl(resultado.impostos), mono: true },
              { label: 'Custo total', value: <span className="font-semibold">{brl(resultado.custoTotal)}</span>, mono: true },
            ]}
          />

          {resultado.cenarios.length > 0 && (
            <TableWrap minWidth={520}>
              <Table>
                <THead>
                  <tr>
                    <Th>Se você der o lance…</Th>
                    <Th align="right">Valor</Th>
                    <Th align="right">Resultado</Th>
                    <Th align="right">Margem</Th>
                  </tr>
                </THead>
                <tbody>
                  {resultado.cenarios.map((c) => (
                    <Tr key={c.nome}>
                      <Td>{c.nome}</Td>
                      <Td numeric>{brl(c.receita)}</Td>
                      <Td numeric className={cx('font-medium', c.lucro < 0 && 'text-warn')}>
                        {brl(c.lucro)}
                      </Td>
                      <Td numeric>{c.margemPct === null ? '—' : `${c.margemPct.toLocaleString('pt-BR')}%`}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {resultado.avisos.length > 0 && (
            <Notice tone="warn">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {resultado.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Notice>
          )}

          <p className="text-xs text-faint">
            Apoio à decisão: distância estimada em linha reta com correção; preços de mercado são os de compras anteriores de órgãos públicos; custos, impostos e prazos são os que você informou.
          </p>
        </div>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-4 -mb-6 border-t border-line bg-surface px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mb-7 lg:px-8">
        {erro && (
          <p role="alert" className="mb-1.5 truncate text-xs font-medium text-danger" title={erro}>
            {erro}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-baseline gap-x-2 text-sm">
            <span className="shrink-0 text-xs text-muted">Total</span>
            <span className={cx('truncate font-mono font-semibold', custosAcimaDoEstimado ? 'text-danger' : 'text-ink')}>{brl(resultado.custoTotal)}</span>
            <span className={cx('hidden truncate text-xs sm:inline', sujo ? 'font-medium text-warn' : 'text-muted')}>
              {sujo ? (
                'Alterações não salvas'
              ) : estudo.salvoEm ? (
                <>
                  Salvo em <span className="font-mono">{formatarData(estudo.salvoEm, { comHora: true })}</span>
                </>
              ) : (
                'Estudo ainda não salvo'
              )}
            </span>
          </p>
          <div className="ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-2">
            <Button variant="primary" size="sm" icon={Save} onClick={salvar} disabled={!sujo} loading={salvando} aria-label={sujo ? 'Salvar estudo (alterações não salvas)' : 'Salvar estudo'}>
              Salvar
            </Button>
            <Button size="sm" icon={FileDown} onClick={baixarPdf} disabled={salvando} aria-label="Baixar dossiê em PDF — vou concorrer">
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Baixar dossiê em PDF — vou concorrer</span>
            </Button>
            <Button
              size="sm"
              icon={FolderArchive}
              onClick={baixarPacote}
              disabled={salvando}
              loading={gerandoPacote}
              aria-label="Baixar pacote de habilitação (dossiê e arquivos dos documentos em ZIP)"
              title="Dossiê em PDF e os arquivos dos documentos exigidos, num ZIP"
            >
              <span className="sm:hidden">ZIP</span>
              <span className="hidden sm:inline">Pacote com documentos (ZIP)</span>
            </Button>
            <Button
              size="sm"
              icon={FileSignature}
              onClick={abrirProposta}
              disabled={salvando}
              aria-label={sujo ? 'Salvar o estudo e gerar a proposta comercial' : 'Gerar a proposta comercial'}
              title="Proposta comercial com os preços de venda deste estudo"
            >
              Proposta
            </Button>
            <LinkButton size="sm" icon={Gavel} href={`/tenders/${id}/pregao`} aria-label="Pregão com a Bela: acompanhar os lances ao vivo" title="Copiloto de lances para o dia do pregão">
              <span className="sm:hidden">Pregão</span>
              <span className="hidden sm:inline">Pregão com a Bela</span>
            </LinkButton>
          </div>
        </div>
      </div>
    </>
  )
}
