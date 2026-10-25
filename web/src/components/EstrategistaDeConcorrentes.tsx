'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { ApiRequestError } from '@/lib/api'
import {
  analisarConcorrente,
  criarConcorrente,
  enviarDocumentoDoConcorrente,
  listarConcorrentes,
  removerConcorrente,
  type AchadoDeHabilitacao,
  type AnaliseDeConcorrente,
  type SituacaoDoAchado,
  type StatusDaAnalise,
  type StatusDaVerificacao,
} from '@/lib/concorrentes'
import { Button, Carregando, EmptyState, ErrorState, Field, Input, Notice, Panel, StatusTag, type Tom } from '@/components/ui'
import MinutaDeRecurso from '@/components/MinutaDeRecurso'

const STATUS_ANALISE: Record<StatusDaAnalise, { tom: Tom; rotulo: string }> = {
  PENDING: { tom: 'neutral', rotulo: 'Aguardando' },
  RUNNING: { tom: 'accent', rotulo: 'Analisando…' },
  DONE: { tom: 'ok', rotulo: 'Pronta' },
  FAILED: { tom: 'danger', rotulo: 'Falhou' },
  NO_DOCUMENTS: { tom: 'neutral', rotulo: 'Sem documentos' },
  DISABLED: { tom: 'neutral', rotulo: 'Indisponível' },
}

const SITUACAO: Record<SituacaoDoAchado, { tom: Tom; rotulo: string }> = {
  nao_atende: { tom: 'danger', rotulo: 'Não atende' },
  nao_comprovado: { tom: 'warn', rotulo: 'Não comprovado' },
  atende: { tom: 'ok', rotulo: 'Atende' },
  indefinido: { tom: 'neutral', rotulo: 'Indefinido' },
}

const VERIFICACAO: Record<StatusDaVerificacao, { tom: Tom; rotulo: string }> = {
  confirmado: { tom: 'ok', rotulo: 'trecho conferido no documento' },
  parcial: { tom: 'warn', rotulo: 'trecho parcial — confira' },
  'nao-localizado': { tom: 'danger', rotulo: 'trecho não localizado — confira' },
  'nao-verificavel': { tom: 'neutral', rotulo: 'trecho não conferível (documento escaneado)' },
}

const GRAVIDADE: Record<AchadoDeHabilitacao['gravidade'], number> = { alta: 0, media: 1, baixa: 2 }
const PESO_SITUACAO: Record<SituacaoDoAchado, number> = { nao_atende: 0, nao_comprovado: 1, indefinido: 2, atende: 3 }
const TIPOS_ACEITOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

// Pior primeiro: o que inabilita (não atende / não comprovado, gravidade alta) no topo.
function ordenarAchados(achados: AchadoDeHabilitacao[]): AchadoDeHabilitacao[] {
  return [...achados].sort((a, b) => PESO_SITUACAO[a.situacao] - PESO_SITUACAO[b.situacao] || GRAVIDADE[a.gravidade] - GRAVIDADE[b.gravidade])
}

function Achados({ achados }: { achados: AchadoDeHabilitacao[] }) {
  if (achados.length === 0) return <p className="px-4 py-3 text-sm text-muted">A IA não apontou nada a destacar nos documentos enviados.</p>
  return (
    <ul className="flex flex-col divide-y divide-line-soft">
      {ordenarAchados(achados).map((a, i) => (
        <li key={i} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag tone={SITUACAO[a.situacao].tom} dot>
              {SITUACAO[a.situacao].rotulo}
            </StatusTag>
            {a.situacao !== 'atende' && <StatusTag tone={a.gravidade === 'alta' ? 'danger' : 'neutral'}>{a.gravidade === 'alta' ? 'pode inabilitar' : a.gravidade}</StatusTag>}
            <span className="font-medium text-ink">{a.exigencia}</span>
          </div>
          <p className="text-ink-2">{a.explicacao}</p>
          {a.trecho.trim() && (
            <>
              <blockquote className="border-l-2 border-line-strong pl-3 text-xs italic text-muted">“{a.trecho}”</blockquote>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusTag tone={VERIFICACAO[a.verificacao.status].tom}>{VERIFICACAO[a.verificacao.status].rotulo}</StatusTag>
                {a.documento && <span>em {a.documento}{a.verificacao.paginaConfirmada ? `, p. ${a.verificacao.paginaConfirmada}` : ''}</span>}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function CartaoDaAnalise({
  analise,
  ocupado,
  onEnviar,
  onAnalisar,
  onRemover,
}: {
  analise: AnaliseDeConcorrente
  ocupado: boolean
  onEnviar: (id: string, arquivo: File) => void
  onAnalisar: (id: string) => void
  onRemover: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const s = STATUS_ANALISE[analise.status]
  const resultado = analise.status === 'DONE' ? analise.resultado : null

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {analise.nomeConcorrente || 'Concorrente sem nome'}
          <StatusTag tone={s.tom} dot={analise.status === 'RUNNING'}>
            {s.rotulo}
          </StatusTag>
        </span>
      }
      description={analise.arquivos.length > 0 ? `${analise.arquivos.length} documento(s): ${analise.arquivos.map((a) => a.nomeArquivo).join(', ')}` : 'Nenhum documento enviado ainda.'}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={inputRef} type="file" accept={TIPOS_ACEITOS} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onEnviar(analise.id, f) }} />
          <Button size="sm" variant="secondary" icon={Upload} disabled={ocupado || analise.status === 'RUNNING'} onClick={() => inputRef.current?.click()}>
            Enviar documento
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Sparkles}
            loading={ocupado || analise.status === 'RUNNING'}
            disabled={analise.arquivos.length === 0}
            onClick={() => onAnalisar(analise.id)}
          >
            {analise.status === 'DONE' ? 'Analisar de novo' : 'Analisar habilitação'}
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} disabled={ocupado || analise.status === 'RUNNING'} onClick={() => onRemover(analise.id)}>
            Remover
          </Button>
        </div>
      }
      padding={resultado ? 'none' : 'md'}
    >
      {analise.status === 'FAILED' && <Notice tone="danger">{analise.erro || 'Não foi possível concluir a análise.'}</Notice>}
      {analise.status === 'RUNNING' && <Carregando texto="A IA está lendo os documentos e cruzando com as exigências do edital…" />}
      {analise.status !== 'FAILED' && analise.status !== 'RUNNING' && !resultado && analise.arquivos.length === 0 && (
        <p className="text-sm text-muted">Envie os documentos de habilitação do concorrente (PDF, JPG ou PNG) e clique em “Analisar habilitação”.</p>
      )}
      {analise.status !== 'FAILED' && analise.status !== 'RUNNING' && !resultado && analise.arquivos.length > 0 && (
        <p className="text-sm text-muted">Documentos prontos. Clique em “Analisar habilitação” para a IA apontar o que pode inabilitar o concorrente.</p>
      )}
      {resultado && (
        <div className="flex flex-col">
          <div className="flex flex-col gap-2 border-b border-line-soft px-4 py-3">
            {resultado.resumo && <p className="text-sm text-ink-2">{resultado.resumo}</p>}
            {resultado.recomendacao && (
              <Notice tone="info">
                <span className="font-medium">Recomendação: </span>
                {resultado.recomendacao}
              </Notice>
            )}
          </div>
          <Achados achados={resultado.achados} />
          {resultado.achados.some((a) => a.situacao === 'nao_atende' || a.situacao === 'nao_comprovado') && (
            <MinutaDeRecurso analiseId={analise.id} nomeConcorrente={analise.nomeConcorrente} />
          )}
        </div>
      )}
    </Panel>
  )
}

export default function EstrategistaDeConcorrentes({ tenderId }: { tenderId: string }) {
  const [analises, setAnalises] = useState<AnaliseDeConcorrente[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setErro(null)
    listarConcorrentes(tenderId)
      .then((d) => vivo && setAnalises(d))
      .catch((e) => vivo && setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
    return () => {
      vivo = false
    }
  }, [tenderId, tentativa])

  // Enquanto houver análise rodando, reconsulta de tempos em tempos até terminar.
  useEffect(() => {
    if (!analises?.some((a) => a.status === 'RUNNING')) return
    const t = setInterval(() => {
      listarConcorrentes(tenderId)
        .then(setAnalises)
        .catch(() => undefined)
    }, 4000)
    return () => clearInterval(t)
  }, [analises, tenderId])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setCriando(true)
    setAviso(null)
    try {
      const criada = await criarConcorrente(tenderId, nome.trim() || null)
      setNome('')
      setAnalises((atual) => [criada, ...(atual ?? [])])
    } catch (err) {
      setAviso(err instanceof ApiRequestError ? err.message : 'Não foi possível criar a análise.')
    } finally {
      setCriando(false)
    }
  }

  function substituir(a: AnaliseDeConcorrente) {
    setAnalises((atual) => (atual ?? []).map((x) => (x.id === a.id ? a : x)))
  }

  async function enviar(id: string, arquivo: File) {
    setOcupadoId(id)
    setAviso(null)
    try {
      substituir(await enviarDocumentoDoConcorrente(id, arquivo))
    } catch (err) {
      setAviso(err instanceof ApiRequestError ? err.message : 'Não foi possível enviar o documento.')
    } finally {
      setOcupadoId(null)
    }
  }

  async function analisar(id: string) {
    setOcupadoId(id)
    setAviso(null)
    try {
      substituir(await analisarConcorrente(id))
    } catch (err) {
      setAviso(err instanceof ApiRequestError ? err.message : 'Não foi possível iniciar a análise.')
    } finally {
      setOcupadoId(null)
    }
  }

  async function remover(id: string) {
    setOcupadoId(id)
    try {
      await removerConcorrente(id)
      setAnalises((atual) => (atual ?? []).filter((a) => a.id !== id))
    } catch (err) {
      setAviso(err instanceof ApiRequestError ? err.message : 'Não foi possível remover.')
    } finally {
      setOcupadoId(null)
    }
  }

  if (erro) return <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
  if (!analises) return <Carregando texto="Carregando o estrategista de habilitação…" />

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Estrategista de habilitação: analise a habilitação dos concorrentes"
        description="Suba os documentos de habilitação de um concorrente (edital, portal ou sessão) e a IA cruza com as exigências do edital, apontando o que pode inabilitá-lo. Cada trecho citado é conferido no próprio documento. É um apoio — a decisão de impugnar é sua e do seu advogado."
      >
        <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nome do concorrente" hint="Opcional — ajuda a organizar quando houver mais de um." className="flex-1">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Alfa Comércio Ltda" maxLength={200} />
          </Field>
          <Button type="submit" icon={Plus} loading={criando}>
            Adicionar concorrente
          </Button>
        </form>
      </Panel>

      {aviso && <Notice tone="warn">{aviso}</Notice>}

      {analises.length === 0 ? (
        <EmptyState
          title="Nenhum concorrente em análise"
          description="Adicione um concorrente acima, envie os documentos de habilitação dele e peça a análise. A IA aponta documentos ausentes, vencidos ou insuficientes."
        />
      ) : (
        analises.map((a) => (
          <CartaoDaAnalise key={a.id} analise={a} ocupado={ocupadoId === a.id} onEnviar={enviar} onAnalisar={analisar} onRemover={remover} />
        ))
      )}
    </div>
  )
}
