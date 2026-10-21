'use client'

import { formatarData } from '@/lib/datas'
import Link from 'next/link'
import { use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import AdminShell, { RotuloDoPlano } from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { ROTULO_ACAO } from '@/lib/adminTypes'
import type { DetalheEmpresa, Limites, OrigemDoCadastro, PlanoComercial, RecursoDoPlano } from '@/lib/adminTypes'
import {
  Button,
  Carregando,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Metric,
  MetricRow,
  Notice,
  Panel,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  TextLink,
  THead,
  Th,
  Tr,
  cx,
} from '@/components/ui'

const data = (v: string | null) => formatarData(v)
const dataHora = (v: string) => formatarData(v, { comHora: true })
const nf = new Intl.NumberFormat('pt-BR')
const ehNumero = (v: string | undefined) => /^\d+$/.test((v ?? '').trim())

function textoDaOrigem(origem: OrigemDoCadastro | null | undefined): string {
  if (!origem) return 'direto, sem campanha'
  const partes: string[] = []
  const fonte = [origem.utm_source, origem.utm_medium].filter(Boolean).join(' / ')
  if (fonte) partes.push(fonte)
  if (origem.utm_campaign) partes.push(`campanha ${origem.utm_campaign}`)
  if (origem.utm_content) partes.push(`anúncio ${origem.utm_content}`)
  if (origem.utm_term) partes.push(`termo ${origem.utm_term}`)
  if (origem.interesse) partes.push(`buscou “${origem.interesse.termo}” ${origem.interesse.uf ? `em ${origem.interesse.uf}` : 'no Brasil'}`)
  return partes.join(' · ') || 'direto, sem campanha'
}

function situacaoDaCota(r: RecursoDoPlano): 'excedido' | 'atingido' | null {
  if (r.limite === null) return null
  if (r.usado > r.limite) return 'excedido'
  if (r.usado === r.limite) return 'atingido'
  return null
}

function DetalheDaCota({ r }: { r: RecursoDoPlano }) {
  if (r.limite === null) return <>sem limite</>
  const situacao = situacaoDaCota(r)
  return (
    <>
      de <span className="font-mono">{nf.format(r.limite)}</span>
      {situacao && ` · ${situacao}`}
    </>
  )
}

export default function AdminEmpresaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <AdminShell titulo="Empresa">{() => <Conteudo id={id} />}</AdminShell>
}

const CAMPOS: { chave: keyof Limites; rotulo: string }[] = [
  { chave: 'itensMonitorados', rotulo: 'Itens monitorados' },
  { chave: 'usuarios', rotulo: 'Usuários' },
  { chave: 'analisesIaMes', rotulo: 'Análises de IA / mês' },
  { chave: 'perguntasAoEditalMes', rotulo: 'Perguntas ao edital / mês' },
]

function Secao({ titulo, contagem, descricao, acoes, children }: { titulo: string; contagem?: number; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-ink">
            {titulo}
            {contagem !== undefined && <span className="ml-1.5 font-mono text-xs font-normal text-muted">{nf.format(contagem)}</span>}
          </h2>
          {descricao && <p className="text-xs text-muted">{descricao}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-sm text-muted">{children}</p>
}

function Conteudo({ id }: { id: string }) {
  const [d, setD] = useState<DetalheEmpresa | null>(null)
  const [planos, setPlanos] = useState<PlanoComercial[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [planCode, setPlanCode] = useState('')
  const [ajustes, setAjustes] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [det, pl] = await Promise.all([
        api.get<DetalheEmpresa>(`/api/admin/companies/${id}`),
        api.get<PlanoComercial[]>('/api/admin/plans'),
      ])
      setD(det)
      setPlanos(pl)
      setPlanCode(det.empresa.planCode)
      const a: Record<string, string> = {}
      for (const c of CAMPOS) {
        const v = det.empresa.quotaOverrides?.[c.chave]
        a[c.chave] = v === undefined ? '' : v === null ? 'ilimitado' : String(v)
      }
      setAjustes(a)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    setErro(null)
    try {
      const overrides: Record<string, number | null> = {}
      for (const c of CAMPOS) {
        const t = (ajustes[c.chave] ?? '').trim().toLowerCase()
        if (t === '') continue
        if (t === 'ilimitado') overrides[c.chave] = null
        else if (/^\d+$/.test(t)) overrides[c.chave] = Number(t)
        else throw new ApiRequestError(400, `Valor inválido em "${c.rotulo}": use um número inteiro ou "ilimitado"`)
      }
      await api.patch(`/api/admin/companies/${id}`, {
        planCode,
        quotaOverrides: Object.keys(overrides).length ? overrides : null,
      })
      setMsg('Plano e limites salvos.')
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (erro && !d)
    return (
      <ErrorState
        message={erro}
        onRetry={() => {
          setErro(null)
          carregar()
        }}
      />
    )
  if (!d) return <Carregando linhas={6} />

  const e = d.empresa

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/empresas" className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          Empresas
        </Link>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-ink">{e.name}</h2>
            <RotuloDoPlano codigo={d.cotas.plano.codigo} nome={d.cotas.plano.nome} />
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden />
            Esta consulta foi registrada na trilha de auditoria.
          </p>
        </div>
      </div>

      <Panel title="Dados da empresa">
        <DescriptionList
          columns={4}
          items={[
            { label: 'Documento', value: e.cnpj ?? e.cpf ?? 'sem documento', mono: Boolean(e.cnpj ?? e.cpf) },
            { label: 'E-mail', value: e.email ?? 'sem e-mail' },
            { label: 'Telefone', value: e.telefone, mono: Boolean(e.telefone) },
            { label: 'Responsável', value: e.responsavel },
            { label: 'Criada em', value: data(e.createdAt), mono: true },
            { label: 'Origem do cadastro', value: textoDaOrigem(e.origemDoCadastro) },
          ]}
        />
      </Panel>

      <Panel title="Plano e limites" description='Ajuste em branco = vale o limite do plano. Escreva um número, ou "ilimitado", para combinar um limite diferente só com esta empresa.'>
        <div className="flex flex-col gap-4">
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              salvar()
            }}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))_auto]"
          >
            <Field label="Plano">
              <Select value={planCode} onChange={(ev) => setPlanCode(ev.target.value)}>
                {planos.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                    {p.active ? '' : ' (inativo)'}
                  </option>
                ))}
              </Select>
            </Field>
            {CAMPOS.map((c) => (
              <Field key={c.chave} label={`Ajuste: ${c.rotulo}`}>
                <Input
                  value={ajustes[c.chave] ?? ''}
                  onChange={(ev) => setAjustes({ ...ajustes, [c.chave]: ev.target.value })}
                  placeholder="vale o plano"
                  className={cx(ehNumero(ajustes[c.chave]) && 'font-mono')}
                />
              </Field>
            ))}
            <Button type="submit" variant="primary" loading={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>

          {msg && <Notice tone="ok">{msg}</Notice>}
          {erro && <Notice tone="danger">{erro}</Notice>}

          <MetricRow>
            {d.cotas.recursos.map((r) => {
              const situacao = situacaoDaCota(r)
              return (
                <Metric
                  key={r.recurso}
                  label={<span className="inline-block first-letter:uppercase">{r.rotulo}</span>}
                  value={nf.format(r.usado)}
                  detail={<DetalheDaCota r={r} />}
                  tone={situacao === 'excedido' ? 'danger' : situacao === 'atingido' ? 'warn' : 'default'}
                />
              )
            })}
          </MetricRow>

          <p className="text-xs text-muted">
            IA acumulada: <span className="font-mono text-ink-2">{nf.format(d.iaAcumulada.chamadas)}</span> chamadas ·{' '}
            <span className="font-mono text-ink-2">{nf.format(d.iaAcumulada.tokensEntrada)}</span> tokens de entrada ·{' '}
            <span className="font-mono text-ink-2">{nf.format(d.iaAcumulada.tokensSaida)}</span> de saída
            {d.iaAcumulada.custoEstimadoUsd ? (
              <>
                {' '}
                · <span className="font-mono text-ink-2">~US$ {d.iaAcumulada.custoEstimadoUsd.toFixed(2)}</span>
              </>
            ) : null}
          </p>
        </div>
      </Panel>

      <Secao titulo="Usuários" contagem={d.usuarios.length}>
        {d.usuarios.length === 0 ? (
          <Vazio>Nenhum usuário.</Vazio>
        ) : (
          <TableWrap minWidth={640}>
            <Table>
              <THead>
                <tr>
                  <Th>E-mail</Th>
                  <Th>Papel</Th>
                  <Th>Situação</Th>
                  <Th align="right">Acesso até</Th>
                </tr>
              </THead>
              <tbody>
                {d.usuarios.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-ink">{u.email}</span>
                        {u.isAdmin && <StatusTag>Admin</StatusTag>}
                      </div>
                    </Td>
                    <Td>{u.companyRole === 'OWNER' ? 'Dono' : 'Membro'}</Td>
                    <Td>
                      {u.active ? (
                        <StatusTag>ativo</StatusTag>
                      ) : u.disabledByAdmin ? (
                        <StatusTag tone="danger">desativado pelo admin</StatusTag>
                      ) : (
                        <StatusTag tone="warn">inativo</StatusTag>
                      )}
                    </Td>
                    <Td numeric muted>
                      {u.accessExpiresAt ? data(u.accessExpiresAt) : <span className="font-sans">sem prazo</span>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao
        titulo="Itens monitorados"
        contagem={d.itensMonitorados.length}
        descricao={
          <>
            <span className="font-mono">{nf.format(d.matches)}</span> matches
          </>
        }
      >
        {d.itensMonitorados.length === 0 ? (
          <Vazio>Nenhum item.</Vazio>
        ) : (
          <TableWrap minWidth={640}>
            <Table>
              <THead>
                <tr>
                  <Th>Item</Th>
                  <Th>Termos e códigos</Th>
                  <Th>Abrangência</Th>
                  <Th>Situação</Th>
                </tr>
              </THead>
              <tbody>
                {d.itensMonitorados.map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-medium">{i.name}</Td>
                    <Td muted className="text-xs">
                      {[...i.keywords, ...i.catmatCodes.map((c) => `CATMAT ${c}`), ...i.catserCodes.map((c) => `CATSER ${c}`)].slice(0, 6).join(', ')}
                    </Td>
                    <Td className={cx('text-xs', i.ufs.length > 0 && 'font-mono')}>{i.ufs.length ? i.ufs.join('/') : 'nacional'}</Td>
                    <Td>
                      <StatusTag>{i.active ? 'ativo' : 'inativo'}</StatusTag>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao titulo="Cofre de documentos" contagem={d.documentos.length} descricao="Só os metadados: o cofre não armazena o arquivo.">
        {d.documentos.length === 0 ? (
          <Vazio>Nenhum documento.</Vazio>
        ) : (
          <TableWrap minWidth={520}>
            <Table>
              <THead>
                <tr>
                  <Th>Documento</Th>
                  <Th align="right">Validade</Th>
                </tr>
              </THead>
              <tbody>
                {d.documentos.map((doc) => {
                  const vencido = doc.dataValidade && new Date(doc.dataValidade).getTime() < Date.now()
                  return (
                    <Tr key={doc.id}>
                      <Td>{doc.nome}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {doc.dataValidade ? (
                          <span className="inline-flex items-center justify-end gap-2">
                            {vencido && <StatusTag tone="danger">vencido</StatusTag>}
                            <span className="font-mono text-ink-2">{data(doc.dataValidade)}</span>
                          </span>
                        ) : (
                          <span className="text-muted">sem validade</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao titulo="Decisões de participação" contagem={d.planosDeParticipacao.length}>
        {d.planosDeParticipacao.length === 0 ? (
          <Vazio>Nenhuma.</Vazio>
        ) : (
          <TableWrap minWidth={560}>
            <Table>
              <THead>
                <tr>
                  <Th>Situação</Th>
                  <Th>Objeto</Th>
                </tr>
              </THead>
              <tbody>
                {d.planosDeParticipacao.map((p) => (
                  <Tr key={p.tenderId}>
                    <Td className="w-px whitespace-nowrap">
                      <StatusTag>{p.status.replace(/_/g, ' ').toLowerCase()}</StatusTag>
                    </Td>
                    <Td>
                      <TextLink href={`/tenders/${p.tenderId}`}>{p.tender.objeto.slice(0, 110)}</TextLink>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao
        titulo="Atividade recente"
        acoes={
          <Link
            href={`/admin/auditoria?companyId=${e.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Ver tudo na auditoria
            <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        {d.auditoriaRecente.length === 0 ? (
          <Vazio>Sem eventos.</Vazio>
        ) : (
          <TableWrap minWidth={600}>
            <Table>
              <THead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Ação</Th>
                  <Th>Quem</Th>
                </tr>
              </THead>
              <tbody>
                {d.auditoriaRecente.map((ev) => (
                  <Tr key={ev.id}>
                    <Td className="whitespace-nowrap font-mono text-xs text-muted">{dataHora(ev.createdAt)}</Td>
                    <Td>{ROTULO_ACAO[ev.action] ?? ev.action}</Td>
                    <Td className="text-xs text-muted">{ev.actorEmail ?? 'sistema'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>
    </div>
  )
}
