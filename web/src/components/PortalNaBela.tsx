'use client'

// "Portal dentro da Bela": o portal da licitação (Compras.gov.br, BLL, Licitanet e os
// outros de Meus Portais) aberto num navegador da Bela e mostrado aqui, dentro do Pregão
// com a Bela. A pessoa usa o portal normalmente (clica, digita, resolve o CAPTCHA). Quando
// ela pede, a Bela escreve o login salvo em Meus Portais no formulário e o lance sugerido
// no campo. Quem clica em "Entrar" e em enviar o lance é sempre a pessoa.
//
// Sem tenderId é o modo "conferir acesso" (Meus Portais): o portal vem fixo, a Bela não
// lê a disputa nem preenche lance; serve só para a pessoa conferir se o login funciona.

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Home, KeyRound, Lock, Monitor, PencilLine, RotateCw, X } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { getSessionToken } from '@/lib/session'
import { ehLoginDoGovBr } from '@/lib/loginDoGovBr'
import type { RoboDoPregao } from '@/lib/types'
import { Button, Field, Notice, Panel, Select, StatusTag, TextLink, buttonClasses } from '@/components/ui'

interface Config {
  disponivel: boolean
  url: string | null
  planoGratuito: boolean
  portais: { id: string; nome: string; temAcessoSalvo: boolean; abreAqui: boolean; endereco: string }[]
  portalSugerido: string | null
}

type Estado = 'fechado' | 'conectando' | 'aberto'

type Recebida =
  | { t: 'pronto'; largura: number; altura: number; portal: string; nomeDoPortal: string }
  | { t: 'estado'; url: string; titulo: string; host: string; portal: string | null; recusado?: number | null }
  | { t: 'leitura'; melhorLance: number | null; mensagensNovas: number }
  | { t: 'lance-preenchido'; ok: boolean; texto?: string; motivo?: string }
  | { t: 'login-preenchido'; ok: boolean; mensagem: string }
  | { t: 'pedido-de-arquivo'; multiplo: boolean }
  | { t: 'download'; nome: string; tipo: string; base64: string }
  | { t: 'dialogo'; tipo: string; mensagem: string; padrao: string }
  | { t: 'bloqueado'; url: string; motivo: string }
  | { t: 'aviso'; mensagem: string }
  | { t: 'erro'; codigo: string; mensagem: string }
  | { t: 'encerrada'; motivo: string }
  | { t: 'pong' }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Alt=1, Ctrl=2, Meta=4, Shift=8 (mesma convenção do Chrome DevTools).
function modificadores(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
}

const BOTOES = ['left', 'middle', 'right'] as const

function paraBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '')
    leitor.onerror = () => reject(leitor.error)
    leitor.readAsDataURL(arquivo)
  })
}

function baixar(nome: string, tipo: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// A extensão Bela marca a página do site quando está instalada (conteudo-app.mjs).
function versaoDaExtensao(): string | null {
  if (typeof document === 'undefined') return null
  return document.documentElement.dataset.belaExtensao ?? null
}

// Avisa a extensão qual licitação abrir e liga a leitura da disputa (ela ouve este evento).
function avisarExtensao(tenderId: string) {
  try {
    window.dispatchEvent(new CustomEvent('bela:abrir-portal', { detail: tenderId }))
  } catch {
    /* sem extensão: só abre a aba */
  }
}

export default function PortalNaBela({
  tenderId,
  robo,
  aoLer,
  portal: portalFixo,
  abrirJa = false,
  aoFechar,
  aoPoderPreencher,
  aoConfirmarMeuLance,
}: {
  /** Sem licitação: modo "conferir acesso" (Meus Portais). */
  tenderId?: string
  robo?: RoboDoPregao
  aoLer?: () => void
  /** Portal fixo (modo "conferir acesso"). */
  portal?: string
  /** Abre o portal assim que a configuração chega (quando liberado). */
  abrirJa?: boolean
  /** Modo "conferir acesso": some com o painel. */
  aoFechar?: () => void
  /** Avisa a página se dá para escrever o lance no portal aberto aqui (vigia do lance). */
  aoPoderPreencher?: (preencher: ((valor: number, alvo: string) => void) | null) => void
  /** O melhor lance lido é o valor que a Bela escreveu: a pessoa confirma que foi o dela. */
  aoConfirmarMeuLance?: (alvo: string, valor: number) => void
}) {
  const conferir = !tenderId
  const [config, setConfig] = useState<Config | null>(null)
  const [estado, setEstado] = useState<Estado>('fechado')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tamanho, setTamanho] = useState({ largura: 1366, altura: 768 })
  const [pagina, setPagina] = useState<{ url: string; host: string; titulo: string; portal: string | null; recusado: number | null } | null>(null)
  const [melhorLance, setMelhorLance] = useState<number | null>(null)
  const [pedidoDeArquivo, setPedidoDeArquivo] = useState<{ multiplo: boolean } | null>(null)
  const [dialogo, setDialogo] = useState<{ tipo: string; mensagem: string; padrao: string } | null>(null)
  const [respostaDoDialogo, setRespostaDoDialogo] = useState('')
  const [preenchimento, setPreenchimento] = useState<{ ok: boolean; texto: string } | null>(null)
  const [focado, setFocado] = useState(false)
  const [escolhido, setEscolhido] = useState(portalFixo ?? 'COMPRASNET')
  const [nomeAberto, setNomeAberto] = useState<string | null>(null)
  const [login, setLogin] = useState<{ ok: boolean; mensagem: string } | null>(null)
  const [extensao, setExtensao] = useState<string | null>(null)
  // Último valor escrito no campo: se ele virar o melhor lance, provavelmente foi você que enviou.
  const ultimoPreenchido = useRef<{ valor: number; alvo: string } | null>(null)
  const [foiMeu, setFoiMeu] = useState<{ valor: number; alvo: string } | null>(null)

  // A extensão marca a página logo depois de carregar: confere algumas vezes.
  useEffect(() => {
    let vezes = 0
    const conferir = () => {
      const v = versaoDaExtensao()
      setExtensao(v)
      vezes += 1
      if (v || vezes >= 10) clearInterval(t)
    }
    const t = setInterval(conferir, 1000)
    conferir()
    return () => clearInterval(t)
  }, [])

  const ws = useRef<WebSocket | null>(null)
  const tela = useRef<HTMLCanvasElement | null>(null)
  const area = useRef<HTMLDivElement | null>(null)
  const movimento = useRef<{ x: number; y: number } | null>(null)
  const aoLerRef = useRef(aoLer)
  aoLerRef.current = aoLer
  const atualizarPainel = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api
      .get<Config>(tenderId ? `/api/portal-na-bela/config?tenderId=${encodeURIComponent(tenderId)}` : '/api/portal-na-bela/config')
      .then((c) => {
        setConfig(c)
        if (c.portalSugerido && tenderId) setEscolhido(c.portalSugerido)
      })
      .catch(() => setConfig({ disponivel: false, url: null, planoGratuito: false, portais: [], portalSugerido: null }))
  }, [tenderId])

  const mandar = useCallback((m: Record<string, unknown>) => {
    const c = ws.current
    if (c && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(m))
  }, [])

  const desenhar = useCallback(async (dados: Blob) => {
    const canvas = tela.current
    if (!canvas) return
    try {
      const imagem = await createImageBitmap(dados)
      if (canvas.width !== imagem.width || canvas.height !== imagem.height) {
        canvas.width = imagem.width
        canvas.height = imagem.height
      }
      canvas.getContext('2d')?.drawImage(imagem, 0, 0)
      imagem.close()
    } catch {
      /* quadro incompleto */
    }
  }, [])

  const tratar = useCallback(
    (m: Recebida) => {
      switch (m.t) {
        case 'pronto':
          setTamanho({ largura: m.largura, altura: m.altura })
          setNomeAberto(m.nomeDoPortal)
          setEstado('aberto')
          setErro(null)
          break
        case 'estado':
          setPagina({ url: m.url, host: m.host, titulo: m.titulo, portal: m.portal, recusado: m.recusado ?? null })
          break
        case 'leitura':
          setMelhorLance(m.melhorLance)
          if (ultimoPreenchido.current && m.melhorLance !== null && Math.abs(m.melhorLance - ultimoPreenchido.current.valor) < 0.005) {
            setFoiMeu(ultimoPreenchido.current)
            ultimoPreenchido.current = null
          }
          // O painel da Bela (sugestão, piso, chat) é recalculado na API: atualiza sem martelar.
          if (atualizarPainel.current) clearTimeout(atualizarPainel.current)
          atualizarPainel.current = setTimeout(() => aoLerRef.current?.(), 800)
          break
        case 'lance-preenchido':
          setPreenchimento({ ok: m.ok, texto: m.ok ? `Lance ${m.texto} escrito no campo. Confira e clique em enviar no portal.` : (m.motivo ?? 'Não deu para preencher.') })
          break
        case 'login-preenchido':
          setLogin({ ok: m.ok, mensagem: m.mensagem })
          break
        case 'pedido-de-arquivo':
          setPedidoDeArquivo({ multiplo: m.multiplo })
          break
        case 'download':
          baixar(m.nome, m.tipo, m.base64)
          setAviso(`Arquivo baixado: ${m.nome}`)
          break
        case 'dialogo':
          setDialogo({ tipo: m.tipo, mensagem: m.mensagem, padrao: m.padrao })
          setRespostaDoDialogo(m.padrao)
          break
        case 'bloqueado':
        case 'aviso':
          setAviso(m.t === 'bloqueado' ? m.motivo : m.mensagem)
          break
        case 'erro':
          setErro(m.mensagem)
          break
        case 'encerrada':
          setAviso(m.motivo)
          break
      }
    },
    []
  )

  const abrir = useCallback(() => {
    if (!config?.url) return
    const token = getSessionToken()
    if (!token) {
      setErro('Entre na Bela de novo para abrir o portal.')
      return
    }
    setErro(null)
    setAviso(null)
    setLogin(null)
    setEstado('conectando')
    const c = new WebSocket(`${config.url}/sessao`)
    c.binaryType = 'blob'
    ws.current = c
    c.onopen = () => c.send(JSON.stringify({ t: 'entrar', token, ...(tenderId ? { tenderId } : {}), portal: escolhido }))
    c.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          tratar(JSON.parse(ev.data) as Recebida)
        } catch {
          /* mensagem inválida */
        }
      } else void desenhar(ev.data as Blob)
    }
    c.onclose = () => {
      if (ws.current === c) ws.current = null
      setEstado('fechado')
      setPedidoDeArquivo(null)
      setDialogo(null)
    }
    c.onerror = () => setErro('Não consegui conectar ao navegador da Bela. Tente de novo em instantes.')
  }, [config, tenderId, escolhido, tratar, desenhar])

  // Modo "conferir acesso": a pessoa já escolheu abrir na linha do portal.
  const abriuSozinho = useRef(false)
  useEffect(() => {
    if (!abrirJa || abriuSozinho.current || !config?.disponivel || config.planoGratuito) return
    if (config.portais.find((p) => p.id === escolhido)?.abreAqui === false) return
    abriuSozinho.current = true
    abrir()
  }, [abrirJa, config, escolhido, abrir])

  // Mantém a conexão viva e fecha ao sair da página (a sessão espera 2 minutos por uma reconexão).
  useEffect(() => {
    if (estado !== 'aberto') return
    const t = setInterval(() => mandar({ t: 'ping' }), 25_000)
    return () => clearInterval(t)
  }, [estado, mandar])
  useEffect(() => () => ws.current?.close(), [])

  // Rolagem: precisa de listener não passivo para não rolar a página da Bela junto.
  useEffect(() => {
    const el = area.current
    if (!el || estado !== 'aberto') return
    const rolar = (e: WheelEvent) => {
      e.preventDefault()
      const p = ponto(e.clientX, e.clientY)
      if (p) mandar({ t: 'rolar', ...p, dx: e.deltaX, dy: e.deltaY })
    }
    el.addEventListener('wheel', rolar, { passive: false })
    return () => el.removeEventListener('wheel', rolar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, mandar, tamanho])

  function ponto(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = tela.current
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    const x = ((clientX - r.left) / r.width) * tamanho.largura
    const y = ((clientY - r.top) / r.height) * tamanho.altura
    if (x < 0 || y < 0 || x > tamanho.largura || y > tamanho.altura) return null
    return { x: Math.round(x), y: Math.round(y) }
  }

  function mouse(tipo: 'descer' | 'subir', e: MouseEvent) {
    const p = ponto(e.clientX, e.clientY)
    if (!p) return
    area.current?.focus()
    mandar({ t: 'mouse', tipo, ...p, botao: BOTOES[e.button] ?? 'left', cliques: Math.min(3, Math.max(1, e.detail || 1)) })
  }

  function mover(e: MouseEvent) {
    const p = ponto(e.clientX, e.clientY)
    if (!p) return
    // No máximo um movimento por quadro de tela.
    if (movimento.current) {
      movimento.current = p
      return
    }
    movimento.current = p
    requestAnimationFrame(() => {
      if (movimento.current) mandar({ t: 'mouse', tipo: 'mover', ...movimento.current })
      movimento.current = null
    })
  }

  function tecla(tipo: 'descer' | 'subir', e: KeyboardEvent) {
    // Colar: deixa o navegador disparar o "paste" (tratado abaixo).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return
    e.preventDefault()
    if (e.key === 'Dead' || e.key === 'Unidentified' || e.key === 'Process') return
    mandar({ t: 'tecla', tipo, tecla: e.key, modificadores: modificadores(e) })
  }

  async function enviarArquivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = [...(e.target.files ?? [])].slice(0, 10)
    if (lista.reduce((s, a) => s + a.size, 0) > 20 * 1024 * 1024) {
      setAviso('Arquivo grande demais (máximo 20 MB).')
      return
    }
    const arquivos = await Promise.all(lista.map(async (a) => ({ nome: a.name, tipo: a.type || 'application/octet-stream', base64: await paraBase64(a) })))
    mandar({ t: 'arquivos', arquivos })
    setPedidoDeArquivo(null)
  }

  function fechar() {
    mandar({ t: 'encerrar' })
    ws.current?.close()
  }

  function fecharTudo() {
    fechar()
    aoFechar?.()
  }

  const instrucao = robo?.instrucoes.find((i) => i.acao === 'dar' && typeof i.valor === 'number')

  const preencherLance = useCallback(
    (valor: number, alvo: string) => {
      ultimoPreenchido.current = { valor, alvo }
      setFoiMeu(null)
      mandar({ t: 'preencher-lance', valor })
    },
    [mandar],
  )

  const podePreencher = !conferir && estado === 'aberto' && robo?.disponivel === true
  const aoPoderPreencherRef = useRef(aoPoderPreencher)
  aoPoderPreencherRef.current = aoPoderPreencher
  useEffect(() => {
    aoPoderPreencherRef.current?.(podePreencher ? preencherLance : null)
  }, [podePreencher, preencherLance])
  useEffect(() => () => aoPoderPreencherRef.current?.(null), [])

  if (!config) return null
  const portalEscolhido = config.portais.find((p) => p.id === escolhido)
  const nomeEscolhido = portalEscolhido?.nome ?? 'o portal'

  if (estado === 'fechado' && conferir) {
    return (
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Monitor size={16} aria-hidden /> {nomeEscolhido} dentro da Bela
          </span>
        }
        description="Confira se o seu login funciona. Nada fica guardado ao fechar."
        actions={
          aoFechar ? (
            <Button size="sm" variant="ghost" icon={X} onClick={aoFechar}>
              Fechar
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {erro && <Notice tone="danger">{erro}</Notice>}
          {aviso && <Notice tone="info">{aviso}</Notice>}
          {!config.disponivel ? (
            <Notice tone="info">O portal dentro da Bela ainda não foi ativado nesta instalação. Enquanto isso, use a extensão Bela na disputa.</Notice>
          ) : config.planoGratuito ? (
            <Notice tone="info">
              O portal dentro da Bela é liberado nos planos pagos. <TextLink href="/conta">Ver planos</TextLink>
            </Notice>
          ) : portalEscolhido && !portalEscolhido.abreAqui ? (
            <>
              <Notice tone="info">Este portal não aceita o navegador da Bela. Abra no seu Chrome.</Notice>
              <a href={portalEscolhido.endereco} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary', 'md', 'self-start')}>
                <ExternalLink size={16} aria-hidden /> Abrir no Chrome
              </a>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                Na tela de login, o botão &quot;Preencher meu login&quot; escreve o usuário e a senha salvos aqui. A senha vai direto para o navegador da Bela e não aparece nesta página. O CAPTCHA e o clique em Entrar são seus.
              </p>
              <Button variant="primary" icon={Monitor} onClick={abrir} className="self-start">
                Abrir o {nomeEscolhido} aqui
              </Button>
            </>
          )}
        </div>
      </Panel>
    )
  }

  if (estado === 'fechado') {
    return (
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Monitor size={16} aria-hidden /> Portal dentro da Bela
          </span>
        }
        description="Abra o portal da licitação aqui mesmo, ao lado do painel da Bela."
      >
        <div className="flex flex-col gap-3">
          <ComoFunciona />
          {erro && <Notice tone="danger">{erro}</Notice>}
          {aviso && <Notice tone="info">{aviso}</Notice>}
          {!config.disponivel ? (
            <Notice tone="info">O portal dentro da Bela ainda não foi ativado nesta instalação. Enquanto isso, use a extensão Bela na disputa.</Notice>
          ) : config.planoGratuito ? (
            <Notice tone="info">
              O portal dentro da Bela é liberado nos planos pagos. <TextLink href="/conta">Ver planos</TextLink>
            </Notice>
          ) : (
            <>
              {config.portais.length > 0 && (
                <Field label="Portal" hint={config.portalSugerido ? 'Já escolhemos o portal desta licitação. Troque se ela for em outro.' : 'Escolha o portal em que esta licitação acontece.'}>
                  <Select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className="max-w-sm">
                    {config.portais.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.temAcessoSalvo ? ' (login salvo)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {portalEscolhido && !portalEscolhido.abreAqui ? (
                <>
                  <Notice tone="info" title={`O ${portalEscolhido.nome} abre no seu Chrome, com a Bela do lado`}>
                    Este portal bloqueia navegador automático, então ele não abre dentro desta página. Ele abre numa aba normal do seu Chrome e a extensão Bela trabalha lá: lê o melhor lance e o chat do pregoeiro e escreve o lance sugerido no campo. Quem confere e envia é você.
                  </Notice>
                  {extensao ? (
                    <p className="text-sm text-ink-2">
                      Extensão Bela instalada neste Chrome (versão {extensao}). Depois de abrir, clique no ícone da Bela na barra do Chrome para ver o painel ao lado do portal. O Chrome pode guardar e preencher o seu login do portal.
                    </p>
                  ) : (
                    <Notice tone="warn" title="A extensão Bela não está neste Chrome">
                      Sem ela, o portal abre normalmente, mas a Bela não lê a disputa nem preenche o lance. Peça a instalação da extensão ao suporte da Bela.
                    </Notice>
                  )}
                  <a
                    href={portalEscolhido.endereco}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => tenderId && avisarExtensao(tenderId)}
                    className={buttonClasses('primary', 'md', 'self-start')}
                  >
                    <ExternalLink size={16} aria-hidden /> Abrir o {portalEscolhido.nome} com a Bela
                  </a>
                </>
              ) : (
                <>
                {portalEscolhido && !portalEscolhido.temAcessoSalvo && (
                  <Notice tone="info">
                    Salve o login e a senha do {portalEscolhido.nome} em <TextLink href="/portais">Meus Portais</TextLink> para a Bela preencher o login para você. Sem isso, você digita na tela.
                  </Notice>
                )}
                <ul className="ml-4 list-disc text-sm text-ink-2">
                  <li>Na tela de login, o botão &quot;Preencher meu login&quot; escreve o usuário e a senha de Meus Portais. A senha vai direto para o navegador da Bela, não aparece nesta página e nada fica guardado ao fechar.</li>
                  <li>Certificado digital em token (A3) não funciona aqui: para ele, use a extensão.</li>
                  {escolhido === 'COMPRASNET' && (
                    <li>No login do gov.br, entre pelo <strong>QR code</strong> do app gov.br (ou pelo seu banco): o CAPTCHA do gov.br costuma recusar o navegador da Bela.</li>
                  )}
                </ul>
                <Button variant="primary" icon={Monitor} onClick={abrir} className="self-start">
                  Abrir o {nomeEscolhido} aqui
                </Button>
                </>
              )}
            </>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <section aria-label="Portal dentro da Bela" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" icon={ArrowLeft} aria-label="Voltar" onClick={() => mandar({ t: 'navegar', acao: 'voltar' })} />
        <Button size="sm" variant="ghost" icon={ArrowRight} aria-label="Avançar" onClick={() => mandar({ t: 'navegar', acao: 'avancar' })} />
        <Button size="sm" variant="ghost" icon={RotateCw} aria-label="Recarregar" onClick={() => mandar({ t: 'navegar', acao: 'recarregar' })} />
        <Button size="sm" variant="ghost" icon={Home} aria-label="Início do portal" onClick={() => mandar({ t: 'navegar', acao: 'inicio' })} />
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate rounded border border-line bg-sunken px-2 py-1 font-mono text-xs text-ink-2" title={pagina?.titulo}>
          <Lock size={12} aria-hidden className="shrink-0" />
          {estado === 'conectando' ? `Abrindo o ${nomeEscolhido}…` : (pagina?.host ?? nomeAberto ?? '…')}
        </span>
        {!conferir && pagina?.portal && <StatusTag tone="accent">Bela lendo a disputa</StatusTag>}
        <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => mandar({ t: 'preencher-login' })} title="Escreve o usuário e a senha de Meus Portais na tela de login. Quem clica em Entrar é você.">
          Preencher meu login
        </Button>
        {melhorLance !== null && (
          <span className="text-xs text-ink-2">
            Melhor lance: <strong className="font-mono text-ink">{brl(melhorLance)}</strong>
          </span>
        )}
        {!conferir && robo?.disponivel && instrucao?.valor ? (
          <Button size="sm" variant="primary" icon={PencilLine} onClick={() => preencherLance(instrucao.valor as number, instrucao.alvo)} title="Escreve no campo de lance do portal. Quem envia é você.">
            Preencher {brl(instrucao.valor)}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" icon={X} onClick={conferir ? fecharTudo : fechar}>
          Fechar portal
        </Button>
      </div>

      {conferir ? (
        <p className="rounded border border-accent-line bg-accent-soft px-3 py-2 text-sm text-ink">
          Entre com o seu login para conferir o acesso. O CAPTCHA e o clique em Entrar são seus.
        </p>
      ) : (
        <EtapaAtual lendo={!!pagina?.portal} />
      )}
      {erro && <Notice tone="danger">{erro}</Notice>}
      {pagina?.recusado && conferir && (
        <Notice tone="warn" title={`O ${nomeAberto ?? 'portal'} não aceitou o navegador da Bela`}>
          <p>Este portal bloqueia o acesso por aqui (erro {pagina.recusado}). Confira o seu login numa aba normal do Chrome.</p>
          {(portalEscolhido?.endereco || /^https:\/\//i.test(pagina.url)) && (
            <a
              href={portalEscolhido?.endereco || pagina.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={fecharTudo}
              className={buttonClasses('primary', 'sm', 'mt-2 self-start')}
            >
              <ExternalLink size={14} aria-hidden /> Abrir no Chrome
            </a>
          )}
        </Notice>
      )}
      {pagina?.recusado && !conferir && (
        <Notice tone="warn" title={`O ${nomeAberto ?? 'portal'} não aceitou o navegador da Bela`}>
          <p>Este portal bloqueia o acesso por aqui (erro {pagina.recusado}). Faça assim:</p>
          <ol className="ml-4 list-decimal">
            {!extensao && <li>Instale a extensão Bela no seu Chrome (peça ao suporte da Bela).</li>}
            <li>Clique no botão abaixo: o portal abre numa aba nova do Chrome.</li>
            <li>Entre no portal com o seu login, como sempre.</li>
            <li>Clique no ícone da Bela na barra do Chrome: o painel abre ao lado, lendo a disputa e sugerindo o lance.</li>
          </ol>
          {(portalEscolhido?.endereco || /^https:\/\//i.test(pagina.url)) && (
            <a
              href={portalEscolhido?.endereco || pagina.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (tenderId) avisarExtensao(tenderId)
                fechar()
              }}
              className={buttonClasses('primary', 'sm', 'mt-2 self-start')}
            >
              <ExternalLink size={14} aria-hidden /> Abrir o {nomeAberto ?? nomeEscolhido} no Chrome com a Bela
            </a>
          )}
        </Notice>
      )}
      {pagina && !pagina.recusado && ehLoginDoGovBr(pagina.host) && (
        <Notice tone="warn" title="Login do gov.br: entre pelo QR code">
          <p>
            O CAPTCHA do gov.br costuma recusar o navegador da Bela, mesmo com as imagens certas (a tela fica girando). Para entrar sem CAPTCHA:
          </p>
          <ol className="ml-4 list-decimal">
            <li>Na tela do gov.br aqui embaixo, clique em <strong>Login com QR code</strong>.</li>
            <li>No celular, abra o app <strong>gov.br</strong>, toque no ícone de QR code e aponte para a tela.</li>
          </ol>
          <p className="mt-1">Também funciona o <strong>Login com seu banco</strong>. Sem o app? Abra o portal no seu Chrome{conferir ? '' : ', com a extensão Bela'}.</p>
          {(portalEscolhido?.endereco || /^https:\/\//i.test(pagina.url)) && (
            <a
              href={portalEscolhido?.endereco || pagina.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (conferir) {
                  fecharTudo()
                  return
                }
                if (tenderId) avisarExtensao(tenderId)
                fechar()
              }}
              className={buttonClasses('secondary', 'sm', 'mt-2 self-start')}
            >
              <ExternalLink size={14} aria-hidden /> Abrir no meu Chrome
            </a>
          )}
        </Notice>
      )}
      {aviso && <Notice tone="info">{aviso}</Notice>}
      {login && <Notice tone={login.ok ? 'ok' : 'warn'}>{login.mensagem}</Notice>}
      {preenchimento && <Notice tone={preenchimento.ok ? 'ok' : 'warn'}>{preenchimento.texto}</Notice>}
      {foiMeu && aoConfirmarMeuLance && (
        <Notice
          tone="ok"
          title={`O melhor lance agora é ${brl(foiMeu.valor)}, o valor que a Bela escreveu`}
          action={
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  aoConfirmarMeuLance(foiMeu.alvo, foiMeu.valor)
                  setFoiMeu(null)
                }}
              >
                Sim, foi o meu
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFoiMeu(null)}>
                Não
              </Button>
            </span>
          }
        >
          Foi o seu lance? Confirmando, a Bela sabe que você está na frente e só avisa se cobrirem.
        </Notice>
      )}
      {pedidoDeArquivo && (
        <Notice tone="warn" title="O portal pediu um arquivo">
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" multiple={pedidoDeArquivo.multiplo} onChange={(e) => void enviarArquivos(e)} className="text-sm" aria-label="Escolher arquivo para o portal" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                mandar({ t: 'arquivos', arquivos: [] })
                setPedidoDeArquivo(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </Notice>
      )}
      {dialogo && (
        <Notice tone="warn" title="Mensagem do portal">
          <p className="whitespace-pre-wrap">{dialogo.mensagem}</p>
          {dialogo.tipo === 'prompt' && (
            <input value={respostaDoDialogo} onChange={(e) => setRespostaDoDialogo(e.target.value)} className="mt-2 w-full rounded border border-line px-2 py-1 text-sm" aria-label="Resposta" />
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                mandar({ t: 'dialogo', aceitar: true, texto: respostaDoDialogo })
                setDialogo(null)
              }}
            >
              OK
            </Button>
            {dialogo.tipo !== 'alert' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  mandar({ t: 'dialogo', aceitar: false })
                  setDialogo(null)
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </Notice>
      )}

      <div
        ref={area}
        tabIndex={0}
        role="application"
        aria-label="Tela do portal. Clique para usar o teclado aqui."
        onMouseDown={(e) => mouse('descer', e)}
        onMouseUp={(e) => mouse('subir', e)}
        onMouseMove={mover}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => tecla('descer', e)}
        onKeyUp={(e) => tecla('subir', e)}
        onPaste={(e) => {
          const texto = e.clipboardData.getData('text')
          if (texto) mandar({ t: 'texto', texto: texto.slice(0, 5000) })
          e.preventDefault()
        }}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        className={`relative w-full overflow-hidden rounded border bg-sunken outline-none ${focado ? 'border-accent ring-2 ring-accent-soft' : 'border-line'}`}
        style={{ aspectRatio: `${tamanho.largura} / ${tamanho.altura}` }}
      >
        <canvas ref={tela} className="block h-full w-full cursor-default select-none" />
        {estado === 'conectando' && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Abrindo o portal…</p>}
      </div>
      <p className="text-2xs text-muted">
        Clique na tela para usar o teclado nela. Você está no portal oficial, num navegador da Bela; nada é guardado ao fechar.{' '}
        {conferir ? 'Aqui a Bela não lê disputa nem preenche lance.' : 'A Bela só lê a disputa e escreve o lance quando você pede.'}
      </p>
    </section>
  )
}

// Passo a passo mostrado antes de abrir: deixa claro o que é da pessoa e o que é da Bela.
// A Bela não é robô de lance: não faz login sozinha, não resolve CAPTCHA e não envia lance.
const PASSOS = [
  { titulo: 'A Bela avisa', texto: 'Você recebe o aviso do dia e da hora da sessão no painel, no e-mail e no celular.' },
  { titulo: 'Você entra no portal', texto: 'Abra o portal aqui. O login, o CAPTCHA e o clique em Entrar são seus, com o seu acesso.' },
  { titulo: 'A Bela acompanha a disputa', texto: 'Ela lê o melhor lance e o chat do pregoeiro, calcula o lance pelo seu piso e escreve o valor no campo quando você pede.' },
  { titulo: 'Você envia o lance', texto: 'Confira o valor e clique em enviar no portal. A Bela nunca envia lance sozinha.' },
]

function ComoFunciona() {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-2 rounded-lg border border-line bg-sunken p-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
            <span className="min-w-0">
              <strong className="block text-ink">{p.titulo}</strong>
              <span className="text-ink-2">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      <Notice tone="ok" title="Sua empresa não corre risco de bloqueio por robô">
        A Bela não é robô de lance: ela não entra no portal sozinha, não burla o CAPTCHA e não clica em enviar. Você usa o portal oficial com o seu acesso, como sempre, e a Bela ajuda ao lado. Isso também respeita os editais que proíbem lances automáticos.
      </Notice>
    </div>
  )
}

// Na tela aberta: em que etapa a pessoa está.
function EtapaAtual({ lendo }: { lendo: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-accent-line bg-accent-soft px-3 py-2 text-sm text-ink">
      {lendo ? (
        <>
          <strong>Etapa 3 de 4:</strong> a Bela está acompanhando a disputa. Quando quiser, use &quot;Preencher&quot; e depois envie o lance no portal.
        </>
      ) : (
        <>
          <strong>Etapa 2 de 4:</strong> entre no portal com o seu login. O CAPTCHA e o clique em Entrar são seus; a Bela assume a leitura da disputa depois que você entrar.
        </>
      )}
    </p>
  )
}
