'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import EscolhaDoPlano, { type EscolhaFeita } from '@/components/EscolhaDoPlano'
import { Button, Carregando, FormError, Notice, Panel, StatusTag, buttonClasses, useDialogo } from '@/components/ui'
import type { CobrancaNaConta } from '@/components/PrazoDoAcesso'
import { ROTULO_DA_FORMA, ROTULO_DO_STATUS, TOM_DO_STATUS, diaDoVencimento, diaEmBrasilia, reais, tomDoPagamento, type ResumoDaCobranca } from '@/lib/cobranca'

export default function AssinaturaDaEmpresa({ onSituacao }: { onSituacao?: (situacao: CobrancaNaConta) => void }) {
  const [resumo, setResumo] = useState<ResumoDaCobranca | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [semDocumento, setSemDocumento] = useState(false)
  const [indisponivel, setIndisponivel] = useState(false)
  const { confirmar, dialogo } = useDialogo()

  const carregar = useCallback(
    () =>
      api
        .get<ResumoDaCobranca>('/api/cobranca')
        .then((r) => {
          setResumo(r)
          const vigente = r.assinatura && r.assinatura.status !== 'CANCELADA'
          onSituacao?.(vigente ? 'assinatura-vigente' : r.disponivel ? 'sem-assinatura' : 'desligada')
        })
        .catch((e) => {
          onSituacao?.('desligada')
          if (e instanceof ApiRequestError && e.status === 404) setIndisponivel(true)
          else setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar a assinatura')
        }),
    [onSituacao]
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function assinar(escolha: EscolhaFeita) {
    setErro(null)
    setSemDocumento(false)
    setEnviando(true)
    try {
      const r = await api.post<{ linkDaFatura: string | null }>('/api/cobranca/assinar', escolha)
      if (r.linkDaFatura) {
        window.location.href = r.linkDaFatura
        return
      }
      await carregar()
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'SEM_DOCUMENTO') setSemDocumento(true)
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível criar a assinatura agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  async function cancelar() {
    const ok = await confirmar({
      titulo: 'Cancelar a assinatura?',
      mensagem: resumo?.assinatura?.pagoAte
        ? `As próximas faturas deixam de ser geradas. Você continua usando até ${diaEmBrasilia(resumo.assinatura.pagoAte)}, e nada é apagado.`
        : 'A fatura em aberto é cancelada. Seus dados continuam guardados.',
      confirmarRotulo: 'Cancelar a assinatura',
      cancelarRotulo: 'Manter',
      perigo: true,
    })
    if (!ok) return
    setErro(null)
    setEnviando(true)
    try {
      await api.post('/api/cobranca/cancelar', {})
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível cancelar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (indisponivel) return null
  if (!resumo && !erro) {
    return (
      <Panel title="Assinatura">
        <Carregando linhas={2} />
      </Panel>
    )
  }
  if (!resumo || (!resumo.disponivel && !resumo.assinatura)) return erro ? <Notice tone="warn">{erro}</Notice> : null

  const a = resumo.assinatura
  const vigente = a && a.status !== 'CANCELADA'
  const aberta = resumo.pagamentos.find((p) => p.emAberto && p.linkDaFatura)

  return (
    <Panel title="Assinatura" actions={a ? <StatusTag tone={TOM_DO_STATUS[a.status]}>{ROTULO_DO_STATUS[a.status]}</StatusTag> : undefined}>
      <div className="flex flex-col gap-4 text-sm">
        {a && (
          <div className="flex flex-col gap-1 text-ink-2">
            <p>
              Plano <strong className="text-ink">{a.plano}</strong>, {a.ciclo === 'ANUAL' ? 'anual' : 'mensal'}: <strong className="text-ink">{reais(a.valorCentavos)}</strong>
              {a.valorCentavos < a.valorCheioCentavos && (
                <span className="text-muted">
                  {' '}
                  (cupom {a.cupom}, desconto até {diaEmBrasilia(a.descontoAte)}; depois {reais(a.valorCheioCentavos)})
                </span>
              )}
            </p>
            {a.pagoAte && <p>{a.status === 'CANCELADA' ? `Acesso pago até ${diaEmBrasilia(a.pagoAte)}.` : `Pago até ${diaEmBrasilia(a.pagoAte)}.`}</p>}
          </div>
        )}

        {vigente && aberta && (
          <Notice tone={aberta.status === 'OVERDUE' ? 'danger' : 'info'} title={aberta.status === 'OVERDUE' ? 'Fatura vencida' : 'Fatura em aberto'}>
            <div className="flex flex-col gap-2">
              <span>
                {reais(aberta.valorCentavos)}, vencimento {diaDoVencimento(aberta.vencimento)}.
                {aberta.status === 'OVERDUE' && ' Pague em até 5 dias depois do vencimento para não perder o acesso.'}
              </span>
              <a href={aberta.linkDaFatura!} className={buttonClasses('primary', 'sm', 'self-start')}>
                <ExternalLink size={14} aria-hidden />
                Pagar a fatura
              </a>
            </div>
          </Notice>
        )}

        {!vigente && resumo.disponivel && resumo.podeGerenciar && resumo.planos.length > 0 && (
          <>
            <p className="text-ink-2">{a ? 'Para voltar a usar depois do período pago, assine de novo:' : 'Escolha o plano para continuar usando a Licita Bela depois do teste grátis.'}</p>
            <EscolhaDoPlano planos={resumo.planos} enviando={enviando} erro={erro} onEscolher={(e) => void assinar(e)} />
            {semDocumento && (
              <Link href="/empresa" className="self-start text-sm font-semibold text-accent underline">
                Cadastrar o CNPJ em Empresa
              </Link>
            )}
          </>
        )}

        {!vigente && !resumo.podeGerenciar && <p className="text-muted">Só o dono da empresa pode assinar ou mudar o plano.</p>}

        {resumo.pagamentos.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-ink">Faturas ({resumo.pagamentos.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-line-soft">
              {resumo.pagamentos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-ink">{reais(p.valorCentavos)}</span>
                    <span className="text-xs text-muted">
                      vence {diaDoVencimento(p.vencimento)}
                      {p.pagoEm && ` · paga em ${diaEmBrasilia(p.pagoEm)}`}
                      {p.forma && p.forma !== 'UNDEFINED' && ` · ${ROTULO_DA_FORMA[p.forma] ?? p.forma}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusTag tone={tomDoPagamento(p)}>{p.situacao}</StatusTag>
                    {p.linkDaFatura && (
                      <a href={p.linkDaFatura} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent underline">
                        {p.emAberto ? 'Pagar' : 'Recibo'}
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {vigente && resumo.podeGerenciar && (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <p className="text-xs text-muted">Para trocar de plano, fale com o suporte. O cancelamento vale no fim do período já pago.</p>
            <Button variant="secondary" size="sm" className="self-start" loading={enviando} onClick={() => void cancelar()}>
              Cancelar a assinatura
            </Button>
          </div>
        )}
        {vigente && <FormError>{erro}</FormError>}
      </div>
      {dialogo}
    </Panel>
  )
}
