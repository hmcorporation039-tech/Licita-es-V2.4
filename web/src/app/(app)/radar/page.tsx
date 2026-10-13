'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { FileSearch, Lightbulb, ListPlus, Search } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import {
  Button,
  Carregando,
  Checkbox,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Metric,
  MetricRow,
  Notice,
  PageHeader,
  Panel,
  Prazo,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Tabs,
  Td,
  TextLink,
  Th,
  THead,
  Tr,
  cx,
  useAbaNaUrl,
  type Aba,
} from '@/components/ui'

interface Contrato {
  id: string
  orgao: { cnpj: string; nome: string; uf: string | null; municipio: string | null }
  fornecedor: { ni: string; nome: string }
  objeto: string
  valorGlobal: number
  assinatura: string | null
  vigenciaFim: string | null
  categoria: string | null
  diasRestantes?: number
  noSeuRamo?: boolean
}
interface RespostaVencendo {
  totalVencendo: number
  termosUsados: string[]
  contratos: Contrato[]
}
interface Dossie {
  cnpj: string
  fornecedor: { ni: string; nome: string } | null
  totalDeContratos: number
  valorTotal: number
  primeiraAssinatura: string | null
  ultimaAssinatura: string | null
  porOrgao: { cnpj: string; nome: string; contratos: number; valor: number }[]
  porUf: { uf: string; contratos: number; valor: number }[]
  porCategoria: { categoria: string; contratos: number; valor: number }[]
  ultimosContratos: Contrato[]
  vencendoEm90Dias: Contrato[]
}
interface UasgBusca {
  codigoUasg: string
  nomeUasg: string
  nomeOrgao: string | null
  siglaUf: string | null
  cnpjOrgao: string | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')
const fimDoDia = (d: string | null) => (d ? `${d}T23:59:59-03:00` : null)

type AbaDoRadar = 'vencendo' | 'concorrente' | 'perfil'
const ABAS: Aba<AbaDoRadar>[] = [
  { id: 'vencendo', label: 'Contratos vencendo' },
  { id: 'concorrente', label: 'Dossiê de concorrente' },
  { id: 'perfil', label: 'Perfilador' },
]
const IDS_DAS_ABAS = ABAS.map((a) => a.id)

export default function RadarPage() {
  const user = useRequireSession()
  const [aba, setAba] = useAbaNaUrl<AbaDoRadar>(IDS_DAS_ABAS, 'vencendo')

  if (!user) return null
  return (
    <>
      <PageHeader
        title="Radar de oportunidades"
        description="Dados públicos de contratos do PNCP: veja o que está para vencer nos órgãos que você atende e estude seus concorrentes."
      />
      <div className="flex flex-col gap-5">
        <Tabs tabs={ABAS} value={aba} onChange={setAba} label="Seções do radar" />
        <div role="tabpanel" aria-labelledby={`aba-${aba}`} className="flex flex-col gap-5">
          {aba === 'vencendo' ? <ContratosVencendo /> : aba === 'concorrente' ? <DossieConcorrente /> : <Perfilador />}
        </div>
      </div>
    </>
  )
}

function ContratosVencendo() {
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<UasgBusca[]>([])
  const [orgao, setOrgao] = useState<{ cnpj: string; nome: string } | null>(null)
  const [dias, setDias] = useState(120)
  const [todos, setTodos] = useState(false)
  const [resp, setResp] = useState<RespostaVencendo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ativo, setAtivo] = useState(-1)
  const campoId = useId()
  const listaId = `${campoId}-orgaos`

  useEffect(() => {
    setAtivo(-1)
  }, [opcoes])

  async function procurarOrgao(q: string) {
    setBusca(q)
    const digitos = q.replace(/\D/g, '')
    if (digitos.length === 14) {
      setOrgao({ cnpj: digitos, nome: `CNPJ ${digitos}` })
      setOpcoes([])
      return
    }
    if (q.trim().length < 3) return setOpcoes([])
    try {
      const r = await api.get<UasgBusca[]>(`/api/uasg/search?q=${encodeURIComponent(q.trim())}`)
      setOpcoes(r.filter((o) => o.cnpjOrgao))
    } catch {
      setOpcoes([])
    }
  }

  function escolherOrgao(o: UasgBusca) {
    setOrgao({ cnpj: o.cnpjOrgao!, nome: `${o.nomeOrgao ?? o.nomeUasg}${o.siglaUf ? ' — ' + o.siglaUf : ''}` })
    setOpcoes([])
  }

  async function consultar() {
    if (!orgao) return
    setCarregando(true)
    setErro(null)
    setResp(null)
    try {
      setResp(await api.get<RespostaVencendo>(`/api/radar/contratos-vencendo?cnpjOrgao=${orgao.cnpj}&dias=${dias}&todos=${todos ? 1 : 0}`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao consultar')
    } finally {
      setCarregando(false)
    }
  }

  const listaAberta = opcoes.length > 0 && !orgao

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (!listaAberta) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((i) => Math.min(opcoes.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && ativo >= 0 && opcoes[ativo]) {
      e.preventDefault()
      escolherOrgao(opcoes[ativo])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpcoes([])
    }
  }

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <Field label="Órgão (nome ou CNPJ)" id={campoId} className="sm:min-w-[18rem] sm:flex-1">
            <div id={`${campoId}-caixa`} className="relative">
              <Input
                id={campoId}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listaAberta}
                aria-controls={listaId}
                aria-activedescendant={listaAberta && ativo >= 0 ? `${listaId}-${ativo}` : undefined}
                autoComplete="off"
                value={orgao ? orgao.nome : busca}
                onChange={(e) => {
                  setOrgao(null)
                  void procurarOrgao(e.target.value)
                }}
                onKeyDown={aoTeclar}
                placeholder="Ex.: Prefeitura de Goiânia ou 01.612.092/0001-23"
              />
              {listaAberta && (
                <ul id={listaId} role="listbox" aria-label="Órgãos encontrados" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-line bg-surface text-sm">
                  {opcoes.map((o, i) => (
                    <li
                      key={o.codigoUasg}
                      id={`${listaId}-${i}`}
                      role="option"
                      aria-selected={i === ativo}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setAtivo(i)}
                      onClick={() => escolherOrgao(o)}
                      className={cx('cursor-pointer border-b border-line-soft px-3 py-2 last:border-0', i === ativo && 'bg-accent-soft')}
                    >
                      <span className="text-ink">{o.nomeOrgao ?? o.nomeUasg}</span>{' '}
                      {o.siglaUf && <span className="font-mono text-xs text-muted">{o.siglaUf}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Vencem em até" className="sm:w-36">
            <Select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {[30, 60, 90, 120, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox className="sm:pb-2.5" label="Mostrar também fora do meu ramo" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
          <Button variant="primary" icon={Search} loading={carregando} disabled={!orgao} onClick={consultar}>
            {carregando ? 'Consultando o PNCP…' : 'Consultar'}
          </Button>
        </div>
      </Panel>

      {carregando && <Carregando linhas={5} texto="Consultando o PNCP…" />}
      {erro && <ErrorState message={erro} onRetry={consultar} />}
      {resp && (
        <section className="flex flex-col gap-3" aria-label="Contratos vencendo">
          <p className="text-sm text-ink-2">
            <span className="font-mono">{resp.totalVencendo}</span> contrato(s) vencem nesse prazo
            {resp.termosUsados.length > 0 && !todos ? (
              <>
                ; mostrando os que casam com seus itens monitorados (<span className="font-mono">{resp.contratos.length}</span>).
              </>
            ) : resp.termosUsados.length === 0 ? (
              '. Cadastre itens monitorados com palavras-chave para destacar o que é do seu ramo.'
            ) : (
              '.'
            )}
          </p>
          {resp.contratos.length === 0 ? (
            <EmptyState title="Nenhum contrato encontrado." description="Aumente o prazo ou marque para mostrar também o que está fora do seu ramo." />
          ) : (
            <TableWrap minWidth={760}>
              <Table>
                <THead>
                  <tr>
                    <Th className="w-32">Vence</Th>
                    <Th>Objeto</Th>
                    <Th className="w-56">Fornecedor atual</Th>
                    <Th align="right" className="w-36">
                      Valor
                    </Th>
                  </tr>
                </THead>
                <tbody>
                  {resp.contratos.map((c) => (
                    <Tr key={c.id}>
                      <Td>
                        <Prazo data={fimDoDia(c.vigenciaFim)} semHora />
                      </Td>
                      <Td>
                        {c.noSeuRamo && (
                          <StatusTag tone="accent" className="mb-1">
                            no seu ramo
                          </StatusTag>
                        )}
                        <p className="text-ink">{c.objeto.slice(0, 220)}</p>
                      </Td>
                      <Td>
                        <p className="text-ink-2">{c.fornecedor.nome}</p>
                        <p className="font-mono text-xs text-muted">{c.fornecedor.ni}</p>
                      </Td>
                      <Td numeric>
                        {brl(c.valorGlobal)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>
      )}
    </>
  )
}

function DossieConcorrente() {
  const [cnpj, setCnpj] = useState('')
  const [d, setD] = useState<Dossie | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function consultar() {
    setCarregando(true)
    setErro(null)
    setD(null)
    try {
      setD(await api.get<Dossie>(`/api/radar/concorrente/${cnpj.replace(/\D/g, '')}`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao consultar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="CNPJ do concorrente" className="sm:w-64">
            <Input inputMode="numeric" className="font-mono" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </Field>
          <Button variant="primary" icon={FileSearch} loading={carregando} disabled={cnpj.replace(/\D/g, '').length !== 14} onClick={consultar}>
            {carregando ? 'Consultando o PNCP…' : 'Gerar dossiê'}
          </Button>
        </div>
      </Panel>

      {carregando && <Carregando linhas={5} texto="Consultando o PNCP…" />}
      {erro && <ErrorState message={erro} onRetry={consultar} />}
      {d && d.totalDeContratos === 0 && <EmptyState title="Nenhum contrato público encontrado no PNCP com esse CNPJ como fornecedor." />}
      {d && d.totalDeContratos > 0 && (
        <>
          <section className="flex flex-col gap-3" aria-label="Resumo do concorrente">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-ink">{d.fornecedor?.nome}</h2>
              <p className="text-xs text-muted">Considera os contratos mais recentes em que esse CNPJ é o fornecedor, publicados no PNCP (até 3.000).</p>
            </div>
            <MetricRow>
              <Metric label="Contratos" value={d.totalDeContratos} />
              <Metric label="Valor total" value={<span className="break-all text-xl sm:text-2xl">{brl(d.valorTotal)}</span>} />
              <Metric label="Primeira assinatura" value={data(d.primeiraAssinatura)} />
              <Metric label="Última assinatura" value={data(d.ultimaAssinatura)} />
            </MetricRow>
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Agrupamento titulo="Principais órgãos" coluna="Órgão" linhas={d.porOrgao.map((o) => ({ rotulo: o.nome, contratos: o.contratos, valor: o.valor }))} />
            <Agrupamento titulo="Por estado" coluna="UF" linhas={d.porUf.slice(0, 10).map((u) => ({ rotulo: u.uf, contratos: u.contratos, valor: u.valor }))} />
            <Agrupamento titulo="Por modalidade" coluna="Modalidade" linhas={d.porCategoria.map((c) => ({ rotulo: c.categoria, contratos: c.contratos, valor: c.valor }))} />
          </div>
          <ListaDeContratos titulo="Contratos dele que vencem em 90 dias (chance de disputar)" colunaData="Vence" contratos={d.vencendoEm90Dias.slice(0, 15)} prazo />
          <ListaDeContratos titulo="Últimos contratos assinados" colunaData="Assinatura" contratos={d.ultimosContratos} />
        </>
      )}
    </>
  )
}

function Agrupamento({ titulo, coluna, linhas }: { titulo: string; coluna: string; linhas: { rotulo: string; contratos: number; valor: number }[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="rounded border border-dashed border-line-strong px-4 py-3 text-sm text-muted">Nada a mostrar.</p>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>{coluna}</Th>
                <Th align="right">Contr.</Th>
                <Th align="right">Valor</Th>
              </tr>
            </THead>
            <tbody>
              {linhas.map((l, i) => (
                <Tr key={i}>
                  <Td className="break-words text-ink-2">{l.rotulo}</Td>
                  <Td numeric muted>
                    {l.contratos}
                  </Td>
                  <Td numeric>{brl(l.valor)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  )
}

function ListaDeContratos({ titulo, colunaData, contratos, prazo = false }: { titulo: string; colunaData: string; contratos: Contrato[]; prazo?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
      {contratos.length === 0 ? (
        <p className="rounded border border-dashed border-line-strong px-4 py-3 text-sm text-muted">Nada a mostrar.</p>
      ) : (
        <TableWrap minWidth={640}>
          <Table>
            <THead>
              <tr>
                <Th className="w-32">{colunaData}</Th>
                <Th>Órgão e objeto</Th>
                <Th align="right" className="w-36">
                  Valor
                </Th>
              </tr>
            </THead>
            <tbody>
              {contratos.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    {prazo ? <Prazo data={fimDoDia(c.vigenciaFim)} semHora /> : <span className="font-mono text-ink-2">{data(c.assinatura)}</span>}
                  </Td>
                  <Td>
                    <p className="text-ink">{c.orgao.nome}</p>
                    <p className="text-xs text-muted">{c.objeto.slice(0, 90)}</p>
                  </Td>
                  <Td numeric>
                    {brl(c.valorGlobal)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  )
}

interface Perfil {
  totalDeContratos: number
  palavrasChave: { termo: string; ocorrencias: number }[]
  ufs: string[]
  orgaos: { nome: string; contratos: number }[]
  faixaDeValor: { minimo: number; maximo: number } | null
}

function Perfilador() {
  const [p, setP] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [termos, setTermos] = useState<string[]>([])
  const [criado, setCriado] = useState(false)

  async function gerar() {
    setCarregando(true)
    setErro(null)
    setP(null)
    setCriado(false)
    try {
      const r = await api.get<Perfil>('/api/radar/perfil')
      setP(r)
      setTermos(r.palavrasChave.slice(0, 5).map((k) => k.termo))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao consultar')
    } finally {
      setCarregando(false)
    }
  }

  async function criarItem() {
    if (!p || termos.length === 0) return
    try {
      await api.post('/api/monitored-items', { name: 'Sugerido pelo Perfilador: ' + termos.slice(0, 3).join(', '), keywords: termos, ufs: p.ufs.slice(0, 5) })
      setCriado(true)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao criar o item')
    }
  }

  return (
    <>
      <Panel>
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-prose text-sm text-ink-2">
            Analisa os contratos públicos que o CNPJ da sua empresa já tem no PNCP e sugere o que monitorar: palavras-chave, estados e faixa de valor.
          </p>
          <Button variant="primary" icon={Lightbulb} loading={carregando} onClick={gerar}>
            {carregando ? 'Consultando o PNCP…' : 'Gerar sugestões'}
          </Button>
        </div>
      </Panel>

      {carregando && <Carregando linhas={4} texto="Consultando o PNCP…" />}
      {erro && !p && <ErrorState message={erro} onRetry={gerar} />}
      {p && p.totalDeContratos === 0 && (
        <EmptyState title="Não encontramos contratos públicos no PNCP com o CNPJ da sua empresa como fornecedor; não há histórico para sugerir." />
      )}
      {p && p.totalDeContratos > 0 && (
        <Panel
          title="Sugestões"
          description={
            <>
              Base: <span className="font-mono">{p.totalDeContratos}</span> contrato(s) da sua empresa.
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-xs font-medium text-muted">Palavras-chave (marque as que quer monitorar)</legend>
              <div className="flex flex-wrap gap-2">
                {p.palavrasChave.map((k) => (
                  <Checkbox
                    key={k.termo}
                    className="rounded border border-line px-2 py-1.5"
                    checked={termos.includes(k.termo)}
                    onChange={(e) => setTermos((t) => (e.target.checked ? [...t, k.termo] : t.filter((x) => x !== k.termo)))}
                    label={
                      <>
                        {k.termo} <span className="font-mono text-xs text-muted">{k.ocorrencias}</span>
                      </>
                    }
                  />
                ))}
              </div>
            </fieldset>

            <DescriptionList
              columns={2}
              items={[
                { label: 'Estados onde você mais vendeu', value: p.ufs.join(', ') || '—', mono: true },
                ...(p.faixaDeValor
                  ? [{ label: 'Faixa de valor típica dos seus contratos', value: `${brl(p.faixaDeValor.minimo)} a ${brl(p.faixaDeValor.maximo)}`, mono: true }]
                  : []),
                ...(p.orgaos.length > 0 ? [{ label: 'Principais órgãos', value: p.orgaos.map((o) => o.nome).join('; ') }] : []),
              ]}
            />

            <div className="flex flex-col items-start gap-2 border-t border-line-soft pt-4">
              {criado ? (
                <Notice tone="ok">
                  Item criado — veja em <TextLink href="/items">Itens monitorados</TextLink>.
                </Notice>
              ) : (
                <Button variant="primary" icon={ListPlus} disabled={termos.length === 0 || criado} onClick={criarItem}>
                  Criar item com essas sugestões
                </Button>
              )}
              {erro && <FormError>{erro}</FormError>}
            </div>
          </div>
        </Panel>
      )}
    </>
  )
}
