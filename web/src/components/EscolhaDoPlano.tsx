'use client'

import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button, Field, FormError, Input, cx } from '@/components/ui'
import { economiaDoAnual, precoDoCiclo, reais, type Ciclo, type PlanoParaAssinar } from '@/lib/cobranca'

export interface EscolhaFeita {
  planCode: string
  ciclo: Ciclo
  cupom: string | null
}

export default function EscolhaDoPlano({
  planos,
  enviando,
  erro,
  rotulo = 'Assinar e pagar',
  onEscolher,
}: {
  planos: PlanoParaAssinar[]
  enviando: boolean
  erro: string | null
  rotulo?: string
  onEscolher: (escolha: EscolhaFeita) => void
}) {
  const [ciclo, setCiclo] = useState<Ciclo>('MENSAL')
  const [planCode, setPlanCode] = useState(planos[0]?.code ?? '')
  const [cupom, setCupom] = useState('')
  const [mostrarCupom, setMostrarCupom] = useState(false)
  const temAnual = planos.some((p) => p.precoAnualCentavos)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (planCode) onEscolher({ planCode, ciclo, cupom: cupom.trim() || null })
      }}
    >
      {temAnual && (
        <div role="radiogroup" aria-label="Forma de cobrança" className="inline-flex self-start rounded-lg border border-line bg-sunken p-0.5 text-sm">
          {(['MENSAL', 'ANUAL'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={ciclo === c}
              onClick={() => setCiclo(c)}
              className={cx('rounded-md px-3 py-1.5 font-medium', ciclo === c ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
            >
              {c === 'MENSAL' ? 'Mensal' : 'Anual: 2 meses grátis'}
            </button>
          ))}
        </div>
      )}

      <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-2">
        {planos.map((p) => {
          const preco = precoDoCiclo(p, ciclo)
          const economia = ciclo === 'ANUAL' ? economiaDoAnual(p) : null
          const escolhido = planCode === p.code
          return (
            <button
              key={p.code}
              type="button"
              role="radio"
              aria-checked={escolhido}
              disabled={!preco}
              onClick={() => setPlanCode(p.code)}
              className={cx(
                'flex min-w-0 flex-col gap-1 rounded-xl border p-4 text-left transition-colors disabled:opacity-50',
                escolhido ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
              )}
            >
              <span className="font-bold text-ink">{p.nome}</span>
              <span className="text-lg font-bold text-ink">
                {preco ? reais(preco) : 'Sob consulta'}
                {preco && <span className="text-sm font-medium text-muted">{ciclo === 'ANUAL' ? ' por ano' : ' por mês'}</span>}
              </span>
              {economia && <span className="text-xs font-medium text-ok">Economia de {reais(economia)} no ano</span>}
              {p.descricao && <span className="text-xs text-muted">{p.descricao}</span>}
            </button>
          )
        })}
      </div>

      {mostrarCupom ? (
        <Field label="Cupom de desconto" hint="Recebeu um cupom da equipe? Digite aqui.">
          <Input value={cupom} maxLength={30} autoCapitalize="characters" onChange={(e) => setCupom(e.target.value)} />
        </Field>
      ) : (
        <button type="button" onClick={() => setMostrarCupom(true)} className="self-start text-sm font-medium text-accent underline decoration-accent-line underline-offset-[3px]">
          Tenho um cupom
        </button>
      )}

      <FormError>{erro}</FormError>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" icon={CreditCard} loading={enviando} disabled={enviando || !planCode} className="self-start">
          {rotulo}
        </Button>
        <p className="text-xs text-muted">
          O pagamento é feito na página da fatura do Asaas, a empresa que faz a nossa cobrança: Pix, boleto ou cartão. Na primeira contratação, você pode pedir o reembolso em até 7 dias.
        </p>
      </div>
    </form>
  )
}
