'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { RevisaoDaAnalise } from '@/lib/adminTypes'
import { Notice, StatusTag, type Tom } from '@/components/ui'

const ROTULO_CAMPO: Record<string, string> = {
  resumo: 'Resumo',
  valorEstimado: 'Valor estimado',
  dataSessao: 'Data da sessão',
  registroPrecos: 'Registro de preços',
  prazoEntrega: 'Prazo de entrega',
  local: 'Local',
  pagamento: 'Pagamento',
  criterioJulgamento: 'Critério de julgamento',
  adesaoAta: 'Adesão à ata',
  prazoImpugnacao: 'Prazo de impugnação',
  prazoEsclarecimento: 'Prazo de esclarecimento',
  garantiaProposta: 'Garantia de proposta',
  garantiaContratual: 'Garantia contratual',
  patrimonioLiquidoMinimo: 'Patrimônio líquido mínimo',
  visitaTecnica: 'Visita técnica',
  exigenciasTecnicas: 'Exigências técnicas',
  documentosExigidos: 'Documentos exigidos',
  matrizExigencias: 'Matriz de exigências',
  riscos: 'Pontos de atenção',
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const TOM_DO_VEREDITO: Record<'aprovada' | 'corrigida' | 'reprovada', Tom> = {
  aprovada: 'ok',
  corrigida: 'accent',
  reprovada: 'warn',
}

export default function RelatorioDaRevisao({ revisao }: { revisao: RevisaoDaAnalise | null }) {
  const [aberto, setAberto] = useState(false)
  if (!revisao) return null

  if (revisao.status === 'EM_ANDAMENTO') {
    return (
      <Notice tone="info" title="Análise preliminar">
        A revisão automática está em andamento e pode levar alguns minutos. Você já pode consultar o resultado abaixo; ele será atualizado
        automaticamente quando a revisão terminar.
      </Notice>
    )
  }

  if (revisao.status === 'NAO_EXECUTADA') {
    return (
      <p className="rounded border border-line bg-sunken px-3 py-2 text-xs text-ink-2">
        Análise <strong className="font-semibold">sem revisão</strong>
        {revisao.em ? (
          <>
            {' ('}
            <span className="font-mono">{quando(revisao.em)}</span>
            {')'}
          </>
        ) : null}
        .{revisao.motivo ? ` ${revisao.motivo}` : ''}
      </p>
    )
  }

  if (revisao.status === 'FALHOU') {
    return (
      <Notice tone="warn" title="Esta análise não foi revisada">
        <p>
          {revisao.motivo ?? 'A revisão falhou.'} Trate os dados com mais cautela e confira o edital.
        </p>
        {revisao.em && (
          <p className="mt-1 text-xs text-muted">
            Revisão tentada em <span className="font-mono">{quando(revisao.em)}</span>.
          </p>
        )}
        {revisao.detalheTecnico && <p className="mt-1 font-mono text-2xs text-muted">Detalhe técnico (admin): {revisao.detalheTecnico}</p>}
      </Notice>
    )
  }

  const v = revisao.veredito ?? 'corrigida'
  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-surface px-3.5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">Análise revisada</span>
        <StatusTag tone={TOM_DO_VEREDITO[v]}>
          {v === 'aprovada' ? 'revisão aprovada, sem mudanças relevantes' : v === 'reprovada' ? 'o revisor refez a maior parte' : `${revisao.totalDeAlteracoes} correção(ões) do revisor`}
        </StatusTag>
      </div>
      {revisao.resumo && <p className="text-ink-2">{revisao.resumo}</p>}
      {revisao.alteracoes.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAberto(!aberto)}
            aria-expanded={aberto}
            className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline"
          >
            {aberto ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            {aberto ? 'Ocultar' : 'Ver'} o que foi corrigido
          </button>
          {aberto && (
            <ul className="flex flex-col divide-y divide-line-soft rounded border border-line-soft bg-sunken text-xs">
              {revisao.alteracoes.map((a, i) => (
                <li key={i} className="flex flex-col gap-0.5 px-3 py-2 text-ink-2">
                  <p className="font-medium text-ink">
                    {ROTULO_CAMPO[a.campo] ?? a.campo} · {a.tipo}
                  </p>
                  {a.antes && <p className="text-muted line-through">{a.antes}</p>}
                  {a.depois && <p>{a.depois}</p>}
                  {a.motivo && <p className="text-muted">Motivo: {a.motivo}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-2xs text-muted">
        A dupla conferência reduz erros, mas não os elimina: o sistema também confere por código se cada exigência aparece no edital. Confirme os pontos
        importantes no documento original.
      </p>
    </div>
  )
}
