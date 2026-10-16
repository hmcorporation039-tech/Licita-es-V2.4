'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, CheckCircle2, FileQuestion, FileSignature, FileText, Gavel } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import type { ModelosDeDocumento } from '@/lib/types'
import { Button, Carregando, Checkbox, ErrorState, LinkButton, Notice, Panel, StatusTag } from '@/components/ui'

const DECLARACOES_DESMARCADAS = new Set(['me-epp'])

export default function DocumentosDaLicitacao({
  tenderId,
  escolhida,
  escolhendo,
  onEscolher,
}: {
  tenderId: string
  escolhida: boolean
  escolhendo: boolean
  onEscolher: () => void
}) {
  const router = useRouter()
  const [modelos, setModelos] = useState<ModelosDeDocumento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [clausulas, setClausulas] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelado = false
    setErro(null)
    api
      .get<ModelosDeDocumento>(`/api/tenders/${tenderId}/documentos/modelos`)
      .then((m) => {
        if (cancelado) return
        setModelos(m)
        setMarcadas((atuais) => (atuais.size > 0 ? atuais : new Set(m.declaracoes.filter((d) => !DECLARACOES_DESMARCADAS.has(d.id)).map((d) => d.id))))
        setClausulas((atuais) => atuais ?? new Set(m.impugnacao.alertas.map((a) => a.chave)))
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível carregar os modelos de documento.')
      })
    return () => {
      cancelado = true
    }
  }, [tenderId, escolhida, tentativa])

  if (erro) return <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
  if (!modelos) return <Carregando linhas={4} texto="Carregando modelos…" />

  function alternar(id: string) {
    setMarcadas((atuais) => {
      const proximas = new Set(atuais)
      if (proximas.has(id)) proximas.delete(id)
      else proximas.add(id)
      return proximas
    })
  }

  const selecionadas = modelos.declaracoes.filter((d) => marcadas.has(d.id)).map((d) => d.id)
  const clausulasMarcadas = modelos.impugnacao.alertas.filter((a) => clausulas?.has(a.chave)).map((a) => a.chave)
  const listaDeClausulas = clausulasMarcadas.map(encodeURIComponent).join(',')

  function alternarClausula(chave: string) {
    setClausulas((atuais) => {
      const proximas = new Set(atuais ?? [])
      if (proximas.has(chave)) proximas.delete(chave)
      else proximas.add(chave)
      return proximas
    })
  }

  const { prazo } = modelos.impugnacao

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">Confira se o edital traz um modelo próprio em anexo; se trouxer, ajuste o texto antes de baixar.</Notice>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Panel title="Proposta comercial" description="Usa os preços de venda do estudo de custos e os dados da sua empresa.">
          {modelos.proposta.disponivel ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-2">
                Itens sem preço de venda saem marcados para preencher. Você revisa o texto antes de baixar em PDF ou Word.
              </p>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/tenders/${tenderId}/documentos?tipo=proposta`} variant="primary" icon={FileSignature}>
                  Gerar proposta
                </LinkButton>
                <LinkButton href={`/escolhidas/${tenderId}`} variant="secondary" icon={Calculator}>
                  Estudo de custos
                </LinkButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Notice tone="warn">{modelos.proposta.motivo ?? 'A proposta ainda não está disponível para esta licitação.'}</Notice>
              <div className="flex flex-wrap gap-2">
                {escolhida ? (
                  <LinkButton href={`/escolhidas/${tenderId}`} variant="secondary" icon={Calculator}>
                    Abrir estudo de custos
                  </LinkButton>
                ) : (
                  <Button variant="secondary" icon={CheckCircle2} loading={escolhendo} onClick={onEscolher}>
                    Escolher esta licitação
                  </Button>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Declarações"
          description="Marque as que o edital pede. Saem juntas, uma por página, no papel timbrado."
          padding="none"
        >
          <fieldset className="flex flex-col">
            <legend className="sr-only">Declarações a gerar</legend>
            <ul className="flex flex-col divide-y divide-line-soft">
              {modelos.declaracoes.map((d) => (
                <li key={d.id} className="px-4 py-2.5">
                  <Checkbox
                    checked={marcadas.has(d.id)}
                    onChange={() => alternar(d.id)}
                    label={d.titulo}
                    hint={DECLARACOES_DESMARCADAS.has(d.id) ? `Só se a empresa for ME ou EPP. ${d.fundamento}` : d.fundamento}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-3">
            <span className="text-xs text-muted">
              <span className="font-mono">{selecionadas.length}</span> de <span className="font-mono">{modelos.declaracoes.length}</span> marcadas
            </span>
            <Button
              variant="primary"
              icon={FileText}
              disabled={selecionadas.length === 0}
              onClick={() => router.push(`/tenders/${tenderId}/documentos?tipo=declaracoes&ids=${selecionadas.map(encodeURIComponent).join(',')}`)}
            >
              Gerar declarações
            </Button>
          </div>
        </Panel>

        <Panel
          title="Impugnação e esclarecimento"
          description="Rascunho no papel timbrado, montado a partir das cláusulas que o sistema achou no edital. Revise com advogado antes de protocolar."
          padding="none"
          className="lg:col-span-2"
        >
          {prazo && (
            <p className="border-b border-line-soft px-4 py-2.5 text-sm text-ink-2">
              {prazo.passou ? (
                <>O prazo para impugnar ou pedir esclarecimento terminou em <strong className="font-mono font-semibold text-ink">{prazo.limite}</strong>.</>
              ) : (
                <>Prazo para protocolar: até <strong className="font-mono font-semibold text-ink">{prazo.limite}</strong> (3 dias úteis antes da sessão).</>
              )}
            </p>
          )}
          {!modelos.impugnacao.analiseFeita ? (
            <p className="px-4 py-3 text-sm text-ink-2">A impugnação usa as cláusulas encontradas na análise do edital. Faça a análise na aba Análise para habilitá-la. O pedido de esclarecimento você pode gerar e escrever suas perguntas.</p>
          ) : modelos.impugnacao.alertas.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-2">A análise não encontrou cláusulas fora dos limites da lei. Se quiser perguntar algo ao órgão, gere um pedido de esclarecimento.</p>
          ) : (
            <fieldset className="flex flex-col">
              <legend className="sr-only">Cláusulas a contestar</legend>
              <ul className="flex flex-col divide-y divide-line-soft">
                {modelos.impugnacao.alertas.map((a) => (
                  <li key={a.chave} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <Checkbox checked={clausulas?.has(a.chave) ?? false} onChange={() => alternarClausula(a.chave)} label={a.titulo} hint={a.local ?? undefined} />
                    <StatusTag tone={a.gravidade === 'alta' ? 'danger' : 'warn'}>{a.gravidade === 'alta' ? 'alta' : 'média'}</StatusTag>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
            <Button
              variant="secondary"
              icon={FileQuestion}
              onClick={() => router.push(`/tenders/${tenderId}/documentos?tipo=esclarecimento&alertas=${listaDeClausulas}`)}
            >
              Pedido de esclarecimento
            </Button>
            <Button
              variant="primary"
              icon={Gavel}
              disabled={clausulasMarcadas.length === 0}
              onClick={() => router.push(`/tenders/${tenderId}/documentos?tipo=impugnacao&alertas=${listaDeClausulas}`)}
            >
              Gerar impugnação
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
