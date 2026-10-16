'use client'

import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { Loader2, Search, TriangleAlert } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { rastrear } from '@/lib/rastreamento'
import type { AmostraDaVitrine, RespostaDaVitrine } from '@/lib/dadosPublicos'
import LinkDeCadastro from './LinkDeCadastro'
import PrazoNoCliente from './PrazoNoCliente'
import { rotuloCurtoDaFonte } from './ChegandoAgora'
import { EVENTO_DE_BUSCA, ID_DA_BUSCA, type PedidoDeBusca } from './buscaDaEntrada'
import { frasePropria, nomeProprio } from '@/lib/textoLegivel'
import { ESTADOS } from '@/lib/estados'

const MINIMO_DE_LETRAS = 3
const MAXIMO_DE_LETRAS = 60

const SUGESTOES = ['material de limpeza', 'notebook', 'medicamentos', 'estrutura metálica']

type EstadoDaBusca =
  | { fase: 'ocioso' }
  | { fase: 'buscando' }
  | { fase: 'resultado'; termo: string; uf: string; total: number; amostras: AmostraDaVitrine[] }
  | { fase: 'limite' }
  | { fase: 'erro' }

function onde(uf: string): string {
  return ESTADOS.find((e) => e.sigla === uf)?.local ?? 'em todo o Brasil'
}

function destinoDoCadastro(termo: string, uf: string) {
  const query: Record<string, string> = {}
  if (termo) query.q = termo
  if (uf) query.uf = uf
  return { pathname: '/cadastro', query }
}

function Amostra({ amostra }: { amostra: AmostraDaVitrine }) {
  return (
    <li className="az-resultado-item">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="az-resultado-objeto">{frasePropria(amostra.objeto)}</p>
        <p className="az-resultado-orgao" title={`${amostra.orgao} · ${amostra.local}`}>
          {nomeProprio(amostra.orgao ?? '')}
          {amostra.local && ` · ${amostra.local}`}
        </p>
      </div>
      <div className="az-resultado-meta">
        <PrazoNoCliente prazo={amostra.prazo} />
        <span className="az-fonte-tag">{rotuloCurtoDaFonte(amostra.fonte)}</span>
      </div>
    </li>
  )
}

function Resultado({ termo, uf, total, amostras }: { termo: string; uf: string; total: number; amostras: AmostraDaVitrine[] }) {
  const destino = destinoDoCadastro(termo, uf)

  if (total === 0) {
    return (
      <div className="az-resultado-corpo">
        <p className="az-resultado-titulo">
          Nenhuma licitação aberta agora para <strong>“{termo}”</strong> {onde(uf)}.
        </p>
        <p className="az-resultado-nota">
          Licitações novas abrem todo dia. Tente um termo mais curto ou todo o Brasil, ou crie a conta: você cadastra o que vende e o Monitor avisa quando aparecer.
        </p>
        <LinkDeCadastro origem="vitrine" href={destino} className="az-pilula az-pilula-verde az-pilula-cheia">
          Criar conta grátis e ser avisado
        </LinkDeCadastro>
      </div>
    )
  }

  return (
    <div className="az-resultado-corpo">
      <p className="az-resultado-titulo">
        <span className="az-resultado-numero">{total.toLocaleString('pt-BR')}</span> {total === 1 ? 'licitação aberta' : 'licitações abertas'} agora para <strong>“{termo}”</strong> {onde(uf)}
      </p>
      <p className="az-resultado-nota">{total > amostras.length ? `Mostrando ${amostras.length} de ${total.toLocaleString('pt-BR')}, pelo prazo mais próximo.` : 'Ordenadas pelo prazo mais próximo.'}</p>
      <ul className="az-resultado-lista">
        {amostras.map((a, i) => (
          <Amostra key={`${a.objeto}-${i}`} amostra={a} />
        ))}
      </ul>
      <LinkDeCadastro origem="vitrine" href={destino} className="az-pilula az-pilula-verde az-pilula-cheia">
        Criar conta grátis e ver todas
      </LinkDeCadastro>
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

  const buscando = estado.fase === 'buscando'

  return (
    <section id={ID_DA_BUSCA} aria-labelledby="vitrine-titulo" className="az-busca">
      <h2 id="vitrine-titulo" className="sr-only">
        Veja o que está aberto agora para o que você vende
      </h2>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          buscar(termo)
        }}
        noValidate
        role="search"
        className="az-busca-form"
      >
        <div className="az-busca-caixa">
          <Search size={20} strokeWidth={2.5} aria-hidden className="az-busca-lupa" />
          <label htmlFor="busca-termo" className="sr-only">
            O que você vende?
          </label>
          <input
            id="busca-termo"
            type="search"
            name="q"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="O que você vende?"
            maxLength={MAXIMO_DE_LETRAS}
            autoComplete="off"
            enterKeyHint="search"
            aria-invalid={erroDoTermo ? true : undefined}
            aria-describedby={erroDoTermo ? 'busca-erro' : 'busca-nota'}
            className="az-busca-campo"
          />
          <button type="submit" disabled={buscando} aria-busy={buscando || undefined} className="az-pilula az-pilula-verde az-busca-botao">
            {buscando && <Loader2 size={18} strokeWidth={2.5} className="animate-spin" aria-hidden />}
            Ver licitações abertas
          </button>
        </div>
        {erroDoTermo && (
          <p id="busca-erro" role="alert" className="az-busca-erro">
            <TriangleAlert size={14} strokeWidth={2.5} aria-hidden />
            {erroDoTermo}
          </p>
        )}
        <div className="az-busca-extras">
          <label className="az-busca-uf">
            <span>Onde</span>
            <select name="uf" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Todo o Brasil</option>
              {ESTADOS.map((e) => (
                <option key={e.sigla} value={e.sigla}>
                  {e.sigla} · {e.nome}
                </option>
              ))}
            </select>
          </label>
          <span className="az-busca-experimente">Experimente:</span>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTermo(s)
                buscar(s)
              }}
              className="az-chip"
            >
              {s}
            </button>
          ))}
        </div>
        <p id="busca-nota" className="az-busca-nota">
          Busca real nas licitações abertas que o Monitor acompanha. Sem cadastro.
        </p>
      </form>
      <div aria-live="polite">
        {estado.fase !== 'ocioso' && (
          <div className="az-resultado">
            {estado.fase === 'buscando' && (
              <div className="az-resultado-corpo" aria-busy>
                <p className="az-resultado-nota">Buscando licitações abertas…</p>
                <span className="az-esqueleto" />
                <span className="az-esqueleto az-esqueleto-curto" />
                <span className="az-esqueleto" />
              </div>
            )}
            {estado.fase === 'resultado' && <Resultado termo={estado.termo} uf={estado.uf} total={estado.total} amostras={estado.amostras} />}
            {estado.fase === 'limite' && (
              <div className="az-resultado-corpo">
                <p className="az-resultado-titulo">Muitas buscas em pouco tempo</p>
                <p className="az-resultado-nota">Para continuar buscando sem limite, crie a sua conta grátis.</p>
                <LinkDeCadastro origem="vitrine" href={destinoDoCadastro(termo.trim(), uf)} className="az-pilula az-pilula-verde az-pilula-cheia">
                  Criar conta grátis
                </LinkDeCadastro>
              </div>
            )}
            {estado.fase === 'erro' && (
              <div className="az-resultado-corpo">
                <p className="az-resultado-titulo az-resultado-erro">Não deu para buscar agora. Tente de novo em instantes.</p>
                <button type="button" onClick={() => buscar(termo)} className="az-pilula az-pilula-contorno az-pilula-cheia">
                  Tentar de novo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
