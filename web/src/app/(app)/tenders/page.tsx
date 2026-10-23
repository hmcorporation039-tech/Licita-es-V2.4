'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Paginated, Tender } from '@/lib/types'
import { MODALIDADE_OPTIONS, agruparPorModalidade } from '@/lib/modalidades'
import {
  GRUPOS_DE_MODALIDADE,
  VALOR_DE_VARIAS_MODALIDADES,
  lerModalidadesDaUrl,
  modalidadesDoSeletor,
  parametroDeModalidade,
  rotuloDasModalidades,
  valorDoSeletorDeModalidade,
} from '@/lib/filtroDeModalidade'
import { SITUACAO_OPTIONS } from '@/lib/situacoes'
import {
  Button,
  Carregando,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Panel,
  Prazo,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui'
import SeloObraCompleta from '@/components/SeloObraCompleta'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'
import { ESTADOS } from '@/lib/estados'
import { dataDaLicitacao } from '@/lib/datas'

type TenderComEncerramento = Tender & { encerramentoAt?: string | null }

const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])

function fimDasPropostas(t: TenderComEncerramento): string | null {
  if (t.encerramentoAt) return dataDaLicitacao(t.encerramentoAt, t.fonte)
  if (FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(t.fonte)) return null
  return dataDaLicitacao(t.aberturaAt, t.fonte)
}

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function rotuloDaFonte(fonte: string) {
  return ROTULOS_DE_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
}

function local(t: Tender) {
  if (t.municipio) return `${t.municipio}/${t.uf ?? ''}`
  return t.uf ?? 'UF n/d'
}

type Ordem = 'prazo' | 'recentes'

const ORDEM_OPTIONS: { value: Ordem; label: string }[] = [
  { value: 'prazo', label: 'Prazo mais próximo' },
  { value: 'recentes', label: 'Publicação mais recente' },
]

const CLASSIFICACAO_LABEL: Record<string, string> = {
  exata: 'Correspondência exata (código)',
  alta: 'Alta relevância',
  media: 'Relevância média',
}

function TenderRow({ t, somenteRelacionadas }: { t: TenderComEncerramento; somenteRelacionadas: boolean }) {
  const objeto = t.objetoResumido ?? t.objeto
  return (
    <Tr interactive>
      <Td className="whitespace-nowrap">
        <Prazo data={fimDasPropostas(t)} />
      </Td>
      <Td className="w-full max-w-0">
        <div className="flex min-w-0 flex-col">
          <Link href={`/tenders/${t.id}`} className="line-clamp-2 break-words text-sm font-medium text-ink hover:text-accent hover:underline" title={objeto}>
            {objeto}
          </Link>
          <span className="truncate text-xs text-muted">
            {t.orgao ?? 'Órgão n/d'} · {local(t)}
          </span>
        </div>
      </Td>
      <Td className="whitespace-nowrap text-ink-2">{MODALIDADE_OPTIONS.find((o) => o.value === t.modalidade)?.label ?? t.modalidade}</Td>
      <Td>
        <StatusTag mono>{rotuloDaFonte(t.fonte)}</StatusTag>
      </Td>
      <Td numeric className={t.valorEstimado ? 'text-ink' : 'text-faint'}>
        {formatValor(t.valorEstimado)}
      </Td>
      <Td className="max-w-[13rem]">
        <span className="block truncate font-mono text-xs text-muted" title={t.numeroControle ?? undefined}>
          {t.numeroControle ?? '—'}
        </span>
      </Td>
      <Td>
        <StatusTag dot>{SITUACAO_OPTIONS.find((o) => o.value === t.situacao)?.label ?? t.situacao}</StatusTag>
      </Td>
      {somenteRelacionadas && (
        <Td>
          {t.match && (
            <StatusTag title={t.match.itensRelacionados.join(', ')}>
              {CLASSIFICACAO_LABEL[t.match.classificacao]} · nota <span className="font-mono">{Math.round(t.match.score * 100)}</span>
            </StatusTag>
          )}
          {t.match?.dentroDeObraCompleta && <SeloObraCompleta />}
        </Td>
      )}
    </Tr>
  )
}

const SIGLAS_DAS_UFS = new Set(ESTADOS.map((estado) => estado.sigla))

interface ListaDeLicitacoes extends Paginated<Tender> {
  totais?: { comPrazoConfirmado: number; semDataInformada: number }
}

function siglasValidas(texto: string): string[] {
  return [...new Set(texto.toUpperCase().split(/[\s,;]+/).filter((sigla) => SIGLAS_DAS_UFS.has(sigla)))]
}

export default function TendersPage() {
  const user = useRequireSession()
  const [data, setData] = useState<ListaDeLicitacoes | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  const [orgao, setOrgao] = useState('')
  const [numero, setNumero] = useState('')
  const [modalidades, setModalidades] = useState<string[]>([])
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [publicacaoInicio, setPublicacaoInicio] = useState('')
  const [publicacaoFim, setPublicacaoFim] = useState('')
  const [q, setQ] = useState('')
  const [somenteRelacionadas, setSomenteRelacionadas] = useState(true)
  const [agruparPor, setAgruparPor] = useState<'nao' | 'estado' | 'modalidade'>('nao')
  const agrupar = agruparPor !== 'nao'
  const [ordem, setOrdem] = useState<Ordem>('prazo')
  const [versaoDosFiltros, setVersaoDosFiltros] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const daUrl = (nome: string) => (params.get(nome) ?? '').trim().slice(0, 200)
    const qInicial = daUrl('q')
    const ufsIniciais = siglasValidas(daUrl('uf'))
    const municipioInicial = daUrl('municipio')
    const modalidadesIniciais = lerModalidadesDaUrl(params.get('modalidade'))
    const ufValida = ufsIniciais.length > 0
    if (qInicial) setQ(qInicial)
    if (ufValida) setUf(ufsIniciais.join(', '))
    if (municipioInicial) setMunicipio(municipioInicial)
    if (modalidadesIniciais.length > 0) setModalidades(modalidadesIniciais)
    if (params.get('relacionadas') === '0') setSomenteRelacionadas(false)
    if (qInicial || ufValida || municipioInicial) setAdvancedOpen(true)
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setErro(null)
    const timeout = setTimeout(() => {
      const qs = new URLSearchParams({ page: String(page), pageSize: agrupar ? '100' : '20', ordem })
      if (orgao) qs.set('orgao', orgao)
      if (numero) qs.set('numero', numero)
      const modalidade = parametroDeModalidade(modalidades)
      if (modalidade) qs.set('modalidade', modalidade)
      if (municipio) qs.set('municipio', municipio)
      const ufs = siglasValidas(uf)
      if (ufs.length) qs.set('uf', ufs.join(','))
      if (publicacaoInicio) qs.set('publicacaoInicio', publicacaoInicio)
      if (publicacaoFim) qs.set('publicacaoFim', publicacaoFim)
      if (q) qs.set('q', q)
      if (somenteRelacionadas) qs.set('somenteRelacionadas', 'true')
      if (agrupar) {
        qs.set('agrupar', 'true')
        qs.set('agruparPor', agruparPor)
      }
      api
        .get<ListaDeLicitacoes>(`/api/tenders?${qs.toString()}`)
        .then(setData)
        .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar as licitações.'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [user, orgao, numero, modalidades, municipio, uf, publicacaoInicio, publicacaoFim, q, somenteRelacionadas, agruparPor, ordem, page, tentativa])

  const grupos = (() => {
    if (agruparPor !== 'estado' || !data) return null
    const porUf = new Map<string, Map<string, Tender[]>>()
    for (const t of data.items) {
      const ufKey = t.uf ?? 'UF não informada'
      const orgaoKey = t.orgao ?? 'Órgão não informado'
      if (!porUf.has(ufKey)) porUf.set(ufKey, new Map())
      const porOrgao = porUf.get(ufKey)!
      if (!porOrgao.has(orgaoKey)) porOrgao.set(orgaoKey, [])
      porOrgao.get(orgaoKey)!.push(t)
    }
    return Array.from(porUf.entries()).map(([uf, porOrgao]) => ({
      uf,
      total: Array.from(porOrgao.values()).reduce((n, arr) => n + arr.length, 0),
      orgaos: Array.from(porOrgao.entries()).map(([orgao, tenders]) => ({ orgao, tenders })),
    }))
  })()

  const gruposPorModalidade = agruparPor === 'modalidade' && data ? agruparPorModalidade(data.items, (t) => t.modalidade) : null

  function clearFilters() {
    setPage(1)
    setOrgao('')
    setNumero('')
    setModalidades([])
    setMunicipio('')
    setUf('')
    setPublicacaoInicio('')
    setPublicacaoFim('')
    setQ('')
    setVersaoDosFiltros((v) => v + 1)
  }

  if (!user) return null

  const colunas = somenteRelacionadas ? 8 : 7

  return (
    <>
      <PageHeader
        title="Licitações"
        description={
          data ? (
            <>
              <span className="font-mono">{data.total.toLocaleString('pt-BR')}</span> {data.total === 1 ? 'licitação encontrada' : 'licitações encontradas'}
              {data.totais && data.totais.semDataInformada > 0 && (
                <>
                  {' '}
                  · <span className="font-mono">{data.totais.comPrazoConfirmado.toLocaleString('pt-BR')}</span> com prazo confirmado ·{' '}
                  <span className="font-mono">{data.totais.semDataInformada.toLocaleString('pt-BR')}</span> sem data informada (publicadas nos últimos 30 dias)
                </>
              )}
            </>
          ) : (
            'Buscando licitações'
          )
        }
      />

      <Panel bodyClassName="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Órgão" className="lg:col-span-2">
            <Input
              placeholder="Ex: Prefeitura de Uberlândia ou Município de Uberlândia"
              value={orgao}
              onChange={(e) => {
                setPage(1)
                setOrgao(e.target.value)
              }}
            />
          </Field>
          <Field label="Nº edital / processo">
            <Input
              placeholder="Ex: 112/2026"
              value={numero}
              onChange={(e) => {
                setPage(1)
                setNumero(e.target.value)
              }}
            />
          </Field>
          <Field label="Modalidade" hint={modalidades.length > 1 ? `Filtrando ${modalidades.length} modalidades: ${rotuloDasModalidades(modalidades)}` : undefined}>
            <Select
              value={valorDoSeletorDeModalidade(modalidades)}
              onChange={(e) => {
                setPage(1)
                setModalidades((atuais) => modalidadesDoSeletor(e.target.value, atuais))
              }}
            >
              <option value="">Todas</option>
              {valorDoSeletorDeModalidade(modalidades) === VALOR_DE_VARIAS_MODALIDADES && (
                <option value={VALOR_DE_VARIAS_MODALIDADES}>{rotuloDasModalidades(modalidades)}</option>
              )}
              {GRUPOS_DE_MODALIDADE.map((grupo) => (
                <option key={grupo.value} value={grupo.value}>
                  {grupo.label}
                </option>
              ))}
              {MODALIDADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ordenar por">
            <Select
              value={ordem}
              onChange={(e) => {
                setPage(1)
                setOrdem(e.target.value as Ordem)
              }}
            >
              {ORDEM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {advancedOpen && (
          <div key={versaoDosFiltros} id="busca-avancada" className="grid grid-cols-1 gap-3 border-t border-line-soft pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cidade">
              <Input
                value={municipio}
                onChange={(e) => {
                  setPage(1)
                  setMunicipio(e.target.value)
                }}
              />
            </Field>
            <Field label="UF" hint="Um ou mais estados: GO, DF, MG">
              <Input
                maxLength={90}
                value={uf}
                onChange={(e) => {
                  setPage(1)
                  setUf(e.target.value.toUpperCase())
                }}
              />
            </Field>
            <Field label="Publicação — início">
              <Input
                type="date"
                value={publicacaoInicio}
                onChange={(e) => {
                  setPage(1)
                  setPublicacaoInicio(e.target.value)
                }}
              />
            </Field>
            <Field label="Publicação — fim">
              <Input
                type="date"
                value={publicacaoFim}
                onChange={(e) => {
                  setPage(1)
                  setPublicacaoFim(e.target.value)
                }}
              />
            </Field>
            <Field label="Buscar no objeto" className="sm:col-span-2 lg:col-span-4">
              <Input
                value={q}
                onChange={(e) => {
                  setPage(1)
                  setQ(e.target.value)
                }}
              />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Checkbox
              label="Só relacionadas aos meus itens monitorados"
              checked={somenteRelacionadas}
              onChange={(e) => {
                setPage(1)
                setSomenteRelacionadas(e.target.checked)
              }}
            />
            <label className="flex items-center gap-2 text-sm text-ink-2">
              Agrupar por
              <Select
                value={agruparPor}
                onChange={(e) => {
                  setPage(1)
                  setAgruparPor(e.target.value as 'nao' | 'estado' | 'modalidade')
                }}
                className="w-48"
              >
                <option value="nao">Não agrupar</option>
                <option value="estado">Estado e Órgão</option>
                <option value="modalidade">Modalidade</option>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={SlidersHorizontal}
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              aria-controls="busca-avancada"
            >
              {advancedOpen ? 'Ocultar busca avançada' : 'Busca avançada'}
            </Button>
            <Button variant="secondary" size="sm" icon={X} onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </div>
      </Panel>

      {loading ? (
        <Carregando linhas={6} texto="Carregando licitações…" />
      ) : erro ? (
        <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
      ) : data?.items.length === 0 ? (
        somenteRelacionadas ? (
          <EmptyState
            title="Nenhuma licitação relacionada aos seus itens monitorados até agora."
            description='Cadastre itens em "Itens monitorados" ou desmarque o filtro acima para ver o feed completo.'
            action={
              <div className="flex flex-wrap gap-2">
                <LinkButton href="/items" variant="primary" size="sm">
                  Cadastrar itens monitorados
                </LinkButton>
                <Button
                  size="sm"
                  onClick={() => {
                    setPage(1)
                    setSomenteRelacionadas(false)
                  }}
                >
                  Ver o feed completo
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            title="Nenhuma licitação encontrada com esses filtros."
            action={
              <Button size="sm" icon={X} onClick={clearFilters}>
                Limpar filtros
              </Button>
            }
          />
        )
      ) : (
        <>
          <TableWrap minWidth={somenteRelacionadas ? 1280 : 1080}>
            <Table>
              <THead>
                <tr>
                  <Th>Encerra</Th>
                  <Th>Objeto e órgão</Th>
                  <Th>Modalidade</Th>
                  <Th>Fonte</Th>
                  <Th align="right">Valor estimado</Th>
                  <Th>Nº do processo</Th>
                  <Th>Situação</Th>
                  {somenteRelacionadas && <Th>Relevância</Th>}
                </tr>
              </THead>
              <tbody>
                {gruposPorModalidade
                  ? gruposPorModalidade.map((g) => (
                      <Fragment key={`mod-${g.value}`}>
                        <tr className="border-b border-line bg-sunken">
                          <td colSpan={colunas} className="px-4 py-2 text-sm font-semibold text-ink">
                            {g.label}{' '}
                            <span className="font-normal text-muted">
                              · <span className="font-mono">{g.itens.length}</span> {g.itens.length === 1 ? 'licitação' : 'licitações'}
                            </span>
                          </td>
                        </tr>
                        {g.itens.map((t) => (
                          <TenderRow key={t.id} t={t} somenteRelacionadas={somenteRelacionadas} />
                        ))}
                      </Fragment>
                    ))
                  : grupos
                  ? grupos.map((g) => (
                      <Fragment key={`uf-${g.uf}`}>
                        <tr className="border-b border-line bg-sunken">
                          <td colSpan={colunas} className="px-4 py-2 text-sm font-semibold text-ink">
                            {g.uf}{' '}
                            <span className="font-normal text-muted">
                              · <span className="font-mono">{g.total}</span> {g.total === 1 ? 'licitação' : 'licitações'}
                            </span>
                          </td>
                        </tr>
                        {g.orgaos.map((og) => (
                          <Fragment key={`orgao-${g.uf}-${og.orgao}`}>
                            <tr className="border-b border-line-soft">
                              <td colSpan={colunas} className="py-1.5 pl-6 pr-4 text-xs font-medium text-muted">
                                {og.orgao} <span className="font-mono text-faint">({og.tenders.length})</span>
                              </td>
                            </tr>
                            {og.tenders.map((t) => (
                              <TenderRow key={t.id} t={t} somenteRelacionadas={somenteRelacionadas} />
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  : data?.items.map((t) => <TenderRow key={t.id} t={t} somenteRelacionadas={somenteRelacionadas} />)}
              </tbody>
            </Table>
          </TableWrap>

          {data && data.totalPages > 1 && (
            <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>
                Página <span className="font-mono text-ink">{data.page}</span> de <span className="font-mono">{data.totalPages}</span>
              </span>
              <div className="flex gap-2">
                <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button size="sm" iconRight={ChevronRight} disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  )
}
