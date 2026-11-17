'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import AdminShell, { RotuloDoPlano, useNomesDosPlanos } from '@/components/AdminShell'
import { formatarData } from '@/lib/datas'
import { api, ApiRequestError } from '@/lib/api'
import type { ContatoDoFunil, EtapasDoFunil, FunilDeVendas } from '@/lib/adminTypes'
import { Carregando, Checkbox, EmptyState, ErrorState, Field, Metric, MetricRow, Panel, Select, StatusTag, Table, TableWrap, Td, TextLink, THead, Th, Tr } from '@/components/ui'

const nf = new Intl.NumberFormat('pt-BR')
const PERIODOS = [7, 30, 90] as const

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const taxa = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : null)

export default function AdminFunilPage() {
  return <AdminShell titulo="Funil de vendas">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30)
  const [dados, setDados] = useState<FunilDeVendas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [soQuemNaoUsou, setSoQuemNaoUsou] = useState(false)
  const nomesDosPlanos = useNomesDosPlanos()

  const carregar = useCallback(async () => {
    try {
      setDados(await api.get<FunilDeVendas>(`/api/admin/funil?dias=${dias}`))
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [dias])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const contatos = useMemo(() => (dados ? (soQuemNaoUsou ? dados.contatos.filter((c) => !c.usou && !c.pagante) : dados.contatos) : []), [dados, soQuemNaoUsou])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Período" className="w-full max-w-[12rem]">
          <Select value={dias} onChange={(e) => setDias(Number(e.target.value) as (typeof PERIODOS)[number])}>
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                Últimos {p} dias
              </option>
            ))}
          </Select>
        </Field>
        {dados && (
          <p className="text-xs text-muted">
            De {formatarData(dados.desde)} a {formatarData(dados.ate)}
          </p>
        )}
      </div>

      {erro && <ErrorState message={erro} onRetry={carregar} />}
      {!dados && !erro && <Carregando linhas={6} />}

      {dados && (
        <>
          <section aria-labelledby="funil-etapas" className="flex flex-col gap-2.5">
            <h2 id="funil-etapas" className="text-sm font-semibold text-ink">
              Do cadastro ao pagamento
            </h2>
            <MetricRow>
              <Metric label="Cadastros" value={nf.format(dados.totais.cadastros)} detail="pelo cadastro público" />
              <Metric label="E-mail confirmado" value={nf.format(dados.totais.emailConfirmado)} detail={<>{pct(dados.taxas.confirmacao)} dos cadastros</>} />
              <Metric label="Usaram o sistema" value={nf.format(dados.totais.usaram)} detail={<>{pct(dados.taxas.uso)} dos confirmados</>} color="ceu" />
              <Metric label="Viraram pagantes" value={nf.format(dados.totais.pagantes)} detail={<>{pct(dados.taxas.pagamento)} de quem usou · {pct(dados.taxas.total)} do total</>} color="ok" />
            </MetricRow>
            <p className="max-w-prose text-xs text-muted">
              &quot;Usou o sistema&quot;: criou um item monitorado (além do item automático do interesse do cadastro), salvou uma licitação, abriu um plano de
              participação, perguntou ao edital ou pediu análise de edital. &quot;Pagante&quot;: assinatura ativa, com pagamento confirmado. Cada etapa conta só os
              cadastros do período.
            </p>
          </section>

          <section aria-labelledby="funil-semanas" className="flex flex-col gap-2.5">
            <h2 id="funil-semanas" className="text-sm font-semibold text-ink">
              Por semana do cadastro
            </h2>
            <TabelaDeEtapas linhas={dados.semanas.map((s) => ({ chave: s.semana, rotulo: `Semana de ${formatarData(s.semana)}`, ...s }))} primeiraColuna="Semana" />
          </section>

          <section aria-labelledby="funil-origens" className="flex flex-col gap-2.5">
            <h2 id="funil-origens" className="text-sm font-semibold text-ink">
              Por origem (fonte / campanha)
            </h2>
            {dados.origens.length === 0 ? (
              <EmptyState title="Nenhum cadastro no período." />
            ) : (
              <TabelaDeEtapas linhas={dados.origens.map((o) => ({ chave: o.origem, rotulo: o.origem, ...o }))} primeiraColuna="Origem" />
            )}
          </section>

          <Panel
            title="Para entrar em contato"
            description={`Cadastros do período, do mais novo para o mais antigo${dados.contatosOmitidos ? ` (os ${nf.format(dados.contatos.length)} mais recentes; ${nf.format(dados.contatosOmitidos)} mais antigos ficaram de fora)` : ''}.`}
            actions={<Checkbox label="Só quem não voltou a usar" checked={soQuemNaoUsou} onChange={(e) => setSoQuemNaoUsou(e.target.checked)} />}
            padding="none"
          >
            {contatos.length === 0 ? (
              <div className="p-4">
                <EmptyState title={soQuemNaoUsou ? 'Todo mundo do período já usou o sistema.' : 'Nenhum cadastro no período.'} />
              </div>
            ) : (
              <ListaDeContatos contatos={contatos} nomesDosPlanos={nomesDosPlanos} />
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function TabelaDeEtapas({ linhas, primeiraColuna }: { linhas: Array<EtapasDoFunil & { chave: string; rotulo: string }>; primeiraColuna: string }) {
  return (
    <TableWrap minWidth={560}>
      <Table>
        <THead>
          <tr>
            <Th>{primeiraColuna}</Th>
            <Th align="right">Cadastros</Th>
            <Th align="right">Confirmaram</Th>
            <Th align="right">Usaram</Th>
            <Th align="right">Pagantes</Th>
          </tr>
        </THead>
        <tbody>
          {linhas.map((l) => (
            <Tr key={l.chave}>
              <Td className="max-w-[16rem] truncate" title={l.rotulo}>
                {l.rotulo}
              </Td>
              <Td numeric>{nf.format(l.cadastros)}</Td>
              <Td numeric>
                {nf.format(l.emailConfirmado)} <span className="text-xs text-muted">{pct(taxa(l.emailConfirmado, l.cadastros))}</span>
              </Td>
              <Td numeric>
                {nf.format(l.usaram)} <span className="text-xs text-muted">{pct(taxa(l.usaram, l.emailConfirmado))}</span>
              </Td>
              <Td numeric>
                {nf.format(l.pagantes)} <span className="text-xs text-muted">{pct(taxa(l.pagantes, l.usaram))}</span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  )
}

function Situacao({ c }: { c: ContatoDoFunil }) {
  return (
    <div className="flex flex-wrap gap-1">
      {c.pagante ? (
        <StatusTag tone="ok">pagante</StatusTag>
      ) : c.usou ? (
        <StatusTag tone="accent">usou</StatusTag>
      ) : c.emailConfirmado ? (
        <StatusTag tone="warn">não voltou</StatusTag>
      ) : (
        <StatusTag tone="danger">e-mail não confirmado</StatusTag>
      )}
    </div>
  )
}

function Origem({ c }: { c: ContatoDoFunil }) {
  const partes = [c.origem.fonte, c.origem.campanha, c.origem.termo].filter(Boolean)
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="text-ink-2">{partes.join(' / ')}</span>
      {c.interesse && (
        <span className="text-muted">
          interesse: {c.interesse.termo}
          {c.interesse.uf ? ` (${c.interesse.uf})` : ''}
        </span>
      )}
    </div>
  )
}

function Contato({ c }: { c: ContatoDoFunil }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <TextLink href={`/admin/empresas/${c.companyId}`}>{c.nome || c.empresa}</TextLink>
      <span className="break-all text-xs text-muted">{c.email}</span>
      {c.whatsapp ? (
        <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent underline underline-offset-[3px]">
          <MessageCircle size={13} aria-hidden /> {c.telefone}
        </a>
      ) : c.telefone ? (
        <span className="text-xs text-muted">{c.telefone}</span>
      ) : null}
    </div>
  )
}

function ListaDeContatos({ contatos, nomesDosPlanos }: { contatos: ContatoDoFunil[]; nomesDosPlanos: Record<string, string> }) {
  return (
    <>
      {/* Celular: um cartão por pessoa. */}
      <ul className="flex flex-col divide-y divide-line-soft md:hidden">
        {contatos.map((c) => (
          <li key={c.userId} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <Contato c={c} />
              <Situacao c={c} />
            </div>
            <span className="text-xs text-muted">
              {c.empresa} · {c.tipoDeDocumento}
            </span>
            <Origem c={c} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <RotuloDoPlano codigo={c.plano} nome={nomesDosPlanos[c.plano]} />
              <span>cadastro {formatarData(c.cadastradoEm)}</span>
              {c.testeAte && <span>teste até {formatarData(c.testeAte)}</span>}
              <span>última atividade {formatarData(c.ultimaAtividade)}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* Telas maiores: tabela. */}
      <div className="hidden md:block">
        <TableWrap minWidth={980} className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Empresa</Th>
                <Th>Plano</Th>
                <Th>Origem</Th>
                <Th>Situação</Th>
                <Th align="right">Cadastro</Th>
                <Th align="right">Última atividade</Th>
              </tr>
            </THead>
            <tbody>
              {contatos.map((c) => (
                <Tr key={c.userId}>
                  <Td>
                    <Contato c={c} />
                  </Td>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span>{c.empresa}</span>
                      <span className="text-xs text-muted">{c.tipoDeDocumento}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <RotuloDoPlano codigo={c.plano} nome={nomesDosPlanos[c.plano]} />
                      {c.testeAte && <span className="text-xs text-muted">teste até {formatarData(c.testeAte)}</span>}
                    </div>
                  </Td>
                  <Td>
                    <Origem c={c} />
                  </Td>
                  <Td>
                    <Situacao c={c} />
                  </Td>
                  <Td numeric muted>
                    {formatarData(c.cadastradoEm)}
                  </Td>
                  <Td numeric muted>
                    {formatarData(c.ultimaAtividade)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </div>
    </>
  )
}
