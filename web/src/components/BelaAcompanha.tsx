'use client'

// "Bela que acompanha": para quem está no teste, a Bela aparece no canto da tela,
// se oferece para levar a pessoa até a primeira licitação e vai junto, tela por
// tela. Etapa 1: pergunta o que a empresa vende e onde, cadastra o item que a
// pessoa confirmou, espera a busca e mostra as licitações achadas.
// Onde a pessoa está fica no servidor (GET/PUT /api/bela/jornada), então ela
// continua de onde parou em qualquer aparelho. A Bela só fala em voz alta depois
// que a pessoa aceita o convite (sem som sozinho ao abrir a página).

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Check, Mic, Minus, Square, X } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { useEscuta, useFalaDaBela } from '@/hooks/useBela'
import { AvatarDaBela } from '@/components/Bela'
import { useAvisoDeCookiesNaTela } from '@/components/AvisoDeMedicao'
import { Button, FormError, Input, cx } from '@/components/ui'
import {
  FALA_FINAL,
  FALA_NOS_MATCHES,
  FASES_EM_ANDAMENTO,
  UFS,
  falaDaBusca,
  falaDoConvite,
  falaDoOnde,
  falaDoQueVende,
  falaDoResultado,
  linkDasAbertas,
  mesmosEstados,
  nomeDoItem,
  type FaseDaJornada,
  type ItemDaJornada,
  type RespostaDaJornada,
} from '@/lib/jornadaNaTela'

const INTERVALO_DA_BUSCA_MS = 3_000
const MAXIMO_DE_CONSULTAS = 30
const CLASSE_DO_DESTAQUE = 'bela-destaque'

export default function BelaAcompanha() {
  const pathname = usePathname()
  const router = useRouter()
  const [dados, setDados] = useState<RespostaDaJornada | null>(null)
  const [fase, setFase] = useState<FaseDaJornada | null>(null)
  const [termo, setTermo] = useState('')
  const [ufs, setUfs] = useState<string[]>([])
  const [escrevendo, setEscrevendo] = useState(false)
  const [minimizada, setMinimizada] = useState(false)
  const [terminou, setTerminou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState(false)
  const falando = useRef(false)
  const fala = useFalaDaBela()
  const escuta = useEscuta()
  const avisoDeCookies = useAvisoDeCookiesNaTela()

  const carregar = useCallback(async () => {
    const r = await api.get<RespostaDaJornada>('/api/bela/jornada')
    setDados(r)
    return r
  }, [])

  useEffect(() => {
    carregar()
      .then((r) => {
        const f = r.estado?.fase ?? null
        if (r.oferecer) setFase(f && FASES_EM_ANDAMENTO.includes(f) ? f : 'convite')
        setTermo(r.estado?.termo ?? '')
        setUfs(r.estado?.ufs ?? (r.ufDaEmpresa ? [r.ufDaEmpresa] : []))
      })
      .catch(() => undefined)
  }, [carregar])

  const gravar = useCallback(async (nova: FaseDaJornada, extra: { termo?: string; ufs?: string[] } = {}) => {
    setFase(nova)
    setErro(null)
    try {
      await api.put('/api/bela/jornada', { fase: nova, ...extra })
    } catch {
      // Gravar onde parou é conveniência: se falhar, o passo a passo continua nesta tela.
    }
  }, [])

  const itemDoCadastro: ItemDaJornada | null = dados?.itens[0] ?? null

  const textoDaFase =
    fase === 'convite'
      ? falaDoConvite(dados?.nome ?? null)
      : fase === 'oQueVende'
        ? falaDoQueVende(escrevendo ? null : itemDoCadastro)
        : fase === 'onde'
          ? falaDoOnde(termo)
          : fase === 'buscando'
            ? falaDaBusca(termo, ufs)
            : fase === 'resultado'
              ? pathname === '/matches' && (dados?.matches ?? 0) > 0
                ? FALA_NOS_MATCHES
                : falaDoResultado(termo, ufs, dados?.matches ?? 0)
              : fase === 'etapa1Feita' && terminou
                ? FALA_FINAL
                : null

  // Fala em voz alta só depois que a pessoa aceitou (gesto dela) e só quando o texto muda.
  useEffect(() => {
    if (falando.current && textoDaFase && !minimizada) fala.dizer(textoDaFase)
  }, [textoDaFase, minimizada, fala])

  // Enquanto busca, consulta a cada 3 s; termina sozinho quando a busca acaba.
  useEffect(() => {
    if (fase !== 'buscando') return
    let consultas = 0
    let ativo = true
    const vez = window.setInterval(async () => {
      consultas++
      try {
        const r = await carregar()
        if (!ativo) return
        if (!r.buscando || consultas >= MAXIMO_DE_CONSULTAS) {
          window.clearInterval(vez)
          await gravar('resultado')
        }
      } catch {
        if (consultas >= MAXIMO_DE_CONSULTAS) window.clearInterval(vez)
      }
    }, INTERVALO_DA_BUSCA_MS)
    return () => {
      ativo = false
      window.clearInterval(vez)
    }
  }, [fase, carregar, gravar])

  // Nos matches, destaca a primeira licitação da lista (a página carrega sozinha, então tenta por alguns segundos).
  useEffect(() => {
    if (fase !== 'resultado' || pathname !== '/matches' || minimizada) return
    let marcado: Element | null = null
    let tentativas = 0
    const vez = window.setInterval(() => {
      tentativas++
      const link = document.querySelector('main li a[href^="/tenders/"]')
      const alvo = link?.closest('li') ?? null
      if (alvo || tentativas > 20) window.clearInterval(vez)
      if (!alvo) return
      marcado = alvo
      alvo.classList.add(CLASSE_DO_DESTAQUE)
      alvo.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 500)
    return () => {
      window.clearInterval(vez)
      marcado?.classList.remove(CLASSE_DO_DESTAQUE)
    }
  }, [fase, pathname, minimizada])

  if (!fase || !dados || avisoDeCookies) return null
  if (fase === 'etapa1Feita' && !terminou) return null
  if (fase === 'adiada' || fase === 'recusada') return null

  async function aceitar() {
    falando.current = true
    await gravar('oQueVende')
  }

  async function confirmarOQueVende(texto: string) {
    const limpo = texto.trim().replace(/\s+/g, ' ')
    if (limpo.length < 3) {
      setErro('Me conta com um pouco mais de detalhe. Exemplo: "material de limpeza".')
      return
    }
    setTermo(limpo)
    setEscrevendo(false)
    await gravar('onde', { termo: limpo })
  }

  async function ouvirOQueVende() {
    const ouvido = await escuta.alternar()
    if (ouvido) setTermo(ouvido)
  }

  async function procurar() {
    setOcupada(true)
    setErro(null)
    try {
      const doCadastro = itemDoCadastro && itemDoCadastro.name.toLocaleLowerCase('pt-BR') === termo.toLocaleLowerCase('pt-BR') ? itemDoCadastro : null
      if (doCadastro) {
        if (!mesmosEstados(doCadastro.ufs, ufs)) await api.patch(`/api/monitored-items/${doCadastro.id}`, { ufs })
        else await api.post(`/api/monitored-items/${doCadastro.id}/rematch`, {}).catch(() => undefined)
      } else {
        await api.post('/api/monitored-items', { name: nomeDoItem(termo), keywords: [termo], ufs })
      }
      await gravar('buscando', { termo, ufs })
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não consegui salvar agora. Tente de novo.')
    } finally {
      setOcupada(false)
    }
  }

  async function finalizar() {
    setTerminou(true)
    await gravar('etapa1Feita')
  }

  function alternarUf(uf: string) {
    setUfs((atual) => (atual.includes(uf) ? atual.filter((u) => u !== uf) : [...atual, uf].sort()))
  }

  if (minimizada) {
    return (
      <button
        type="button"
        onClick={() => setMinimizada(false)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-accent-line bg-surface py-1 pl-1 pr-4 text-sm font-semibold text-ink shadow-cartao-alto hover:bg-accent-soft"
      >
        <AvatarDaBela tamanho={36} />
        Continuar com a Bela
      </button>
    )
  }

  const matches = dados.matches
  const nosMatches = pathname === '/matches'

  return (
    <section
      aria-label="A Bela te acompanha"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[80dvh] flex-col gap-3 overflow-y-auto rounded-2xl border border-accent-line bg-surface p-4 shadow-cartao-alto sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <AvatarDaBela tamanho={44} className="ring-2 ring-accent-soft" />
        <p className="min-w-0 flex-1 text-sm text-ink">{textoDaFase}</p>
        {fase !== 'convite' && (
          <button type="button" onClick={() => setMinimizada(true)} aria-label="Minimizar a Bela" title="Minimizar" className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink">
            <Minus size={16} aria-hidden />
          </button>
        )}
      </div>

      {fase === 'convite' && (
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button variant="primary" iconRight={ArrowRight} onClick={aceitar} className="min-h-11">
            Sim, me leva
          </Button>
          <Button variant="secondary" onClick={() => gravar('adiada')} className="min-h-11">
            Agora não
          </Button>
          <button type="button" onClick={() => gravar('recusada')} className="min-h-11 text-sm text-muted underline underline-offset-[3px] hover:text-ink sm:mr-auto">
            Não precisa
          </button>
        </div>
      )}

      {fase === 'oQueVende' && itemDoCadastro && !escrevendo && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" icon={Check} onClick={() => confirmarOQueVende(itemDoCadastro.name)} className="min-h-11">
            Sim, é isso
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTermo('')
              setEscrevendo(true)
            }}
            className="min-h-11"
          >
            Dizer de outro jeito
          </Button>
        </div>
      )}

      {fase === 'oQueVende' && (!itemDoCadastro || escrevendo) && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void confirmarOQueVende(termo)
          }}
        >
          <div className="flex gap-2">
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: material de limpeza" aria-label="O que a sua empresa vende" maxLength={120} autoFocus className="min-w-0 flex-1" />
            {escuta.disponivel && (
              <Button type="button" variant={escuta.ouvindo ? 'danger' : 'secondary'} icon={escuta.ouvindo ? Square : Mic} onClick={ouvirOQueVende} aria-label={escuta.ouvindo ? 'Parar de ouvir' : 'Falar'} />
            )}
          </div>
          {escuta.ouvindo && <p className="text-xs text-muted">Estou ouvindo… {escuta.parcial}</p>}
          <FormError>{erro ?? escuta.erro}</FormError>
          <Button type="submit" variant="primary" iconRight={ArrowRight} className="min-h-11">
            Continuar
          </Button>
        </form>
      )}

      {fase === 'onde' && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setUfs([])}
            aria-pressed={ufs.length === 0}
            className={cx('min-h-10 rounded-lg border px-3 text-sm font-semibold', ufs.length === 0 ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink hover:bg-sunken')}
          >
            Brasil todo
          </button>
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Estados">
            {UFS.map((uf) => {
              const marcada = ufs.includes(uf)
              return (
                <button
                  key={uf}
                  type="button"
                  onClick={() => alternarUf(uf)}
                  aria-pressed={marcada}
                  className={cx('min-h-9 rounded-md border font-mono text-xs font-semibold', marcada ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-2 hover:bg-sunken')}
                >
                  {uf}
                </button>
              )
            })}
          </div>
          <FormError>{erro}</FormError>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button variant="primary" iconRight={ArrowRight} onClick={procurar} loading={ocupada} className="min-h-11">
              Procurar licitações
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEscrevendo(true)
                void gravar('oQueVende')
              }}
              className="min-h-11"
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {fase === 'buscando' && (
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Procurando licitações">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      )}

      {fase === 'resultado' && matches > 0 && !nosMatches && (
        <Button variant="primary" iconRight={ArrowRight} onClick={() => router.push('/matches')} className="min-h-11">
          Ver as licitações
        </Button>
      )}

      {fase === 'resultado' && matches > 0 && nosMatches && (
        <Button variant="primary" icon={Check} onClick={finalizar} className="min-h-11">
          Entendi
        </Button>
      )}

      {fase === 'resultado' && matches === 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            iconRight={ArrowRight}
            onClick={() => {
              router.push(linkDasAbertas(termo, []))
              void finalizar()
            }}
            className="min-h-11"
          >
            Ver licitações abertas
          </Button>
          <Button variant="secondary" onClick={finalizar} className="min-h-11">
            Agora não
          </Button>
        </div>
      )}

      {fase === 'etapa1Feita' && terminou && (
        <Button
          variant="secondary"
          icon={X}
          onClick={() => {
            fala.calar()
            setTerminou(false)
          }}
          className="min-h-11"
        >
          Fechar
        </Button>
      )}
    </section>
  )
}
