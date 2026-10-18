'use client'

import { useUsoDoPlano } from '@/hooks/useUsoDoPlano'
import { Carregando, ErrorState, Panel, StatusTag, cx } from '@/components/ui'
import { avisoDoUsoDoPlano, situacaoDoRecurso } from '@/lib/planos'

export default function UsoDoPlano() {
  const { dados, erro, recarregar } = useUsoDoPlano()

  if (erro && !dados) return <ErrorState message="Não foi possível carregar o uso do seu plano." onRetry={recarregar} />
  if (!dados) {
    return (
      <Panel title="Seu plano">
        <Carregando texto="Carregando plano…" />
      </Panel>
    )
  }

  const recursos = dados.recursos.map((r) => {
    const limite = dados.ilimitado ? null : r.limite
    return { ...r, limite, excedido: situacaoDoRecurso(r.usado, limite) === 'excedido' }
  })
  const aviso = avisoDoUsoDoPlano(recursos)

  return (
    <Panel title="Seu plano" actions={<StatusTag>{dados.plano.nome}</StatusTag>}>
      {dados.ilimitado && <p className="mb-3.5 text-xs text-muted">Seu acesso de administrador não tem limite de uso.</p>}
      <ul className="flex flex-col gap-3.5">
        {recursos.map((r) => {
          const pct = r.limite === null ? 0 : r.limite === 0 ? 100 : Math.min(100, Math.round((r.usado / r.limite) * 100))
          const cor = r.excedido ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-accent'
          return (
            <li key={r.recurso} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-2 first-letter:uppercase">{r.rotulo}</span>
                <span className={cx('shrink-0 text-xs', r.excedido ? 'text-danger' : 'text-muted')}>
                  <span className="font-mono text-ink-2">{r.usado}</span>
                  {r.limite === null ? (
                    ' · sem limite'
                  ) : (
                    <>
                      {' / '}
                      <span className="font-mono">{r.limite}</span>
                    </>
                  )}
                </span>
              </div>
              {r.limite !== null && (
                <div
                  className="h-1 overflow-hidden rounded-sm bg-line-soft"
                  role="progressbar"
                  aria-label={r.rotulo}
                  aria-valuenow={r.usado}
                  aria-valuemin={0}
                  aria-valuemax={r.limite}
                >
                  <div className={cx('h-full', cor)} style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {aviso && <p className={cx('mt-3.5 text-xs', aviso.tom === 'perigo' ? 'text-danger' : 'text-muted')}>{aviso.texto}</p>}
    </Panel>
  )
}
