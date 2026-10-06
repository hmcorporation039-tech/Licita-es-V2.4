'use client'

import Link from 'next/link'
import { MedidaDeAnalises, useUsoDoPlano } from '@/hooks/useUsoDoPlano'

const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

function corDaBarra(m: MedidaDeAnalises) {
  return m.esgotado ? 'bg-red-500' : m.quaseNoLimite ? 'bg-amber-500' : 'bg-indigo-600'
}

export function textoDoRestante(m: MedidaDeAnalises): string {
  if (m.limite === null) return 'sem limite no seu acesso'
  if (m.limite === 0) return 'seu plano não inclui análises de edital'
  if (m.esgotado) return 'limite do mês atingido'
  return `restam ${m.restantes} ${m.restantes === 1 ? 'análise' : 'análises'}`
}

// Etiqueta pequena para o menu: "Análises 3/10", colorida conforme o consumo.
export function MedidorNoMenu() {
  const { medida } = useUsoDoPlano()
  if (!medida) return null
  const cor = medida.esgotado ? 'border-red-300 bg-red-50 text-red-700' : medida.quaseNoLimite ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'
  const dica = `Análises de edital neste mês: ${medida.usadas}${medida.limite === null ? '' : ' de ' + medida.limite} (${textoDoRestante(medida)}).${medida.renovaEm ? ' Renova em ' + dataCurta(medida.renovaEm) + '.' : ''}`
  return (
    <Link href="/conta" title={dica} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cor}`}>
      <span>Análises</span>
      <span>{medida.limite === null ? `${medida.usadas} (sem limite)` : `${medida.usadas}/${medida.limite}`}</span>
    </Link>
  )
}

// Cartão com o medidor completo: quanto já usou, quanto resta, o plano e quando renova.
export default function MedidorDeAnalises({ className = '' }: { className?: string }) {
  const { medida, erro } = useUsoDoPlano()
  if (erro) return null
  if (!medida) return null
  return (
    <div className={`rounded border border-slate-200 bg-white p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-800">Análises de edital neste mês</h2>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Plano {medida.plano}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {medida.usadas}
        {medida.limite !== null && <span className="text-base font-normal text-slate-500"> de {medida.limite} usadas</span>}
        {medida.limite === null && <span className="text-base font-normal text-slate-500"> feitas</span>}
      </p>
      {medida.limite !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={medida.usadas} aria-valuemin={0} aria-valuemax={medida.limite}>
          <div className={`h-full ${corDaBarra(medida)}`} style={{ width: `${medida.percentual}%` }} />
        </div>
      )}
      <p className={`mt-2 text-sm ${medida.esgotado ? 'font-medium text-red-700' : medida.quaseNoLimite ? 'font-medium text-amber-700' : 'text-slate-600'}`}>
        {textoDoRestante(medida).replace(/^./, (c) => c.toUpperCase())}.
        {medida.renovaEm && medida.limite !== null && ` A contagem volta a zero em ${dataCurta(medida.renovaEm)}.`}
      </p>
      {medida.esgotado && <p className="mt-1 text-xs text-red-600">Para continuar antes dessa data, fale com o administrador para ampliar o plano.</p>}
      <p className="mt-2 text-xs text-slate-400">Cada edital que você manda analisar conta 1. Editais que já foram analisados antes abrem na hora e não gastam do seu plano.</p>
    </div>
  )
}
