'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, Check, PencilLine, Timer } from 'lucide-react'
import { Button, Checkbox, cx, Panel, StatusTag } from '@/components/ui'
import type { InstrucaoDoRobo } from '@/lib/types'
import {
  INTERVALO_FASE_FINAL_MS,
  INTERVALO_NORMAL_MS,
  limparQuemEstaNaFrente,
  proximoAviso,
  type AvisoDaVigia,
  type UltimoAviso,
} from '@/lib/vigiaDoLance'

const CHAVE_LIGADA = 'licita-bela:vigia-do-lance'
const TIQUE_MS = 5_000

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function lerLigada(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_LIGADA) !== 'desligada'
  } catch {
    return true
  }
}

function guardarLigada(ligada: boolean) {
  try {
    window.localStorage.setItem(CHAVE_LIGADA, ligada ? 'ligada' : 'desligada')
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
}

// Dois bipes curtos (mais agudos na fase final). Sem som disponível, segue sem som.
function tocar(urgente: boolean) {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Contexto) return
    const ctx = new Contexto()
    const frequencia = urgente ? 1175 : 880
    for (const [inicio, duracao] of [[0, 0.15], [0.22, 0.15]] as const) {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.frequency.value = frequencia
      ganho.gain.setValueAtTime(0.18, ctx.currentTime + inicio)
      ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao)
      osc.connect(ganho).connect(ctx.destination)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + duracao)
    }
    setTimeout(() => void ctx.close().catch(() => undefined), 800)
  } catch {
    /* sem som */
  }
}

export default function VigiaDoLance({
  instrucoes,
  faseFinalDoChat,
  encerrado,
  preencher,
  aoJaEnviei,
  dizer,
}: {
  instrucoes: InstrucaoDoRobo[]
  faseFinalDoChat: boolean
  encerrado: boolean
  /** Escreve o valor no campo do portal aberto dentro da Bela (null quando não dá). */
  preencher: ((valor: number, alvo: string) => void) | null
  /** Anota que você enviou esse lance no portal. */
  aoJaEnviei: (alvo: string, valor: number) => void
  dizer: (texto: string) => void
}) {
  const [ligada, setLigada] = useState(true)
  const [faseFinalManual, setFaseFinalManual] = useState(false)
  const [aviso, setAviso] = useState<(AvisoDaVigia & { em: number }) | null>(null)
  const ultimos = useRef<Record<string, UltimoAviso | undefined>>({})
  const instrucoesRef = useRef(instrucoes)
  instrucoesRef.current = instrucoes
  const faseFinal = faseFinalDoChat || faseFinalManual
  const faseFinalRef = useRef(faseFinal)
  faseFinalRef.current = faseFinal
  const dizerRef = useRef(dizer)
  dizerRef.current = dizer

  useEffect(() => setLigada(lerLigada()), [])

  const conferir = useCallback(() => {
    const atuais = instrucoesRef.current
    ultimos.current = limparQuemEstaNaFrente(atuais, ultimos.current)
    // Quem voltou à frente (ou mudou de sugestão) some do cartão.
    setAviso((a) => {
      if (!a) return a
      const ainda = atuais.find((i) => i.alvo === a.alvo)
      if (!ainda || ainda.acao === 'aguardar') return null
      return a
    })
    const agora = Date.now()
    const novo = proximoAviso({ instrucoes: atuais, ultimos: ultimos.current, agora, faseFinal: faseFinalRef.current })
    if (!novo) return
    ultimos.current = { ...ultimos.current, [novo.alvo]: { chave: novo.chave, em: agora } }
    setAviso({ ...novo, em: agora })
    tocar(faseFinalRef.current || novo.tipo === 'cobriram')
    try {
      navigator.vibrate?.(faseFinalRef.current ? [200, 100, 200, 100, 200] : [200, 100, 200])
    } catch {
      /* sem vibração */
    }
    dizerRef.current(novo.fala)
  }, [])

  // Sugestão nova (o painel foi recalculado): confere na hora.
  useEffect(() => {
    if (ligada && !encerrado) conferir()
  }, [instrucoes, ligada, encerrado, conferir])

  // Relógio: repete o aviso de quem continua atrás (1 min; 15 s na fase final).
  useEffect(() => {
    if (!ligada || encerrado) return
    const t = setInterval(conferir, TIQUE_MS)
    return () => clearInterval(t)
  }, [ligada, encerrado, conferir])

  // Título da aba pisca o aviso: a pessoa pode estar olhando o portal em outra aba.
  useEffect(() => {
    if (!aviso || aviso.tipo === 'travou') return
    const original = document.title
    const marca = aviso.tipo === 'cobriram' ? '⚠ Cobriram! ' : '⏱ Atrás! '
    document.title = `${marca}${original}`
    return () => {
      document.title = original
    }
  }, [aviso])

  if (encerrado) return null

  const atras = instrucoes.filter((i) => i.acao === 'dar' && i.valor !== null)
  const naFrente = instrucoes.length > 0 && atras.length === 0 && instrucoes.every((i) => i.acao === 'aguardar' && /frente/i.test(i.texto))
  const intervalo = (faseFinal ? INTERVALO_FASE_FINAL_MS : INTERVALO_NORMAL_MS) / 1000

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <BellRing size={16} aria-hidden /> Vigia do lance
        </span>
      }
      actions={
        ligada ? (
          faseFinal ? (
            <StatusTag tone="danger">Fase final · avisa a cada {intervalo} s</StatusTag>
          ) : (
            <StatusTag tone="accent">Ligada · avisa a cada {intervalo} s</StatusTag>
          )
        ) : (
          <StatusTag tone="neutral">Desligada</StatusTag>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">
          A Bela confere a disputa sem parar. Se cobrirem o seu lance, ela toca um alerta, fala a sugestão e repete enquanto você não voltar à frente. Ela não envia lance: quem confere e envia no portal é você.
        </p>

        {ligada && aviso && (
          <div
            role="alert"
            className={cx(
              'flex flex-col gap-3 rounded-xl border-2 p-4',
              aviso.tipo === 'travou' ? 'border-warn-line bg-warn-soft' : faseFinal ? 'border-danger-line bg-danger-soft' : 'border-accent bg-accent-soft',
            )}
          >
            <div className="flex flex-col gap-1">
              <p className="text-base font-extrabold text-ink">{aviso.titulo}</p>
              <p className="text-sm text-ink-2">{aviso.texto}</p>
            </div>
            {aviso.valor !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-2xl font-extrabold text-ink">{brl(aviso.valor)}</span>
                {preencher ? (
                  <Button variant="primary" icon={PencilLine} onClick={() => preencher(aviso.valor as number, aviso.alvo)} title="Escreve no campo de lance do portal. Quem envia é você.">
                    Escrever no portal
                  </Button>
                ) : (
                  <span className="text-xs text-muted">Portal em outra aba: use “Preencher” no ícone da Bela (extensão) ou digite o valor.</span>
                )}
                <Button
                  variant="secondary"
                  icon={Check}
                  onClick={() => {
                    aoJaEnviei(aviso.alvo, aviso.valor as number)
                    setAviso(null)
                  }}
                >
                  Já enviei esse lance
                </Button>
              </div>
            )}
          </div>
        )}

        {ligada && !aviso && naFrente && <p className="text-sm font-semibold text-ok">Você está na frente. A Bela avisa se cobrirem.</p>}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Checkbox
            label="Vigia ligada (alerta, voz e lembrete)"
            checked={ligada}
            onChange={(e) => {
              setLigada(e.target.checked)
              guardarLigada(e.target.checked)
              if (!e.target.checked) setAviso(null)
            }}
          />
          <Checkbox
            label={
              <span className="inline-flex items-center gap-1">
                <Timer size={14} aria-hidden /> Fase final (tempo aleatório): avisar a cada 15 s
              </span>
            }
            hint={faseFinalDoChat ? 'Ligada sozinha: o portal avisou que a etapa de lances vai fechar.' : 'Liga sozinha quando o chat avisar da iminência de encerramento.'}
            checked={faseFinal}
            disabled={faseFinalDoChat}
            onChange={(e) => setFaseFinalManual(e.target.checked)}
          />
        </div>
      </div>
    </Panel>
  )
}
