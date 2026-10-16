'use client'

import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Button, Carregando, Field, Input, Notice, Prazo, Select, StatusTag } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'
import { paraData } from '@/lib/datas'
import { rastrear } from '@/lib/rastreamento'
import type { AmostraDaVitrine, RespostaDaVitrine } from '@/lib/dadosPublicos'
import LinkDeCadastro from './LinkDeCadastro'
import { EVENTO_DE_BUSCA, ID_DA_BUSCA, type PedidoDeBusca } from './buscaDaEntrada'
import { frasePropria, nomeProprio } from '@/lib/textoLegivel'

const MINIMO_DE_LETRAS = 3
const MAXIMO_DE_LETRAS = 60

const SUGESTOES = ['material de limpeza', 'notebook', 'medicamentos', 'estrutura metálica']

const ESTADOS = [
  { sigla: 'AC', nome: 'Acre', local: 'no Acre' },
  { sigla: 'AL', nome: 'Alagoas', local: 'em Alagoas' },
  { sigla: 'AP', nome: 'Amapá', local: 'no Amapá' },
  { sigla: 'AM', nome: 'Amazonas', local: 'no Amazonas' },
  { sigla: 'BA', nome: 'Bahia', local: 'na Bahia' },
  { sigla: 'CE', nome: 'Ceará', local: 'no Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal', local: 'no Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo', local: 'no Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás', local: 'em Goiás' },
  { sigla: 'MA', nome: 'Maranhão', local: 'no Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso', local: 'em Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', local: 'em Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais', local: 'em Minas Gerais' },
  { sigla: 'PA', nome: 'Pará', local: 'no Pará' },
  { sigla: 'PB', nome: 'Paraíba', local: 'na Paraíba' },
  { sigla: 'PR', nome: 'Paraná', local: 'no Paraná' },
  { sigla: 'PE', nome: 'Pernambuco', local: 'em Pernambuco' },
  { sigla: 'PI', nome: 'Piauí', local: 'no Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', local: 'no Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', local: 'no Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', local: 'no Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia', local: 'em Rondônia' },
  { sigla: 'RR', nome: 'Roraima', local: 'em Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina', local: 'em Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo', local: 'em São Paulo' },
  { sigla: 'SE', nome: 'Sergipe', local: 'em Sergipe' },
  { sigla: 'TO', nome: 'Tocantins', local: 'no Tocantins' },
]

type EstadoDaBusca =
  | { fase: 'ocioso' }
  | { fase: 'buscando' }
  | { fase: 'resultado'; termo: string; uf: string; total: number; amostras: AmostraDaVitrine[] }
  | { fase: 'limite' }
  | { fase: 'erro' }

function onde(uf: string): string {
  return ESTADOS.find((e) => e.sigla === uf)?.local ?? 'em todo o Brasil'
}

function rotuloDaFonte(fonte: string): string {
  return ROTULOS_DE_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
}

function destinoDoCadastro(termo: string, uf: string) {
  const query: Record<string, string> = {}
  if (termo) query.q = termo
  if (uf) query.uf = uf
  return { pathname: '/cadastro', query }
}

function PrazoDaAmostra({ prazo }: { prazo: string | null }) {
  const data = paraData(prazo)
  if (!data || data.getTime() < Date.now()) return <span className="text-xs text-muted">Data no edital</span>
  return <Prazo data={prazo} />
}

function Amostra({ amostra }: { amostra: AmostraDaVitrine }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line-soft px-4 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-medium text-ink">{frasePropria(amostra.objeto)}</p>
        <p className="truncate text-xs text-muted" title={`${amostra.orgao} · ${amostra.local}`}>
          {nomeProprio(amostra.orgao ?? '')}
          {amostra.local && ` · ${amostra.local}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        <PrazoDaAmostra prazo={amostra.prazo} />
        <StatusTag mono title={rotuloDaFonte(amostra.fonte)}>
          {rotuloDaFonte(amostra.fonte)}
        </StatusTag>
      </div>
    </li>
  )
}

function Resultado({ termo, uf, total, amostras }: { termo: string; uf: string; total: number; amostras: AmostraDaVitrine[] }) {
  const destino = destinoDoCadastro(termo, uf)

  if (total === 0) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-ink">
          Nenhuma licitação aberta agora para <strong className="font-semibold">“{termo}”</strong> {onde(uf)}.
        </p>
        <p className="text-sm text-muted">
          Licitações novas abrem todo dia. Tente um termo mais curto ou todo o Brasil, ou crie a conta: você cadastra o que vende e o Monitor avisa quando aparecer.
        </p>
        <LinkDeCadastro origem="vitrine" href={destino} variant="primary" className="h-11! w-full">
          Criar conta grátis e ser avisado
        </LinkDeCadastro>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <p className="px-4 pb-1 pt-4 text-sm text-ink">
        <span className="font-mono text-base font-semibold">{total.toLocaleString('pt-BR')}</span>{' '}
        {total === 1 ? 'licitação aberta' : 'licitações abertas'} agora para <strong className="font-semibold">“{termo}”</strong> {onde(uf)}
      </p>
      <p className="px-4 pb-2 text-xs text-muted">
        {total > amostras.length ? `Mostrando ${amostras.length} de ${total.toLocaleString('pt-BR')}, pelo prazo mais próximo.` : 'Ordenadas pelo prazo mais próximo.'}
      </p>
      <ul className="border-y border-line-soft">
        {amostras.map((a, i) => (
          <Amostra key={`${a.objeto}-${i}`} amostra={a} />
        ))}
      </ul>
      <div className="px-4 py-4">
        <LinkDeCadastro origem="vitrine" href={destino} variant="primary" className="h-11! w-full">
          Criar conta grátis e ver todas
        </LinkDeCadastro>
      </div>
    </div>
  )
}

export default function VitrineDeBusca() {
  const [termo, setTermo] = useState('')
  const [uf, setUf] = useState('')
  const [erroDoTermo, setErroDoTermo] = useState<string | null>(null)
  const [estado, setEstado] = useState<EstadoDaBusca>({ fase: 'ocioso' })

  async function buscar(termoDesejado: string, ufDesejada: string = uf) {
    const limpo = termoDesejado.trim().replace(/\s+/g, ' ')
    if (limpo.length < MINIMO_DE_LETRAS) {
      setErroDoTermo(`Digite pelo menos ${MINIMO_DE_LETRAS} letras do que você vende.`)
      return
    }
    setErroDoTermo(null)
    setEstado({ fase: 'buscando' })
    rastrear('busca_vitrine', { termo: limpo, uf: ufDesejada || 'BR' })
    const query = new URLSearchParams({ q: limpo })
    if (ufDesejada) query.set('uf', ufDesejada)
    try {
      const r = await api.get<RespostaDaVitrine>(`/api/public/vitrine?${query.toString()}`)
      setEstado({ fase: 'resultado', termo: limpo, uf: ufDesejada, total: r.total, amostras: r.amostras.slice(0, 3) })
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 429) setEstado({ fase: 'limite' })
      else if (err instanceof ApiRequestError && err.status === 400) {
        setEstado({ fase: 'ocioso' })
        setErroDoTermo(`Use de ${MINIMO_DE_LETRAS} a ${MAXIMO_DE_LETRAS} letras.`)
      } else setEstado({ fase: 'erro' })
    }
  }

  const buscarPorPedido = useEffectEvent((termoPedido: string, ufPedida?: string) => {
    const termoLimpo = termoPedido.slice(0, MAXIMO_DE_LETRAS)
    setTermo(termoLimpo)
    const ufValida = ufPedida && ESTADOS.some((e) => e.sigla === ufPedida) ? ufPedida : uf
    if (ufValida !== uf) setUf(ufValida)
    buscar(termoLimpo, ufValida)
  })

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search)
    const termoDaUrl = parametros.get('q')?.trim()
    if (termoDaUrl) buscarPorPedido(termoDaUrl, parametros.get('uf')?.trim().toUpperCase())
    const aoPedirBusca = (evento: Event) => {
      const pedido = (evento as CustomEvent<PedidoDeBusca>).detail
      if (pedido?.termo) buscarPorPedido(pedido.termo)
    }
    window.addEventListener(EVENTO_DE_BUSCA, aoPedirBusca)
    return () => window.removeEventListener(EVENTO_DE_BUSCA, aoPedirBusca)
  }, [])

  return (
    <section id={ID_DA_BUSCA} aria-labelledby="vitrine-titulo" className="min-w-0 scroll-mt-6 rounded border border-line-strong bg-surface">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          buscar(termo)
        }}
        noValidate
        className="flex flex-col gap-3 p-4"
      >
        <div className="flex flex-col gap-0.5">
          <h2 id="vitrine-titulo" className="text-sm font-semibold text-ink">
            Veja o que está aberto agora para o que você vende
          </h2>
          <p className="text-xs text-muted">Busca real nas licitações abertas que o Monitor acompanha. Sem cadastro.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9.5rem] md:grid-cols-[minmax(0,1fr)_9.5rem_auto] md:items-start">
          <Field label="O que você vende?" error={erroDoTermo}>
            <Input
              type="search"
              name="q"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="material de limpeza, notebook, medicamentos…"
              maxLength={MAXIMO_DE_LETRAS}
              autoComplete="off"
              enterKeyHint="search"
              className="h-12! text-base!"
            />
          </Field>
          <Field label="Estado">
            <Select name="uf" value={uf} onChange={(e) => setUf(e.target.value)} className="h-12! text-base!">
              <option value="">Todo o Brasil</option>
              {ESTADOS.map((e) => (
                <option key={e.sigla} value={e.sigla}>
                  {e.sigla} · {e.nome}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5 sm:col-span-2 md:col-span-1">
            <span aria-hidden className="hidden text-xs font-medium md:block">
              &nbsp;
            </span>
            <Button type="submit" variant="primary" icon={Search} loading={estado.fase === 'buscando'} className="h-12! w-full px-5! text-base! md:w-auto">
              Ver licitações abertas
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted">
          <span className="mr-1">Experimente:</span>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTermo(s)
                buscar(s)
              }}
              className="inline-flex min-h-11 items-center rounded-sm px-1.5 font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent sm:min-h-7"
            >
              {s}
            </button>
          ))}
        </div>
      </form>
      <div aria-live="polite">
        {estado.fase !== 'ocioso' && (
          <div className="border-t border-line-soft">
            {estado.fase === 'buscando' && (
              <div className="px-4 py-4">
                <Carregando linhas={3} texto="Buscando licitações abertas…" />
              </div>
            )}
            {estado.fase === 'resultado' && <Resultado termo={estado.termo} uf={estado.uf} total={estado.total} amostras={estado.amostras} />}
            {estado.fase === 'limite' && (
              <div className="flex flex-col gap-3 px-4 py-4">
                <Notice tone="warn" title="Muitas buscas em pouco tempo">
                  Para continuar buscando sem limite, crie a sua conta grátis.
                </Notice>
                <LinkDeCadastro origem="vitrine" href={destinoDoCadastro(termo.trim(), uf)} variant="primary" className="h-11! w-full">
                  Criar conta grátis
                </LinkDeCadastro>
              </div>
            )}
            {estado.fase === 'erro' && (
              <div className="px-4 py-4">
                <Notice
                  tone="danger"
                  action={
                    <button type="button" onClick={() => buscar(termo)} className="inline-flex min-h-11 items-center text-sm font-medium text-danger underline underline-offset-[3px] sm:min-h-0">
                      Tentar de novo
                    </button>
                  }
                >
                  Não deu para buscar agora. Tente de novo em instantes.
                </Notice>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
