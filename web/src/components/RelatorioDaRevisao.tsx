'use client'

import { useState } from 'react'
import type { RevisaoDaAnalise } from '@/lib/adminTypes'

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

const NOME_DO_MODELO: Record<string, string> = { gemini: 'Gemini', claude: 'Claude' }
const nome = (p: string) => NOME_DO_MODELO[p] ?? p

const COR_DO_VEREDITO = {
  aprovada: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  corrigida: 'border-sky-200 bg-sky-50 text-sky-900',
  reprovada: 'border-amber-300 bg-amber-50 text-amber-900',
} as const

// Mostra COMO a análise foi feita (analista e revisor) e o que o revisor mudou.
export default function RelatorioDaRevisao({ revisao }: { revisao: RevisaoDaAnalise | null }) {
  const [aberto, setAberto] = useState(false)
  if (!revisao) return null

  if (revisao.status === 'NAO_EXECUTADA') {
    return (
      <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        Análise feita por {revisao.analista ? nome(revisao.analista.provider) : 'IA'}, <strong>sem revisão</strong>.
        {revisao.motivo ? ` ${revisao.motivo}` : ''}
      </p>
    )
  }

  if (revisao.status === 'FALHOU') {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        ⚠ Esta análise <strong>não foi revisada</strong>: {revisao.motivo ?? 'a revisão falhou.'} Trate os dados com mais cautela e confira o edital.
        {revisao.detalheTecnico && <span className="mt-1 block font-mono text-[11px] text-amber-800">Detalhe técnico (admin): {revisao.detalheTecnico}</span>}
      </p>
    )
  }

  const v = revisao.veredito ?? 'corrigida'
  return (
    <div className={`rounded border p-3 text-sm ${COR_DO_VEREDITO[v]}`}>
      <p className="font-medium">
        Analisada por {revisao.analista ? nome(revisao.analista.provider) : 'IA'} e revisada por {revisao.revisor ? nome(revisao.revisor.provider) : 'IA'}
        {' · '}
        {v === 'aprovada' ? 'revisão aprovada, sem mudanças relevantes' : v === 'reprovada' ? 'o revisor refez a maior parte' : `${revisao.totalDeAlteracoes} correção(ões) do revisor`}
      </p>
      {revisao.resumo && <p className="mt-1">{revisao.resumo}</p>}
      {revisao.alteracoes.length > 0 && (
        <>
          <button onClick={() => setAberto(!aberto)} className="mt-2 text-xs underline" aria-expanded={aberto}>
            {aberto ? 'Ocultar' : 'Ver'} o que foi corrigido
          </button>
          {aberto && (
            <ul className="mt-2 flex flex-col gap-2 text-xs">
              {revisao.alteracoes.map((a, i) => (
                <li key={i} className="rounded bg-white/70 p-2 text-slate-800">
                  <p className="font-medium">
                    {ROTULO_CAMPO[a.campo] ?? a.campo} · {a.tipo}
                  </p>
                  {a.antes && <p className="text-slate-500 line-through">{a.antes}</p>}
                  {a.depois && <p>{a.depois}</p>}
                  {a.motivo && <p className="mt-0.5 text-slate-600">Motivo: {a.motivo}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] opacity-70">
        A revisão por uma segunda IA reduz erros, mas não os elimina: o sistema também confere por código se cada exigência aparece no edital.
        Confirme os pontos importantes no documento original.
      </p>
    </div>
  )
}
