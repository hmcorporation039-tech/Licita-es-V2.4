'use client'

import { useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { Button, FormError, Notice, Panel, StatusTag } from '@/components/ui'

export interface Diagnostico {
  resumo: string
  passosParaReproduzir: string[]
  causaProvavel: string
  confianca: 'baixa' | 'media' | 'alta'
  arquivosEnvolvidos: string[]
  arquivosDescartados?: string[]
  correcaoSugerida: string
  informacoesQueFaltam: string
  errosAnalisados?: number
  modelo?: string
}

const TOM_DA_CONFIANCA = { baixa: 'warn', media: 'accent', alta: 'ok' } as const
const ROTULO_DA_CONFIANCA = { baixa: 'confiança baixa', media: 'confiança média', alta: 'confiança alta' } as const

export default function DiagnosticoDoChamado({
  numero,
  diagnostico,
  status,
  geradoEm,
  onAtualizar,
}: {
  numero: number
  diagnostico: Diagnostico | null
  status: string | null
  geradoEm: string | null
  onAtualizar: () => void
}) {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    setErro(null)
    setGerando(true)
    try {
      await api.post(`/api/admin/chamados/${numero}/diagnostico`)
      onAtualizar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível gerar o diagnóstico agora')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Stethoscope size={18} aria-hidden />
          Diagnóstico técnico
        </span>
      }
      description="Feito pela IA a partir do relato e dos erros guardados. Ela não altera código, banco nem faz deploy."
      actions={
        <Button size="sm" variant="secondary" loading={gerando} disabled={gerando || status === 'DIAGNOSTICANDO'} onClick={() => void gerar()}>
          {diagnostico ? 'Refazer diagnóstico' : 'Gerar diagnóstico'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {status === 'DIAGNOSTICANDO' && <Notice tone="info">Diagnóstico em andamento. Recarregue a página em um minuto.</Notice>}
        {status === 'FALHOU' && <Notice tone="warn">O último diagnóstico falhou. Tente gerar de novo.</Notice>}
        {!diagnostico && status !== 'DIAGNOSTICANDO' && <p className="text-muted">Ainda não há diagnóstico. Chamados de erro recebem um automaticamente ao serem abertos.</p>}
        {diagnostico && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusTag tone={TOM_DA_CONFIANCA[diagnostico.confianca]}>{ROTULO_DA_CONFIANCA[diagnostico.confianca]}</StatusTag>
              {geradoEm && <span>{formatarData(geradoEm, { comHora: true })}</span>}
              {diagnostico.errosAnalisados !== undefined && <span>· {diagnostico.errosAnalisados} erro(s) analisado(s)</span>}
            </div>
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-ink">Resumo</h3>
              <p className="whitespace-pre-line text-ink-2">{diagnostico.resumo}</p>
            </section>
            {diagnostico.passosParaReproduzir.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="font-semibold text-ink">Como reproduzir</h3>
                <ol className="list-decimal pl-5 text-ink-2">
                  {diagnostico.passosParaReproduzir.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </section>
            )}
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-ink">Causa provável</h3>
              <p className="whitespace-pre-line text-ink-2">{diagnostico.causaProvavel}</p>
            </section>
            {diagnostico.arquivosEnvolvidos.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="font-semibold text-ink">Arquivos envolvidos</h3>
                <ul className="flex flex-col gap-0.5 font-mono text-xs text-ink-2">
                  {diagnostico.arquivosEnvolvidos.map((a) => (
                    <li key={a} className="break-all">
                      {a}
                    </li>
                  ))}
                </ul>
                {diagnostico.arquivosDescartados && diagnostico.arquivosDescartados.length > 0 && (
                  <p className="text-xs text-muted">{diagnostico.arquivosDescartados.length} caminho(s) citado(s) pela IA não existem no projeto e foram descartados.</p>
                )}
              </section>
            )}
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-ink">Correção sugerida</h3>
              <p className="whitespace-pre-line break-words text-ink-2">{diagnostico.correcaoSugerida}</p>
            </section>
            {diagnostico.informacoesQueFaltam && (
              <section className="flex flex-col gap-1">
                <h3 className="font-semibold text-ink">Perguntar ao cliente</h3>
                <p className="whitespace-pre-line text-ink-2">{diagnostico.informacoesQueFaltam}</p>
              </section>
            )}
            <p className="rounded-lg bg-sunken p-2 text-xs text-muted">
              Para corrigir: no Claude Code, peça <span className="font-mono">resolve o chamado #{numero}</span>.
            </p>
          </>
        )}
        <FormError>{erro}</FormError>
      </div>
    </Panel>
  )
}
