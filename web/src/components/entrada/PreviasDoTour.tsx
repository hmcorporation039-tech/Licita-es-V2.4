import type { CSSProperties, ReactNode } from 'react'
import { Check, FileText, Mic, TriangleAlert } from 'lucide-react'
import { buttonClasses, cx, DescriptionList, Panel, Prazo, StatusTag } from '@/components/ui'
import NumeroQueSobe from './NumeroQueSobe'

const HORA = 60 * 60 * 1000

export function atraso(ms: number): CSSProperties {
  return { '--atraso': `${ms}ms` } as CSSProperties
}

function Previa({ children, legenda }: { children: ReactNode; legenda?: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div aria-hidden className="flex min-w-0 flex-col gap-3">
        {children}
      </div>
      <figcaption className="flex items-center gap-2 text-xs text-muted">
        <StatusTag>Exemplo ilustrativo</StatusTag>
        {legenda && <span>{legenda}</span>}
      </figcaption>
    </figure>
  )
}

function Linha({ rotulo, valor, destaque = false, atrasoMs = 0 }: { rotulo: ReactNode; valor: ReactNode; destaque?: boolean; atrasoMs?: number }) {
  return (
    <div className={cx('revela flex items-baseline justify-between gap-4 py-1.5', destaque && 'border-t border-line pt-2.5')} style={atraso(atrasoMs)}>
      <dt className={cx('text-sm', destaque ? 'font-semibold text-ink' : 'text-ink-2')}>{rotulo}</dt>
      <dd className={cx('whitespace-nowrap font-mono text-sm', destaque ? 'font-semibold text-ink' : 'text-ink')}>{valor}</dd>
    </div>
  )
}

function Formatos({ formatos }: { formatos: string[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {formatos.map((f) => (
        <StatusTag key={f} mono>
          {f}
        </StatusTag>
      ))}
    </span>
  )
}

const FALA_DA_BELA = '“Bela, licitação de estrutura metálica no DF”'
const ATRASO_POR_PALAVRA_MS = 80
const INICIO_DA_FALA_MS = 250
const FIM_DA_FALA_MS = INICIO_DA_FALA_MS + FALA_DA_BELA.split(' ').length * ATRASO_POR_PALAVRA_MS

const RESULTADOS_DA_BELA = [
  { horas: 30, objeto: 'Fornecimento e montagem de estrutura metálica para cobertura de quadra', orgao: 'Órgão distrital · Brasília/DF', fonte: 'PNCP' },
  { horas: 4 * 24, objeto: 'Galpão em estrutura metálica para depósito de materiais', orgao: 'Empresa pública distrital · Brasília/DF', fonte: 'Novacap' },
  { horas: 12 * 24, objeto: 'Manutenção de estruturas metálicas e serralheria', orgao: 'Unidade do Sistema S · Taguatinga/DF', fonte: 'Sistema S' },
]

export function PreviaEncontrar() {
  const agora = Date.now()
  return (
    <Previa legenda="Busca falada com a Bela.">
      <div className="revela">
        <Panel padding="none" title="Falar com a Bela" description="Toque no microfone e diga o que procura">
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="revela-pop inline-flex size-9 shrink-0 items-center justify-center rounded border border-accent bg-accent text-white" style={atraso(120)}>
              <Mic size={16} />
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-base text-ink">
                {FALA_DA_BELA.split(' ').map((palavra, i) => (
                  <span key={i} className="revela-palavra" style={atraso(INICIO_DA_FALA_MS + i * ATRASO_POR_PALAVRA_MS)}>
                    {palavra}{' '}
                  </span>
                ))}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="revela-palavra text-xs text-muted" style={atraso(FIM_DA_FALA_MS)}>
                  Entendi:
                </span>
                {['estrutura metálica', 'DF', 'abertas'].map((tag, i) => (
                  <span key={tag} className="revela-pop" style={atraso(FIM_DA_FALA_MS + 120 + i * 110)}>
                    <StatusTag tone="accent">{tag}</StatusTag>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <ul className="border-t border-line-soft">
            {RESULTADOS_DA_BELA.map((r, i) => (
              <li key={r.objeto} className="revela flex items-start justify-between gap-4 border-b border-line-soft px-4 py-2.5 last:border-0" style={atraso(FIM_DA_FALA_MS + 500 + i * 140)}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="line-clamp-2 text-sm text-ink">{r.objeto}</p>
                  <p className="truncate text-xs text-muted">{r.orgao}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Prazo data={new Date(agora + r.horas * HORA)} semHora />
                  <StatusTag mono>{r.fonte}</StatusTag>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Previa>
  )
}

export function PreviaAnalisar() {
  return (
    <Previa legenda="Resumo do edital e alerta de cláusula.">
      <div className="revela">
        <Panel title="Resumo do edital" description="Pregão eletrônico · Estrutura metálica para cobertura">
          <DescriptionList
            items={[
              { label: 'Valor estimado', value: 'R$ 412.600,00', mono: true },
              { label: 'Sessão pública', value: 'em 9 dias úteis' },
              { label: 'Exigências principais', value: 'Atestado de capacidade técnica, registro no CREA, balanço patrimonial' },
              { label: 'Habilitação', value: '7 de 9 documentos já no seu cofre' },
            ]}
          />
        </Panel>
      </div>
      <div className="revela-direita flex flex-col gap-2 rounded border border-danger-line bg-danger-soft px-4 py-3" style={atraso(450)}>
        <div className="flex flex-wrap items-center gap-2">
          <TriangleAlert size={16} className="shrink-0 text-danger" />
          <p className="text-sm font-semibold text-ink">Atestado com 80% da quantidade</p>
          <span className="revela-pop" style={atraso(1000)}>
            <StatusTag tone="danger">Alta</StatusTag>
          </span>
        </div>
        <p className="text-sm text-ink-2">O edital pede atestado de 80% do quantitativo. A lei admite exigir até 50%.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted">Lei 14.133/2021, art. 67, §2º</span>
          <span className={cx('revela', buttonClasses('primary', 'sm'))} style={atraso(1250)}>
            Gerar impugnação
          </span>
        </div>
      </div>
    </Previa>
  )
}

const DOCUMENTOS = [
  { nome: 'Proposta comercial', formatos: ['PDF', 'DOCX'] },
  { nome: 'Declarações exigidas no edital', formatos: ['PDF', 'DOCX'] },
  { nome: 'Pedido de impugnação', formatos: ['PDF', 'DOCX'] },
]

const TRACOS_DA_PAGINA = ['w-3/4 bg-line', 'w-full bg-line-soft', 'w-full bg-line-soft', 'w-5/6 bg-line-soft', 'mt-1 w-full bg-line-soft', 'w-2/3 bg-line-soft']

export function PreviaPreparar() {
  return (
    <Previa legenda="Estudo de custos e documentos no papel timbrado.">
      <div className="revela">
        <Panel title="Estudo de custos" description="Preço por unidade" actions={<StatusTag mono>Item 1</StatusTag>}>
          <dl className="flex flex-col">
            <Linha rotulo="Material e fabricação" valor="R$ 2.180,00" atrasoMs={150} />
            <Linha rotulo="Frete" valor="R$ 96,40" atrasoMs={230} />
            <Linha rotulo="Impostos estimados" valor="R$ 344,25" atrasoMs={310} />
            <Linha rotulo="Custo por unidade" valor="R$ 2.620,65" destaque atrasoMs={390} />
            <Linha rotulo="Margem desejada" valor="15%" atrasoMs={470} />
            <Linha rotulo="Preço mínimo" valor="R$ 3.013,75" atrasoMs={550} />
            <Linha rotulo="Preço proposto · margem 29%" valor="R$ 3.380,00" destaque atrasoMs={630} />
          </dl>
        </Panel>
      </div>
      <div className="revela" style={atraso(300)}>
        <Panel padding="none" title="Documentos prontos" description="No papel timbrado da sua empresa">
          <div className="grid gap-0 sm:grid-cols-[148px_minmax(0,1fr)]">
            <div className="hidden border-r border-line-soft p-3 sm:block">
              <div className="revela-pagina flex aspect-[1/1.3] flex-col gap-1.5 rounded-sm border border-line bg-surface p-2" style={atraso(500)}>
                <div className="flex items-center gap-1.5 border-b border-line-soft pb-1.5">
                  <span className="revela-pop size-3 rounded-sm bg-accent" style={atraso(900)} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-semibold leading-none text-ink">SUA EMPRESA LTDA</span>
                    <span className="font-mono text-[7px] leading-none text-muted">CNPJ 00.000.000/0001-00</span>
                  </span>
                </div>
                {TRACOS_DA_PAGINA.map((classes, i) => (
                  <span key={i} className={cx('revela-traco h-1 rounded-sm', classes)} style={atraso(1000 + i * 120)} />
                ))}
                <span className="revela-traco mt-auto h-px w-1/2 self-center bg-line-strong" style={atraso(1800)} />
              </div>
            </div>
            <ul className="flex flex-col">
              {DOCUMENTOS.map((d, i) => (
                <li key={d.nome} className="revela flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 last:border-0" style={atraso(700 + i * 180)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText size={14} className="shrink-0 text-muted" />
                    <span className="truncate text-sm text-ink">{d.nome}</span>
                  </span>
                  <Formatos formatos={d.formatos} />
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </Previa>
  )
}

export function PreviaDisputar() {
  return (
    <Previa legenda="Pregão com a Bela.">
      <div className="revela">
        <Panel padding="none" title="Pregão com a Bela" description="Item 1 · estrutura metálica" actions={<StatusTag tone="warn">Disputa aberta</StatusTag>}>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-4 rounded border border-ok-line bg-ok-soft p-4">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ok">Margem dentro do desejado</span>
                  <NumeroQueSobe valor={17.7} casas={1} sufixo="%" atrasoMs={250} className="font-mono text-4xl font-semibold tracking-tight text-ok" />
                  <span className="text-xs text-muted">margem no lance sugerido</span>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="revela flex flex-col" style={atraso(200)}>
                    <dt className="text-xs text-muted">Melhor lance</dt>
                    <dd className="font-mono text-base font-medium text-ink">R$ 3.112,00</dd>
                  </div>
                  <div className="revela flex flex-col" style={atraso(320)}>
                    <dt className="text-xs text-muted">Seu mínimo</dt>
                    <dd className="font-mono text-base font-medium text-ink">R$ 3.013,75</dd>
                  </div>
                </dl>
              </div>
              <p className="revela text-base text-ink" style={atraso(1300)}>
                Sugiro cobrir com <span className="font-mono font-semibold">R$ 3.084,50</span>.
              </p>
              <span className={cx('revela', buttonClasses('primary', 'md', 'h-12 w-full text-base'))} style={atraso(1500)}>
                <Check size={16} />
                Dei este lance: <span className="font-mono">R$ 3.084,50</span>
              </span>
            </div>
            <p className="text-xs text-muted">A Bela sugere; quem dá o lance é você.</p>
          </div>
          <div className="revela flex items-center justify-between gap-3 border-t border-line-soft px-4 py-3" style={atraso(1700)}>
            <span className="flex min-w-0 items-center gap-2">
              <FileText size={14} className="shrink-0 text-muted" />
              <span className="truncate text-sm text-ink">Proposta readequada ao valor final</span>
            </span>
            <Formatos formatos={['PDF', 'DOCX']} />
          </div>
        </Panel>
      </div>
    </Previa>
  )
}
