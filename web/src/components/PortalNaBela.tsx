'use client'

// "Portal dentro da Bela": o Compras.gov.br aberto num navegador da Bela e mostrado
// aqui, dentro do Pregão com a Bela. A pessoa usa o portal normalmente (clica, digita,
// entra com o gov.br, resolve o CAPTCHA); a Bela lê o melhor lance e o chat e, quando a
// pessoa pede, escreve o lance sugerido no campo. Quem envia o lance é sempre a pessoa.

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, Home, Lock, Monitor, PencilLine, RotateCw, X } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { getSessionToken } from '@/lib/session'
import type { RoboDoPregao } from '@/lib/types'
import { Button, Notice, Panel, StatusTag, TextLink } from '@/components/ui'

interface Config {
  disponivel: boolean
  url: string | null
  planoGratuito: boolean
}

type Estado = 'fechado' | 'conectando' | 'aberto'

type Recebida =
  | { t: 'pronto'; largura: number; altura: number }
  | { t: 'estado'; url: string; titulo: string; host: string; portal: string | null }
  | { t: 'leitura'; melhorLance: number | null; mensagensNovas: number }
  | { t: 'lance-preenchido'; ok: boolean; texto?: string; motivo?: string }
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

export default function PortalNaBela({ tenderId, robo, aoLer }: { tenderId: string; robo: RoboDoPregao; aoLer: () => void }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [estado, setEstado] = useState<Estado>('fechado')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tamanho, setTamanho] = useState({ largura: 1366, altura: 768 })
  const [pagina, setPagina] = useState<{ host: string; titulo: string; portal: string | null } | null>(null)
  const [melhorLance, setMelhorLance] = useState<number | null>(null)
  const [pedidoDeArquivo, setPedidoDeArquivo] = useState<{ multiplo: boolean } | null>(null)
  const [dialogo, setDialogo] = useState<{ tipo: string; mensagem: string; padrao: string } | null>(null)
  const [respostaDoDialogo, setRespostaDoDialogo] = useState('')
  const [preenchimento, setPreenchimento] = useState<{ ok: boolean; texto: string } | null>(null)
  const [focado, setFocado] = useState(false)

  const ws = useRef<WebSocket | null>(null)
  const tela = useRef<HTMLCanvasElement | null>(null)
  const area = useRef<HTMLDivElement | null>(null)
  const movimento = useRef<{ x: number; y: number } | null>(null)
  const aoLerRef = useRef(aoLer)
  aoLerRef.current = aoLer
  const atualizarPainel = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api
      .get<Config>('/api/portal-na-bela/config')
      .then(setConfig)
      .catch(() => setConfig({ disponivel: false, url: null, planoGratuito: false }))
  }, [])

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
          setEstado('aberto')
          setErro(null)
          break
        case 'estado':
          setPagina({ host: m.host, titulo: m.titulo, portal: m.portal })
          break
        case 'leitura':
          setMelhorLance(m.melhorLance)
          // O painel da Bela (sugestão, piso, chat) é recalculado na API: atualiza sem martelar.
          if (atualizarPainel.current) clearTimeout(atualizarPainel.current)
          atualizarPainel.current = setTimeout(() => aoLerRef.current(), 800)
          break
        case 'lance-preenchido':
          setPreenchimento({ ok: m.ok, texto: m.ok ? `Lance ${m.texto} escrito no campo. Confira e clique em enviar no portal.` : (m.motivo ?? 'Não deu para preencher.') })
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
    setEstado('conectando')
    const c = new WebSocket(`${config.url}/sessao`)
    c.binaryType = 'blob'
    ws.current = c
    c.onopen = () => c.send(JSON.stringify({ t: 'entrar', token, tenderId }))
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
  }, [config, tenderId, tratar, desenhar])

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

  const instrucao = robo.instrucoes.find((i) => i.acao === 'dar' && typeof i.valor === 'number')

  if (!config) return null

  if (estado === 'fechado') {
    return (
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Monitor size={16} aria-hidden /> Portal dentro da Bela
          </span>
        }
        description="Abra o Compras.gov.br aqui mesmo, ao lado do painel da Bela. Você entra com o seu gov.br e usa o portal normalmente; a Bela acompanha o lance e o chat."
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
          ) : (
            <>
              <ul className="ml-4 list-disc text-sm text-ink-2">
                <li>Quem entra no portal é você: digite o CPF, a senha e resolva o CAPTCHA na tela, como no seu computador.</li>
                <li>A Bela não guarda a sua senha nem a sessão: ao fechar, tudo é apagado.</li>
                <li>A Bela nunca envia lance sozinha. Com um clique, ela escreve o lance sugerido no campo; quem confere e envia é você.</li>
                <li>Certificado digital em token (A3) não funciona aqui: para ele, use a extensão.</li>
              </ul>
              <Button variant="primary" icon={Monitor} onClick={abrir} className="self-start">
                Abrir o Compras.gov.br aqui
              </Button>
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
          {estado === 'conectando' ? 'Abrindo o navegador da Bela…' : (pagina?.host ?? '…')}
        </span>
        {pagina?.portal && <StatusTag tone="accent">Bela lendo a disputa</StatusTag>}
        {melhorLance !== null && (
          <span className="text-xs text-ink-2">
            Melhor lance: <strong className="font-mono text-ink">{brl(melhorLance)}</strong>
          </span>
        )}
        {robo.disponivel && instrucao?.valor ? (
          <Button size="sm" variant="primary" icon={PencilLine} onClick={() => mandar({ t: 'preencher-lance', valor: instrucao.valor })} title="Escreve no campo de lance do portal. Quem envia é você.">
            Preencher {brl(instrucao.valor)}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" icon={X} onClick={fechar}>
          Fechar portal
        </Button>
      </div>

      {erro && <Notice tone="danger">{erro}</Notice>}
      {aviso && <Notice tone="info">{aviso}</Notice>}
      {preenchimento && <Notice tone={preenchimento.ok ? 'ok' : 'warn'}>{preenchimento.texto}</Notice>}
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
        Clique na tela para usar o teclado nela. Você está no portal oficial, num navegador da Bela; nada é guardado ao fechar. A Bela só lê a disputa e escreve o lance quando você pede.
      </p>
    </section>
  )
}
