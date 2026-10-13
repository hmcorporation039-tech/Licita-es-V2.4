'use client'

import { use, useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { avisarMudancaDeUso, useUsoDoPlano } from '@/hooks/useUsoDoPlano'
import MedidorDeAnalises from '@/components/MedidorDeAnalises'
import { api, ApiRequestError } from '@/lib/api'
import {
  ChecklistItem,
  CompanyDocument,
  ParticipationPlan,
  ParticipationStatus,
  PlanMilestone,
  Tender,
  TenderAnalysis,
  TenderChecklist,
} from '@/lib/types'
import { MODALIDADE_OPTIONS } from '@/lib/modalidades'
import { SITUACAO_OPTIONS } from '@/lib/situacoes'
import { safeHttpUrl } from '@/lib/safeUrl'
import type { PrazosDaSessao } from '@/lib/adminTypes'
import PainelDoFiscal from '@/components/PainelDoFiscal'
import MatrizDeExigencias from '@/components/MatrizDeExigencias'
import RelatorioDaRevisao from '@/components/RelatorioDaRevisao'
import {
  Button,
  buttonClasses,
  Carregando,
  Checkbox,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
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
  Th,
  THead,
  Tr,
  useAbaNaUrl,
  useDialogo,
  type Aba,
  type Tom,
} from '@/components/ui'

function validDocumentTypes(docs: CompanyDocument[]): Set<string> {
  const now = Date.now()
  const valid = new Set<string>()
  for (const doc of docs) {
    if (!doc.tipo) continue
    if (doc.dataValidade && new Date(doc.dataValidade).getTime() < now) continue
    valid.add(doc.tipo)
  }
  return valid
}

const TOM_DA_SEVERIDADE: Record<string, Tom> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
}

const ABAS = ['informacoes', 'itens', 'analise', 'habilitacao', 'exigencias', 'checklist', 'plano'] as const

type TabId = (typeof ABAS)[number]

const STATUS_OPTIONS: { value: ParticipationStatus; label: string }[] = [
  { value: 'AVALIANDO', label: 'Avaliando' },
  { value: 'VOU_PARTICIPAR', label: 'Vou participar' },
  { value: 'NAO_VOU_PARTICIPAR', label: 'Não vou participar' },
  { value: 'PARTICIPEI', label: 'Participei' },
]

type TenderComEncerramento = Tender & { encerramentoAt?: string | null }

const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])

function fimDasPropostas(t: TenderComEncerramento): string | null {
  if (t.encerramentoAt) return t.encerramentoAt
  if (FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(t.fonte)) return null
  return t.aberturaAt
}

function cnpjDoProcesso(numeroControle: string | null): string | null {
  const m = numeroControle?.match(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})-/)
  if (!m) return null
  return `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}`
}

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatQuantidade(q: string | null) {
  if (!q) return '—'
  const n = Number(q)
  return Number.isNaN(n) ? q : n.toLocaleString('pt-BR')
}

function formatDiaIso(dia: string) {
  const [y, m, d] = dia.split('-')
  return `${d}/${m}/${y}`
}

function groupBySection(items: ChecklistItem[]) {
  const sections = new Map<string, ChecklistItem[]>()
  for (const item of items) {
    if (!sections.has(item.section)) sections.set(item.section, [])
    sections.get(item.section)!.push(item)
  }
  return Array.from(sections.entries())
}

function rotuloDaFonte(fonte: string) {
  return fonte.replace(/_/g, ' ')
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>
}

export default function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useRequireSession()
  const { medida } = useUsoDoPlano(!!user)
  const { avisar, dialogo } = useDialogo()

  const [tender, setTender] = useState<TenderComEncerramento | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [saving, setSaving] = useState(false)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [activeTab, setActiveTab] = useAbaNaUrl<TabId>(ABAS, 'informacoes')

  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [ownedDocTypes, setOwnedDocTypes] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<ParticipationPlan | null>(null)
  const [prazos, setPrazos] = useState<PrazosDaSessao | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setErroAoCarregar(null)
    Promise.all([
      api.get<Tender>(`/api/tenders/${id}`),
      api.get<TenderChecklist>(`/api/tenders/${id}/checklist`),
    ])
      .then(([tenderData, checklistData]) => {
        setTender(tenderData)
        setItems(checklistData.items)
      })
      .catch((err) => setErroAoCarregar(err instanceof ApiRequestError ? err.message : 'Não foi possível carregar a licitação.'))
      .finally(() => setLoading(false))

    api
      .get<CompanyDocument[]>('/api/company-documents')
      .then((docs) => setOwnedDocTypes(validDocumentTypes(docs)))
      .catch((err) => console.error(err))

    api
      .get<TenderAnalysis>(`/api/tenders/${id}/analysis`)
      .then((a) => {
        setAnalysis(a)
        if (a.revisao?.status === 'EM_ANDAMENTO') void aguardarAnalise().catch((e) => console.error(e))
      })
      .catch((err) => {
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          console.error(err)
        }
      })

    api
      .get<ParticipationPlan>(`/api/tenders/${id}/plano`)
      .then(setPlan)
      .catch((err) => console.error(err))

    api
      .get<PrazosDaSessao>(`/api/tenders/${id}/prazos`)
      .then(setPrazos)
      .catch((err) => console.error(err))
  }, [id, user, tentativa])

  async function runAnalysis(force: boolean) {
    setAnalyzing(true)
    try {
      const enfileirada = await api.post<TenderAnalysis>(
        `/api/tenders/${id}/analyze${force ? '?force=true' : ''}`
      )
      setAnalysis(enfileirada)

      if (enfileirada.status !== 'DONE') {
        await aguardarAnalise()
      }

      if (user) {
        api
          .get<ParticipationPlan>(`/api/tenders/${id}/plano`)
          .then(setPlan)
          .catch((err) => console.error(err))
      }
    } catch (err) {
      void avisar({
        titulo: 'Não foi possível analisar o edital',
        mensagem: err instanceof ApiRequestError ? err.message : 'Erro ao analisar o edital',
      })
    } finally {
      setAnalyzing(false)
      avisarMudancaDeUso()
    }
  }

  async function aguardarAnalise() {
    const INTERVALO_MS = 4000
    const TENTATIVAS_MAX = 360

    for (let tentativa = 0; tentativa < TENTATIVAS_MAX; tentativa++) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS))

      try {
        const atual = await api.get<TenderAnalysis>(`/api/tenders/${id}/analysis`)
        setAnalysis(atual)
        if (atual.status !== 'PENDING' && atual.status !== 'RUNNING' && atual.revisao?.status !== 'EM_ANDAMENTO') return
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) throw err
      }
    }
  }

  function addChecklistItem(label: string) {
    if (items.some((i) => i.label === label)) return
    const next = [
      ...items,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        section: 'Documentos Adicionais do Seu Edital',
        label,
        checked: false,
        custom: true,
      },
    ]
    setItems(next)
    persist(next)
  }

  async function persist(nextItems: ChecklistItem[]) {
    if (!user) return
    setSaving(true)
    try {
      await api.put(`/api/tenders/${id}/checklist`, { items: nextItems })
    } finally {
      setSaving(false)
    }
  }

  function toggleItem(itemId: string) {
    const next = items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i))
    setItems(next)
    persist(next)
  }

  function addCustomItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    const next = [
      ...items,
      {
        id: `custom-${Date.now()}`,
        section: 'Documentos Adicionais do Seu Edital',
        label: newItemLabel.trim(),
        checked: false,
        custom: true,
      },
    ]
    setItems(next)
    setNewItemLabel('')
    persist(next)
  }

  function removeCustomItem(itemId: string) {
    const next = items.filter((i) => i.id !== itemId)
    setItems(next)
    persist(next)
  }

  async function persistPlan(nextStatus: ParticipationStatus, nextMilestones: PlanMilestone[]) {
    if (!user) return
    setPlanSaving(true)
    try {
      const result = await api.put<ParticipationPlan>(`/api/tenders/${id}/plano`, {
        status: nextStatus,
        milestones: nextMilestones,
      })
      setPlan(result)
    } finally {
      setPlanSaving(false)
    }
  }

  function changePlanStatus(status: ParticipationStatus) {
    if (!plan) return
    setPlan({ ...plan, status })
    persistPlan(status, plan.milestones)
  }

  function toggleMilestone(milestoneId: string) {
    if (!plan) return
    const next = plan.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m))
    setPlan({ ...plan, milestones: next })
    persistPlan(plan.status, next)
  }

  function addMilestone(e: React.FormEvent) {
    e.preventDefault()
    if (!plan || !newMilestoneLabel.trim()) return
    const next = [
      ...plan.milestones,
      {
        id: `custom-${Date.now()}`,
        label: newMilestoneLabel.trim(),
        date: newMilestoneDate ? new Date(newMilestoneDate).toISOString() : null,
        detalhe: null,
        done: false,
        custom: true,
      },
    ]
    setPlan({ ...plan, milestones: next })
    setNewMilestoneLabel('')
    setNewMilestoneDate('')
    persistPlan(plan.status, next)
  }

  function removeMilestone(milestoneId: string) {
    if (!plan) return
    const next = plan.milestones.filter((m) => m.id !== milestoneId)
    setPlan({ ...plan, milestones: next })
    persistPlan(plan.status, next)
  }

  if (!user || loading) return <Carregando linhas={6} texto="Carregando licitação…" />
  if (erroAoCarregar) {
    return (
      <>
        <PageHeader title="Licitação" back={{ href: '/tenders', label: 'Licitações' }} />
        <ErrorState message={erroAoCarregar} onRetry={() => setTentativa((n) => n + 1)} />
      </>
    )
  }
  if (!tender) {
    return (
      <EmptyState
        title="Licitação não encontrada."
        action={
          <LinkButton href="/tenders" size="sm">
            Voltar para Licitações
          </LinkButton>
        }
      />
    )
  }

  const total = items.length
  const done = items.filter((i) => i.checked).length
  const modalidadeLabel = MODALIDADE_OPTIONS.find((o) => o.value === tender.modalidade)?.label ?? tender.modalidade
  const situacaoLabel = SITUACAO_OPTIONS.find((o) => o.value === tender.situacao)?.label ?? tender.situacao
  const local = tender.municipio ? `${tender.municipio}/${tender.uf ?? ''}` : tender.uf
  const cnpj = cnpjDoProcesso(tender.numeroControle)
  const linkEdital = safeHttpUrl(tender.linkEdital)

  const abas: Aba<TabId>[] = [
    { id: 'informacoes', label: 'Informações' },
    { id: 'itens', label: 'Itens', count: tender.items?.length },
    { id: 'analise', label: 'Análise' },
    { id: 'habilitacao', label: 'Habilitação' },
    { id: 'exigencias', label: 'Exigências' },
    {
      id: 'checklist',
      label: (
        <>
          Checklist
          <span className="rounded-sm bg-line-soft px-1 font-mono text-2xs text-muted">
            {done}/{total}
          </span>
        </>
      ),
    },
    { id: 'plano', label: 'Plano de participação' },
  ]

  const informacoes: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }> = [
    { label: 'Órgão', value: tender.orgao },
    { label: 'Nº edital / processo', value: tender.numeroControle, mono: true },
    { label: 'Fonte', value: rotuloDaFonte(tender.fonte) },
    { label: 'Modalidade', value: modalidadeLabel },
    { label: 'Situação', value: situacaoLabel },
    { label: 'Cidade/UF', value: local },
    { label: 'Valor estimado', value: formatValor(tender.valorEstimado), mono: true },
    ...(tender.valorHomologado ? [{ label: 'Valor homologado', value: formatValor(tender.valorHomologado), mono: true }] : []),
    ...(tender.fonte === 'PNCP' && tender.srp != null ? [{ label: 'Registro de Preços', value: tender.srp ? 'Sim' : 'Não' }] : []),
    { label: 'Publicação', value: formatData(tender.publicadoAt), mono: true },
    { label: 'Abertura', value: formatData(tender.aberturaAt), mono: true },
    ...(tender.encerramentoAt ? [{ label: 'Encerramento das propostas', value: formatData(tender.encerramentoAt), mono: true }] : []),
  ]

  return (
    <>
      {dialogo}

      <PageHeader
        back={{ href: '/tenders', label: 'Licitações' }}
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusTag>{modalidadeLabel}</StatusTag>
            {tender.srp && <StatusTag>Registro de preços</StatusTag>}
            <StatusTag mono>{rotuloDaFonte(tender.fonte)}</StatusTag>
            <StatusTag dot>{situacaoLabel}</StatusTag>
          </div>
        }
        title={<span className="block max-w-[920px] text-xl leading-7">{tender.objetoResumido ?? tender.objeto}</span>}
        description={
          <>
            {tender.orgao ?? 'Órgão n/d'}
            {local ? ` · ${local}` : ''}
            {cnpj && (
              <>
                {' · CNPJ '}
                <Mono>{cnpj}</Mono>
              </>
            )}
          </>
        }
        actions={
          linkEdital && (
            <a href={linkEdital} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary', 'md')}>
              Ver edital original
              <ExternalLink size={16} aria-hidden />
            </a>
          )
        }
      />

      <Panel>
        <DescriptionList
          columns={4}
          items={[
            { label: 'Valor estimado', value: <span className="text-lg font-medium">{formatValor(tender.valorEstimado)}</span>, mono: true },
            { label: 'Fim do envio de propostas', value: <Prazo data={fimDasPropostas(tender)} layout="inline" /> },
            { label: 'Nº do processo', value: tender.numeroControle ? <span className="break-all">{tender.numeroControle}</span> : '—', mono: true },
            { label: 'Publicação', value: formatData(tender.publicadoAt), mono: true },
          ]}
        />
      </Panel>

      <div className="flex flex-col gap-5">
        <Tabs tabs={abas} value={activeTab} onChange={setActiveTab} label="Seções da licitação" />

        <div role="tabpanel" id={`painel-${activeTab}`} aria-labelledby={`aba-${activeTab}`} className="min-w-0">
          {activeTab === 'informacoes' && (
            <div className="flex flex-col gap-4">
              <Panel title="Informações do processo">
                <DescriptionList columns={3} items={informacoes} />
              </Panel>

              {prazos?.disponivel && prazos.limiteImpugnacao && prazos.dataSessao && (
                <Notice tone={prazos.limitePassou ? 'danger' : 'info'} title="Prazo para esclarecimento e impugnação (dias úteis)">
                  <p>
                    Até <strong className="font-mono font-semibold">{formatDiaIso(prazos.limiteImpugnacao)}</strong> (3 dias úteis antes da sessão de{' '}
                    <Mono>{formatDiaIso(prazos.dataSessao)}</Mono>).{' '}
                    {prazos.sessaoPassou
                      ? 'A sessão já ocorreu.'
                      : prazos.limitePassou
                        ? 'O prazo já terminou.'
                        : prazos.diasUteisAteLimite === 0
                          ? 'Termina hoje.'
                          : `Faltam ${prazos.diasUteisAteLimite} dia(s) útil(eis).`}
                  </p>
                  {prazos.aviso && <p className="mt-1 text-xs text-muted">{prazos.aviso}</p>}
                </Notice>
              )}

              <Panel>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">Objeto completo</summary>
                  <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-2">{tender.objeto}</p>
                </details>
              </Panel>
            </div>
          )}

          {activeTab === 'habilitacao' && <PainelDoFiscal tenderId={id} />}

          {activeTab === 'exigencias' && <MatrizDeExigencias tenderId={id} />}

          {activeTab === 'itens' &&
            (!tender.items || tender.items.length === 0 ? (
              <EmptyState title="Nenhum item detalhado disponível para esta licitação." />
            ) : (
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-semibold text-ink">Itens da licitação</h2>
                  <p className="text-xs text-muted">
                    Códigos CATMAT/CATSER de cada item — use pra cadastrar um item monitorado com match exato, sem depender de palavra-chave.
                  </p>
                </div>
                <TableWrap minWidth={820}>
                  <Table>
                    <THead>
                      <tr>
                        <Th>Item</Th>
                        <Th>Descrição</Th>
                        <Th>CATMAT</Th>
                        <Th>CATSER</Th>
                        <Th align="right">Qtd.</Th>
                        <Th align="right">Valor unit.</Th>
                        <Th align="right">Valor total</Th>
                      </tr>
                    </THead>
                    <tbody>
                      {tender.items.map((it) => (
                        <Tr key={it.id}>
                          <Td muted className="whitespace-nowrap align-top font-mono">
                            {it.numeroItem ?? '—'}
                          </Td>
                          <Td className="align-top">
                            <span className="font-medium text-ink">{it.descricao}</span>
                            {it.descricaoDetalhada && <span className="mt-1 block text-xs text-muted">{it.descricaoDetalhada}</span>}
                            {it.criterioJulgamento && <span className="mt-0.5 block text-xs text-faint">Critério: {it.criterioJulgamento}</span>}
                          </Td>
                          <Td className="whitespace-nowrap align-top font-mono text-xs">
                            {it.catmatCode ?? '—'}
                          </Td>
                          <Td className="whitespace-nowrap align-top font-mono text-xs">
                            {it.catserCode ?? '—'}
                          </Td>
                          <Td numeric className="align-top">
                            {formatQuantidade(it.quantidade)} <span className="font-sans text-xs text-muted">{it.unidadeMedida ?? ''}</span>
                          </Td>
                          <Td numeric className="align-top">
                            {formatValor(it.valorUnitario)}
                          </Td>
                          <Td numeric className="align-top">
                            {formatValor(it.valorTotal)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </section>
            ))}

          {activeTab === 'analise' && (
            <Panel
              title="Análise"
              actions={
                analysis?.status === 'DONE' && (
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => runAnalysis(true)} disabled={analyzing}>
                    Reanalisar
                  </Button>
                )
              }
            >
              {!analysis && !analyzing && (
                <div className="flex flex-col items-start gap-3">
                  <p className="max-w-prose text-sm text-ink-2">
                    Baixa o edital publicado no PNCP e resume valor, prazo, critério de julgamento, exigências técnicas e pontos de atenção — pode levar
                    até 30 segundos.
                  </p>
                  <MedidorDeAnalises className="w-full max-w-sm" />
                  <Button
                    variant="primary"
                    onClick={() => runAnalysis(false)}
                    disabled={medida?.esgotado === true}
                    title={medida?.esgotado ? 'Você atingiu o limite de análises do plano neste mês.' : undefined}
                  >
                    Analisar edital{medida && medida.restantes !== null && !medida.esgotado ? ` (usa 1 de ${medida.restantes})` : ''}
                  </Button>
                </div>
              )}

              {analyzing && (
                <p role="status" className="inline-flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Baixando e analisando o edital…
                </p>
              )}

              {!analyzing && analysis?.status === 'NO_DOCUMENTS' && (
                <p className="text-sm text-muted">{analysis.errorMsg ?? 'Nenhum documento disponível para análise.'}</p>
              )}

              {!analyzing && analysis?.status === 'FAILED' && (
                <Notice
                  tone="danger"
                  action={
                    <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => runAnalysis(true)}>
                      Tentar novamente
                    </Button>
                  }
                >
                  {analysis.errorMsg ?? 'A análise falhou.'}
                </Notice>
              )}

              {!analyzing && analysis?.status === 'DONE' && analysis.resultado && (
                <div className="flex flex-col gap-5">
                  {analysis.documentoNome && (
                    <p className="text-xs text-muted">
                      Documento analisado: <span className="font-mono">{analysis.documentoNome}</span>
                    </p>
                  )}
                  <RelatorioDaRevisao revisao={analysis.revisao ?? null} />
                  {user?.isAdmin && analysis.rascunho && (
                    <details className="rounded border border-line bg-sunken p-3 text-xs text-ink-2">
                      <summary className="cursor-pointer font-medium">Admin: rascunho do analista (antes da revisão)</summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(analysis.rascunho, null, 2)}</pre>
                    </details>
                  )}
                  <p className="max-w-prose text-base leading-relaxed text-ink">{analysis.resultado.resumo}</p>

                  <DescriptionList
                    columns={3}
                    className="border-y border-line-soft py-4"
                    items={[
                      { label: 'Valor estimado', value: analysis.resultado.valorEstimado },
                      { label: 'Data da sessão', value: analysis.resultado.dataSessao || '—' },
                      { label: 'Registro de preços (SRP)', value: analysis.resultado.registroPrecos || '—' },
                      { label: 'Prazo de entrega', value: analysis.resultado.prazoEntrega },
                      { label: 'Local / entrega', value: analysis.resultado.local || '—' },
                      { label: 'Pagamento', value: analysis.resultado.pagamento || '—' },
                      { label: 'Critério de julgamento', value: analysis.resultado.criterioJulgamento },
                      { label: 'Adesão a ata (carona)', value: analysis.resultado.adesaoAta || '—' },
                      { label: 'Prazo para esclarecimento', value: analysis.resultado.prazoEsclarecimento },
                      { label: 'Prazo para impugnação', value: analysis.resultado.prazoImpugnacao },
                    ]}
                  />

                  {analysis.resultado.exigenciasTecnicas.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-ink">Exigências técnicas</h3>
                      <ul className="list-outside list-disc pl-5 text-sm text-ink-2 marker:text-faint">
                        {analysis.resultado.exigenciasTecnicas.map((e, i) => (
                          <li key={i} className="py-0.5">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {analysis.resultado.documentosExigidos.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-ink">Documentos específicos deste edital (além do checklist padrão)</h3>
                      <ul className="flex flex-col divide-y divide-line-soft rounded border border-line">
                        {analysis.resultado.documentosExigidos.map((doc, i) => (
                          <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-ink-2">
                            <span className="min-w-0">{doc}</span>
                            <Button variant="ghost" size="sm" icon={Plus} onClick={() => addChecklistItem(doc)}>
                              Adicionar ao checklist
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {analysis.resultado.riscos.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-ink">Pontos de atenção</h3>
                      <ul className="flex flex-col divide-y divide-line-soft rounded border border-line">
                        {analysis.resultado.riscos.map((r, i) => (
                          <li key={i} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink">{r.titulo}</span>
                              <StatusTag tone={TOM_DA_SEVERIDADE[r.severidade] ?? 'neutral'}>{r.severidade}</StatusTag>
                            </div>
                            <p className="text-ink-2">{r.descricao}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </Panel>
          )}

          {activeTab === 'checklist' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-ink">Checklist de habilitação</h2>
                  <p className="max-w-prose text-sm text-muted">
                    Baseado no guia de habilitação da Lei 14.133/2021. Personalize adicionando os documentos específicos exigidos neste edital.
                  </p>
                </div>
                <span role="status" className="text-sm text-muted">
                  <Mono>
                    {done}/{total}
                  </Mono>{' '}
                  documentos{saving && ' · salvando…'}
                </span>
              </div>

              {groupBySection(items).map(([section, sectionItems]) => (
                <Panel key={section} title={section} padding="none">
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {sectionItems.map((item) => {
                      const owned = !item.custom && ownedDocTypes.has(item.id)
                      return (
                        <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                          <Checkbox
                            checked={item.checked}
                            onChange={() => toggleItem(item.id)}
                            label={
                              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className={item.checked ? 'text-muted' : undefined}>{item.label}</span>
                                {owned && <StatusTag tone="ok">Você já tem</StatusTag>}
                              </span>
                            }
                            hint={item.hint}
                          />
                          {item.custom && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              onClick={() => removeCustomItem(item.id)}
                              aria-label={`Remover ${item.label}`}
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Panel>
              ))}

              <form onSubmit={addCustomItem} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Documento específico deste edital" className="flex-1">
                  <Input placeholder="Ex: Atestado de capacidade técnica" value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" icon={Plus}>
                  Adicionar
                </Button>
              </form>
            </div>
          )}

          {activeTab === 'plano' && (
            <Panel title="Plano de participação" actions={planSaving && <span className="text-xs text-muted">salvando…</span>}>
              {!plan ? (
                <Carregando />
              ) : (
                <div className="flex flex-col gap-4">
                  <Field label="Status" className="max-w-xs">
                    <Select value={plan.status} onChange={(e) => changePlanStatus(e.target.value as ParticipationStatus)}>
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {!analysis && (
                    <p className="text-xs text-muted">
                      Rode a &quot;Análise&quot; pra trazer os prazos de impugnação e esclarecimento pra essa linha do tempo — eles não vêm nos dados
                      estruturados do PNCP.
                    </p>
                  )}

                  {plan.milestones.length > 0 && (
                    <ul className="flex flex-col divide-y divide-line-soft rounded border border-line">
                      {plan.milestones.map((m) => (
                        <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                          <Checkbox
                            checked={m.done}
                            onChange={() => toggleMilestone(m.id)}
                            label={<span className={m.done ? 'text-muted line-through' : 'font-medium'}>{m.label}</span>}
                            hint={m.detalhe ?? undefined}
                          />
                          <div className="flex shrink-0 items-start gap-2">
                            {m.date &&
                              (m.done ? (
                                <span className="font-mono text-xs text-muted">{formatData(m.date)}</span>
                              ) : (
                                <Prazo data={m.date} className="items-end text-right" />
                              ))}
                            {m.custom && (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={Trash2}
                                onClick={() => removeMilestone(m.id)}
                                aria-label={`Remover ${m.label}`}
                                className="w-8 px-0"
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form onSubmit={addMilestone} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                    <Field label="Nova etapa">
                      <Input
                        placeholder="Ex: reunião interna de decisão"
                        value={newMilestoneLabel}
                        onChange={(e) => setNewMilestoneLabel(e.target.value)}
                      />
                    </Field>
                    <Field label="Data">
                      <Input type="date" value={newMilestoneDate} onChange={(e) => setNewMilestoneDate(e.target.value)} />
                    </Field>
                    <Button type="submit" variant="primary" icon={Plus}>
                      Adicionar
                    </Button>
                  </form>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
