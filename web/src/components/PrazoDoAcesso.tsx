'use client'

import Link from 'next/link'
import { CalendarClock, MessageCircle } from 'lucide-react'
import { useUsoDoPlano } from '@/hooks/useUsoDoPlano'
import { linkDoWhatsAppParaContinuar, numeroDoWhatsApp, situacaoDoAcesso, type SituacaoDoAcesso, type TomDoAcesso } from '@/lib/acessoDaConta'
import type { ResumoDeCotas } from '@/lib/adminTypes'
import { Panel, StatusTag, cx } from '@/components/ui'

const PLANO_DE_TESTE = 'TESTE'

const COR: Record<TomDoAcesso, string> = {
  neutral: 'text-muted',
  warn: 'text-warn',
  danger: 'text-danger',
}

function situacaoDoResumo(dados: ResumoDeCotas | null): SituacaoDoAcesso | null {
  if (!dados || dados.ilimitado) return null
  return situacaoDoAcesso(dados.acessoAte, dados.plano.codigo === PLANO_DE_TESTE)
}

export function PrazoDoAcessoNoMenu() {
  const { dados } = useUsoDoPlano()
  const situacao = situacaoDoResumo(dados)
  if (!situacao) return null
  return (
    <Link href="/conta" className={cx('flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-semibold hover:bg-line-soft', COR[situacao.tom])}>
      <CalendarClock size={13} aria-hidden className="shrink-0" />
      <span>{situacao.texto}</span>
    </Link>
  )
}

export default function PainelDoAcesso() {
  const { dados } = useUsoDoPlano()
  const situacao = situacaoDoResumo(dados)
  if (!situacao) return null
  const whatsapp = numeroDoWhatsApp()
  return (
    <Panel
      title={situacao.emTeste ? 'Seu teste grátis' : 'Prazo do seu acesso'}
      actions={<StatusTag tone={situacao.tom === 'neutral' ? 'accent' : situacao.tom}>{situacao.texto}</StatusTag>}
    >
      <div className="flex flex-col gap-2 text-sm text-ink-2">
        <p>
          {situacao.emTeste ? 'O teste vai até' : 'Seu acesso vai até'} <strong className="text-ink">{situacao.dataCompleta}</strong>. Depois dessa data o login
          fica bloqueado, mas os seus dados continuam guardados.
        </p>
        <p>
          Para continuar usando, fale com a equipe do Monitor
          {whatsapp ? (
            <>
              {' '}
              <a href={linkDoWhatsAppParaContinuar(whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-[3px]">
                <MessageCircle size={14} aria-hidden />
                pelo WhatsApp
              </a>
              .
            </>
          ) : (
            '. Quando o prazo terminar, a tela de login mostra como pedir para continuar.'
          )}{' '}
          Uma cópia dos seus dados pode ser baixada a qualquer momento em “Seus dados”, mais abaixo.
        </p>
      </div>
    </Panel>
  )
}
