'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { Button, Carregando, EmptyState, ErrorState, Field, FormError, Input, Metric, MetricRow, Notice, Panel, StatusTag, Table, TableWrap, Td, Th, THead, Tr, useDialogo } from '@/components/ui'
import { ROTULO_DO_STATUS, TOM_DO_STATUS, diaDoVencimento, diaEmBrasilia, reais, tomDoPagamento, type AssinaturaDaTela, type PagamentoDaTela } from '@/lib/cobranca'

interface AssinaturaDoAdmin extends AssinaturaDaTela {
  ambiente: string
  empresa: { id: string; name: string }
  motivoDoCancelamento: string | null
  pagamentos: PagamentoDaTela[]
}

interface Cupom {
  id: string
  codigo: string
  percentual: number
  meses: number
  maxUsos: number | null
  usos: number
  validoAte: string | null
  ativo: boolean
  observacao: string | null
}

interface Painel {
  disponivel: boolean
  ambiente: 'sandbox' | 'producao' | null
  mes: { recebidoCentavos: number; liquidoCentavos: number; pagamentos: number }
  porStatus: Record<string, number>
  assinaturas: AssinaturaDoAdmin[]
  cupons: Cupom[]
}

const MOTIVO: Record<string, string> = {
  PEDIDO_DO_CLIENTE: 'pedido do cliente',
  ADMINISTRADOR: 'pelo admin',
  ESTORNO: 'estorno',
  TROCOU_ANTES_DE_PAGAR: 'trocou antes de pagar',
  CANCELADA_NO_ASAAS: 'no painel do Asaas',
}

export default function AdminCobrancaPage() {
  return <AdminShell titulo="Cobrança">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [dados, setDados] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<string | null>(null)
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null)
  const { confirmar, dialogo } = useDialogo()

  const carregar = useCallback(() => {
    api
      .get<Painel>('/api/admin/cobranca')
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function executar(a: AssinaturaDoAdmin, tipo: 'sincronizar' | 'reembolsar' | 'cancelar') {
    if (tipo !== 'sincronizar') {
      const ok = await confirmar({
        titulo: tipo === 'reembolsar' ? `Reembolsar ${a.empresa.name}?` : `Cancelar a assinatura de ${a.empresa.name}?`,
        mensagem:
          tipo === 'reembolsar'
            ? 'Devolve o primeiro pagamento pelo Asaas, cancela a assinatura e encerra o acesso agora. Vale só até 7 dias depois do pagamento.'
            : 'As próximas faturas deixam de ser geradas. O cliente usa até o fim do período pago.',
        confirmarRotulo: tipo === 'reembolsar' ? 'Reembolsar' : 'Cancelar a assinatura',
        perigo: true,
      })
      if (!ok) return
    }
    setErroDaAcao(null)
    setAcao(`${tipo}:${a.id}`)
    try {
      await api.post(`/api/admin/cobranca/assinaturas/${a.id}/${tipo}`, {})
      carregar()
    } catch (e) {
      setErroDaAcao(e instanceof ApiRequestError ? e.message : 'Não foi possível concluir')
    } finally {
      setAcao(null)
    }
  }

  if (erro) return <ErrorState message={erro} onRetry={carregar} />
  if (!dados) return <Carregando />

  return (
    <div className="flex flex-col gap-6">
      {!dados.disponivel && (
        <Notice tone="warn" title="Cobrança desligada">
          A API não tem ASAAS_API_KEY válida para o ASAAS_AMBIENTE configurado. Os clientes não veem a opção de assinar.
        </Notice>
      )}
      {dados.ambiente === 'sandbox' && (
        <Notice tone="info" title="Ambiente de teste (sandbox)">
          Nenhum dinheiro de verdade passa por aqui. Para cobrar de verdade, troque a chave pela de produção e ASAAS_AMBIENTE=producao.
        </Notice>
      )}

      <MetricRow>
        <Metric label="Recebido no mês" value={reais(dados.mes.recebidoCentavos)} detail={`${dados.mes.pagamentos} pagamento(s) · líquido ${reais(dados.mes.liquidoCentavos)}`} />
        <Metric label="Ativas" value={String(dados.porStatus.ATIVA ?? 0)} />
        <Metric label="Com fatura vencida" value={String(dados.porStatus.ATRASADA ?? 0)} tone={dados.porStatus.ATRASADA ? 'warn' : 'default'} />
        <Metric label="Aguardando 1º pagamento" value={String(dados.porStatus.PENDENTE ?? 0)} />
      </MetricRow>

      <Panel title="Assinaturas" padding="none">
        {dados.assinaturas.length === 0 ? (
          <EmptyState title="Nenhuma assinatura ainda" description="Quando um cliente assinar em Minha conta, ela aparece aqui." />
        ) : (
          <TableWrap minWidth={880}>
            <Table>
              <THead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>Plano</Th>
                  <Th align="right">Valor</Th>
                  <Th>Situação</Th>
                  <Th>Pago até</Th>
                  <Th>Última fatura</Th>
                  <Th align="right">Ações</Th>
                </tr>
              </THead>
              <tbody>
                {dados.assinaturas.map((a) => {
                  const ultima = a.pagamentos[0]
                  const primeiroPago = a.pagamentos.some((p) => p.pagoEm)
                  return (
                    <Tr key={a.id}>
                      <Td>
                        <span className="flex flex-col">
                          <span className="font-medium text-ink">{a.empresa.name}</span>
                          <span className="text-xs text-muted">
                            desde {diaEmBrasilia(a.createdAt)}
                            {a.ambiente === 'sandbox' && ' · teste'}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        {a.plano} · {a.ciclo === 'ANUAL' ? 'anual' : 'mensal'}
                        {a.cupom && <span className="block text-xs text-muted">cupom {a.cupom}</span>}
                      </Td>
                      <Td numeric>{reais(a.valorCentavos)}</Td>
                      <Td>
                        <StatusTag tone={TOM_DO_STATUS[a.status]}>{ROTULO_DO_STATUS[a.status]}</StatusTag>
                        {a.motivoDoCancelamento && <span className="block text-xs text-muted">{MOTIVO[a.motivoDoCancelamento] ?? a.motivoDoCancelamento}</span>}
                      </Td>
                      <Td muted>{diaEmBrasilia(a.pagoAte)}</Td>
                      <Td>
                        {ultima ? (
                          <span className="flex flex-col gap-0.5">
                            <StatusTag tone={tomDoPagamento(ultima)}>{ultima.situacao}</StatusTag>
                            <span className="text-xs text-muted">vence {diaDoVencimento(ultima.vencimento)}</span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </Td>
                      <Td>
                        <span className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="ghost" loading={acao === `sincronizar:${a.id}`} onClick={() => void executar(a, 'sincronizar')}>
                            Sincronizar
                          </Button>
                          {a.status !== 'CANCELADA' && primeiroPago && (
                            <Button size="sm" variant="ghost" loading={acao === `reembolsar:${a.id}`} onClick={() => void executar(a, 'reembolsar')}>
                              Reembolsar
                            </Button>
                          )}
                          {a.status !== 'CANCELADA' && (
                            <Button size="sm" variant="ghost" loading={acao === `cancelar:${a.id}`} onClick={() => void executar(a, 'cancelar')}>
                              Cancelar
                            </Button>
                          )}
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
      <FormError>{erroDaAcao}</FormError>

      <Cupons cupons={dados.cupons} onMudou={carregar} />
      {dialogo}
    </div>
  )
}

function Cupons({ cupons, onMudou }: { cupons: Cupom[]; onMudou: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [percentual, setPercentual] = useState('35')
  const [meses, setMeses] = useState('12')
  const [maxUsos, setMaxUsos] = useState('')
  const [validoAte, setValidoAte] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await api.post('/api/admin/cupons', {
        codigo,
        percentual: Number(percentual),
        meses: Number(meses),
        maxUsos: maxUsos ? Number(maxUsos) : null,
        validoAte: validoAte || null,
        observacao: observacao || null,
      })
      setCodigo('')
      setObservacao('')
      onMudou()
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível criar o cupom')
    } finally {
      setSalvando(false)
    }
  }

  async function alternar(c: Cupom) {
    setErro(null)
    try {
      await api.patch(`/api/admin/cupons/${c.id}`, { ativo: !c.ativo })
      onMudou()
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível alterar o cupom')
    }
  }

  return (
    <Panel title="Cupons" description="O Plano Fundador é um cupom: 35% por 12 meses. Crie um código por empresa (ex.: FUNDADOR-ACME) e entregue por escrito.">
      <div className="flex flex-col gap-5">
        <form onSubmit={(e) => void criar(e)} className="grid gap-3 sm:grid-cols-3">
          <Field label="Código" required>
            <Input value={codigo} maxLength={30} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="FUNDADOR-ACME" />
          </Field>
          <Field label="Desconto (%)" required>
            <Input type="number" min={1} max={90} value={percentual} onChange={(e) => setPercentual(e.target.value)} />
          </Field>
          <Field label="Por quantos meses" required>
            <Input type="number" min={1} max={36} value={meses} onChange={(e) => setMeses(e.target.value)} />
          </Field>
          <Field label="Vagas" hint="Vazio = sem limite">
            <Input type="number" min={1} value={maxUsos} onChange={(e) => setMaxUsos(e.target.value)} />
          </Field>
          <Field label="Válido até" hint="Vazio = sem prazo">
            <Input type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} />
          </Field>
          <Field label="Observação">
            <Input value={observacao} maxLength={300} onChange={(e) => setObservacao(e.target.value)} placeholder="Empresa e combinado" />
          </Field>
          <div className="flex items-end sm:col-span-3">
            <Button type="submit" variant="primary" loading={salvando} disabled={codigo.trim().length < 3}>
              Criar cupom
            </Button>
          </div>
        </form>
        <FormError>{erro}</FormError>
        {cupons.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-soft text-sm">
            {cupons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono font-semibold text-ink">{c.codigo}</span>
                  <span className="text-xs text-muted">
                    {c.percentual}% por {c.meses} {c.meses === 1 ? 'mês' : 'meses'} · usado {c.usos}
                    {c.maxUsos !== null && ` de ${c.maxUsos}`}
                    {c.validoAte && ` · até ${diaEmBrasilia(c.validoAte)}`}
                    {c.observacao && ` · ${c.observacao}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusTag tone={c.ativo ? 'ok' : 'neutral'}>{c.ativo ? 'ativo' : 'desativado'}</StatusTag>
                  <Button size="sm" variant="ghost" onClick={() => void alternar(c)}>
                    {c.ativo ? 'Desativar' : 'Reativar'}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
