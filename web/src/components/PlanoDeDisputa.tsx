'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, Check, CheckCircle2, CircleHelp, Copy, FileSearch, type LucideIcon } from 'lucide-react'
import { formatarData } from '@/lib/datas'
import type { AlvoDoPregao, BaseDoValorFinal, DisputaDoPregao, SituacaoDoChecklist } from '@/lib/types'
import { Button, Checkbox, LinkButton, Notice, Panel, TextLink, cx } from '@/components/ui'

const ALVO_GLOBAL = 'global'

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

export function valorParaOPortal(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

function rotuloDoAlvo(alvo: AlvoDoPregao): string {
  return alvo.id === ALVO_GLOBAL ? 'Valor global' : `Item ${alvo.numero ?? '?'}`
}

function BotaoDeCopiar({ valor, rotulo, onCopiado, compacto = false }: { valor: number; rotulo: string; onCopiado: () => void; compacto?: boolean }) {
  const [estado, setEstado] = useState<'nada' | 'ok' | 'falhou'>('nada')

  useEffect(() => {
    if (estado === 'nada') return
    const t = setTimeout(() => setEstado('nada'), 2500)
    return () => clearTimeout(t)
  }, [estado])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valorParaOPortal(valor))
      setEstado('ok')
      onCopiado()
    } catch {
      setEstado('falhou')
    }
  }

  return (
    <Button
      size="sm"
      variant={compacto ? 'ghost' : 'secondary'}
      icon={estado === 'ok' ? Check : Copy}
      onClick={copiar}
      aria-label={`Copiar o valor final mínimo: ${rotulo}`}
      className={cx('h-11! sm:h-9!', compacto && 'w-11! px-0! sm:w-auto! sm:px-2.5!')}
    >
      <span className={cx(compacto && 'hidden sm:inline')}>{estado === 'ok' ? 'Copiado' : estado === 'falhou' ? 'Copie à mão' : 'Copiar'}</span>
    </Button>
  )
}

export function PlanoDoValorFinal({
  alvo,
  alvos,
  baseDoValor,
  margemDesejadaPct,
  vedacaoARobo,
  idDoEstudo,
  salvando,
  desabilitado,
  onMudarBase,
  onMarcarCadastrado,
  onCopiado,
}: {
  alvo: AlvoDoPregao
  alvos: AlvoDoPregao[]
  baseDoValor: string
  margemDesejadaPct: number
  vedacaoARobo: boolean
  idDoEstudo: string
  salvando: boolean
  desabilitado: boolean
  onMudarBase: (base: BaseDoValorFinal) => void
  onMarcarCadastrado: (cadastrado: boolean) => void
  onCopiado: (alvo: string) => void
}) {
  const plano = alvo.planoDeDisputa
  const valor = plano.valorFinalMinimo
  const noEquilibrio = plano.base === 'EQUILIBRIO'
  const outros = alvos.filter((a) => a.planoDeDisputa.valorFinalMinimo !== null)

  return (
    <Panel title="Plano de disputa" description={`Valor final mínimo para o lance automático do Compras.gov.br · ${rotuloDoAlvo(alvo)}`}>
      <div className="flex flex-col gap-4">
        {valor === null ? (
          <p className="text-sm text-ink-2">
            Preencha os custos no estudo de custos para a Bela calcular o valor final mínimo.{' '}
            <TextLink href={`/escolhidas/${idDoEstudo}`}>Abrir estudo de custos</TextLink>
          </p>
        ) : (
          <>
            <div className={cx('flex flex-col gap-2 rounded-lg border px-3 py-3', noEquilibrio ? 'border-danger-line bg-danger-soft' : 'border-accent-line bg-accent-soft')}>
              <span className="text-xs font-medium text-muted">Valor final mínimo · {baseDoValor}</span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cx('break-all font-mono text-3xl font-semibold tracking-tight', noEquilibrio ? 'text-danger' : 'text-ink')}>{brl(valor)}</span>
                <BotaoDeCopiar valor={valor} rotulo={rotuloDoAlvo(alvo)} onCopiado={() => onCopiado(alvo.id)} />
              </div>
              <p className="text-xs text-ink-2">
                {noEquilibrio
                  ? 'Ponto de equilíbrio: nesse valor o lucro é zero. Abaixo dele há prejuízo.'
                  : plano.lucroZero
                    ? 'Com os impostos e a margem desejada, o mínimo coincide com o ponto de equilíbrio (lucro zero).'
                    : `Menor valor que ainda garante a margem desejada de ${pct(margemDesejadaPct)}, o mesmo do estudo de custos. Nunca fica abaixo do ponto de equilíbrio${alvo.equilibrio !== null ? ` (${brl(alvo.equilibrio)})` : ''}.`}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Checkbox
                label="Usar o ponto de equilíbrio em vez do mínimo com margem"
                checked={noEquilibrio}
                disabled={desabilitado || salvando}
                onChange={(e) => onMudarBase(e.target.checked ? 'EQUILIBRIO' : 'MARGEM')}
                className="min-h-11 sm:min-h-0"
              />
              {noEquilibrio && (
                <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
                  Lucro zero: se ganhar nesse valor, você não ganha nada, e qualquer custo esquecido vira prejuízo.
                </p>
              )}
              <Checkbox
                label="Já cadastrei este valor no portal"
                hint={plano.cadastradoEm ? `Marcado em ${formatarData(plano.cadastradoEm, { comHora: true })}` : undefined}
                checked={plano.cadastradoEm !== null}
                disabled={desabilitado || salvando}
                onChange={(e) => onMarcarCadastrado(e.target.checked)}
                className="min-h-11 sm:min-h-0"
              />
              {plano.desatualizado && (
                <Notice tone="warn">O valor mudou depois que você marcou como cadastrado (custos, margem ou critério). Atualize o valor no portal e marque de novo.</Notice>
              )}
            </div>
          </>
        )}

        {vedacaoARobo ? (
          <Notice tone="danger" title="O edital proíbe robô de lances — use só lances manuais">
            Use este valor como o seu limite: não dê lance abaixo dele. O lance automático do próprio Compras.gov.br é uma função do sistema oficial; só use se o edital permitir.
          </Notice>
        ) : (
          <details className="rounded-lg border border-line-soft bg-sunken">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Como usar no Compras.gov.br</summary>
            <ol className="flex list-decimal flex-col gap-2 border-t border-line-soft py-3 pl-8 pr-3 text-sm text-ink-2">
              <li>Na sala de disputa, procure a opção de lance automático / valor final mínimo — confirme no seu portal, porque o nome e o lugar da opção podem mudar.</li>
              <li>Digite o valor acima (use o botão Copiar). {alvo.id === ALVO_GLOBAL ? 'É o total da proposta.' : 'Se a disputa for por item, cadastre um valor para cada item.'}</li>
              <li>Pronto: o próprio sistema oficial dá os lances por você, cobrindo o melhor lance dentro do intervalo do edital, e nunca vai abaixo desse valor.</li>
            </ol>
            <p className="border-t border-line-soft px-3 py-2 text-xs text-muted">
              O valor é sigiloso: os outros licitantes e o órgão não veem (art. 19, § 2º, da IN SEGES/ME 73/2022). A Bela não grava o valor no registro de auditoria, só que ele foi copiado ou cadastrado.
            </p>
          </details>
        )}

        {outros.length > 1 && (
          <details className="rounded-lg border border-line-soft">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Todos os valores finais mínimos</summary>
            <ul className="flex flex-col divide-y divide-line-soft border-t border-line-soft">
              {outros.map((a) => (
                <li key={a.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={a.rotulo}>
                    {rotuloDoAlvo(a)}
                    {a.planoDeDisputa.base === 'EQUILIBRIO' && <span className="ml-1.5 text-xs font-semibold text-danger">lucro zero</span>}
                  </span>
                  <span className="font-mono text-sm font-medium text-ink">{brl(a.planoDeDisputa.valorFinalMinimo!)}</span>
                  <BotaoDeCopiar compacto valor={a.planoDeDisputa.valorFinalMinimo!} rotulo={rotuloDoAlvo(a)} onCopiado={() => onCopiado(a.id)} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  )
}

const ICONE_DA_SITUACAO: Record<SituacaoDoChecklist, { icone: LucideIcon; cor: string }> = {
  ok: { icone: CheckCircle2, cor: 'text-ok' },
  atencao: { icone: AlertTriangle, cor: 'text-warn' },
  proibido: { icone: Ban, cor: 'text-danger' },
  desconhecido: { icone: CircleHelp, cor: 'text-faint' },
}

export function ChecklistDaDisputa({ disputa, idDaLicitacao }: { disputa: DisputaDoPregao; idDaLicitacao: string }) {
  const emAndamento = disputa.analise === 'PENDING' || disputa.analise === 'RUNNING'
  return (
    <Panel title="Checklist da disputa" description={disputa.analisado ? 'Lido na análise do edital. Confira no edital antes da sessão.' : 'Confira no edital antes da sessão.'} padding="none">
      {!disputa.analisado && (
        <div className="border-b border-line-soft p-3">
          <Notice tone="info">
            {emAndamento
              ? 'A análise do edital está em andamento. Quando terminar, a Bela preenche este checklist.'
              : 'O edital ainda não foi analisado. Com a análise, a Bela lê o modo de disputa, o intervalo mínimo entre lances e se o edital proíbe robôs.'}
            {!emAndamento && (
              <div className="mt-2">
                <LinkButton href={`/tenders/${idDaLicitacao}?aba=analise`} size="sm" icon={FileSearch} className="h-11! sm:h-8!">
                  Analisar edital
                </LinkButton>
              </div>
            )}
          </Notice>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-line-soft">
        {disputa.checklist.map((item) => {
          const { icone: Icone, cor } = ICONE_DA_SITUACAO[item.situacao]
          return (
            <li key={item.id} className="flex gap-2.5 px-4 py-3">
              <Icone size={16} className={cx('mt-0.5 shrink-0', cor)} aria-hidden />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{item.titulo}:</span>{' '}
                  <span className={cx(item.situacao === 'proibido' && 'font-semibold text-danger', item.situacao === 'desconhecido' && 'text-muted')}>{item.valor}</span>
                </p>
                <p className="text-xs text-muted">{item.explicacao}</p>
                {item.trecho && (
                  <blockquote className="break-words border-l-2 border-line-strong pl-2 text-xs italic text-ink-2">“{item.trecho}”</blockquote>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
