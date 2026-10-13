'use client'

import Link from 'next/link'
import { MedidaDeAnalises, useUsoDoPlano } from '@/hooks/useUsoDoPlano'
import { Panel, StatusTag, cx } from '@/components/ui'

const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

function corDaBarra(m: MedidaDeAnalises) {
  return m.esgotado ? 'bg-danger' : m.quaseNoLimite ? 'bg-warn' : 'bg-accent'
}

function corDoTexto(m: MedidaDeAnalises) {
  return m.esgotado ? 'text-danger' : m.quaseNoLimite ? 'text-warn' : 'text-ink-2'
}

export function textoDoRestante(m: MedidaDeAnalises): string {
  if (m.limite === null) return 'sem limite no seu acesso'
  if (m.limite === 0) return 'seu plano não inclui análises de edital'
  if (m.esgotado) return 'limite do mês atingido'
  return `restam ${m.restantes} ${m.restantes === 1 ? 'análise' : 'análises'}`
}

function BarraDeConsumo({ medida }: { medida: MedidaDeAnalises }) {
  if (medida.limite === null) return null
  return (
    <div
      className="h-1 overflow-hidden rounded-sm bg-line-soft"
      role="progressbar"
      aria-label="Análises de edital usadas no mês"
      aria-valuenow={medida.usadas}
      aria-valuemin={0}
      aria-valuemax={medida.limite}
    >
      <div className={cx('h-full', corDaBarra(medida))} style={{ width: `${medida.percentual}%` }} />
    </div>
  )
}

export function MedidorNoMenu() {
  const { medida } = useUsoDoPlano()
  if (!medida) return null
  const dica = `Análises de edital neste mês: ${medida.usadas}${medida.limite === null ? '' : ' de ' + medida.limite} (${textoDoRestante(medida)}).${medida.renovaEm ? ' Renova em ' + dataCurta(medida.renovaEm) + '.' : ''}`
  return (
    <Link href="/conta" title={dica} className="flex w-full flex-col gap-1.5 rounded px-2 py-1.5 transition-colors hover:bg-line-soft">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-medium text-muted">Análises do mês</span>
        {medida.limite === null ? (
          <span className="text-2xs text-muted">
            <span className="font-mono text-ink-2">{medida.usadas}</span> · sem limite
          </span>
        ) : (
          <span className={cx('font-mono text-2xs', corDoTexto(medida))}>
            {medida.usadas}/{medida.limite}
          </span>
        )}
      </span>
      <BarraDeConsumo medida={medida} />
      <span className="sr-only">{textoDoRestante(medida)}</span>
    </Link>
  )
}

export default function MedidorDeAnalises({ className = '' }: { className?: string }) {
  const { medida, erro } = useUsoDoPlano()
  if (erro) return null
  if (!medida) return null
  const avisoDeConsumo = medida.esgotado || medida.quaseNoLimite
  return (
    <Panel className={className} title="Análises de edital neste mês" actions={<StatusTag>Plano {medida.plano}</StatusTag>}>
      <div className="flex flex-col gap-2.5">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-2xl font-medium tracking-tight text-ink">{medida.usadas}</span>
          {medida.limite !== null ? (
            <span className="text-sm text-muted">
              de <span className="font-mono">{medida.limite}</span> usadas
            </span>
          ) : (
            <span className="text-sm text-muted">feitas</span>
          )}
        </p>
        <BarraDeConsumo medida={medida} />
        <p className={cx('text-sm', corDoTexto(medida), avisoDeConsumo && 'font-medium')}>
          {textoDoRestante(medida).replace(/^./, (c) => c.toUpperCase())}.
          {medida.renovaEm && medida.limite !== null && (
            <>
              {' '}
              A contagem volta a zero em <span className="font-mono">{dataCurta(medida.renovaEm)}</span>.
            </>
          )}
        </p>
        {medida.esgotado && <p className="text-xs text-danger">Para continuar antes dessa data, fale com o administrador para ampliar o plano.</p>}
        <p className="text-xs text-faint">Cada edital que você manda analisar conta 1. Editais que já foram analisados antes abrem na hora e não gastam do seu plano.</p>
      </div>
    </Panel>
  )
}
