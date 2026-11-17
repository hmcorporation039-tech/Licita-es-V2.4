'use client'

// Recado da Bela no painel: saudação e resumo do dia (novas, sessões de hoje/amanhã,
// documentos vencidos). Aparece aberto uma vez por dia; depois de fechado vira um botão.
// A voz só toca quando a pessoa clica em "Ouvir a Bela" (o navegador bloqueia áudio sozinho).

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, FileWarning, Inbox, Square, Volume2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { calar, falaDisponivel, falar } from '@/lib/bela'
import { cx } from '@/components/ui'

type TipoDoItem = 'urgente' | 'sessao' | 'documento' | 'novas'

export interface ResumoDaBela {
  dia: string
  saudacao: string
  itens: Array<{ tipo: TipoDoItem; texto: string; href: string }>
  fala: string
}

const CHAVE = 'licita-bela:recado-fechado-em'

const ICONE = { urgente: AlertTriangle, sessao: CalendarClock, documento: FileWarning, novas: Inbox }
const ESTILO: Record<TipoDoItem, string> = {
  urgente: 'border-danger-line bg-danger-soft text-ink',
  sessao: 'border-accent-line bg-accent-soft text-ink',
  documento: 'border-warn-line bg-warn-soft text-ink',
  novas: 'border-line bg-surface text-ink',
}

function lerFechadoEm(): string | null {
  try {
    return window.localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

function guardarFechadoEm(dia: string) {
  try {
    window.localStorage.setItem(CHAVE, dia)
  } catch {}
}

export default function RecadoDaBela() {
  const [resumo, setResumo] = useState<ResumoDaBela | null>(null)
  const [aberto, setAberto] = useState(false)
  const [falando, setFalando] = useState(false)
  const [temVoz, setTemVoz] = useState(false)

  useEffect(() => {
    setTemVoz(falaDisponivel())
    let ativo = true
    api
      .get<ResumoDaBela>('/api/dashboard/resumo-da-bela')
      .then((r) => {
        if (!ativo) return
        setResumo(r)
        // Aviso urgente sempre abre; o resto, uma vez por dia.
        setAberto(lerFechadoEm() !== r.dia || r.itens.some((i) => i.tipo === 'urgente'))
      })
      .catch(() => undefined)
    return () => {
      ativo = false
      calar()
    }
  }, [])

  if (!resumo) return null

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 self-start rounded-full border border-accent-line bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent"
      >
        <Image src="/bela/v2/bela-640.webp" alt="" width={24} height={23} className="h-6 w-6 rounded-full object-cover object-top" />
        Recado da Bela de hoje
      </button>
    )
  }

  function alternarVoz() {
    if (!resumo) return
    if (falando) {
      calar()
      setFalando(false)
      return
    }
    falar(resumo.fala)
    setFalando(true)
    // A síntese de voz não avisa de forma confiável quando termina em todos os navegadores.
    window.setTimeout(() => setFalando(false), Math.min(60_000, resumo.fala.length * 70))
  }

  function fechar() {
    if (!resumo) return
    calar()
    setFalando(false)
    guardarFechadoEm(resumo.dia)
    setAberto(false)
  }

  return (
    <section aria-label="Recado da Bela" className="relative flex gap-4 rounded-2xl border border-accent-line bg-surface p-4 shadow-sm sm:p-5">
      <Image
        src="/bela/v2/bela-640.webp"
        alt="Bela, a assistente da Licita Bela"
        width={640}
        height={605}
        sizes="96px"
        className="hidden h-24 w-24 shrink-0 rounded-2xl bg-accent-soft object-cover object-top sm:block"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-bold text-ink">
            {resumo.saudacao} <span className="font-normal text-muted">Aqui está o seu dia.</span>
          </p>
          <button type="button" onClick={fechar} aria-label="Fechar o recado da Bela" className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {resumo.itens.map((item, i) => {
            const Icone = ICONE[item.tipo]
            return (
              <li key={i}>
                <Link href={item.href} className={cx('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm hover:border-accent', ESTILO[item.tipo])}>
                  <Icone size={16} className={cx('mt-0.5 shrink-0', item.tipo === 'urgente' ? 'text-danger' : item.tipo === 'documento' ? 'text-warn' : 'text-accent')} aria-hidden />
                  <span className={item.tipo === 'urgente' ? 'font-semibold' : undefined}>{item.texto}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        {temVoz && (
          <button
            type="button"
            onClick={alternarVoz}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {falando ? <Square size={14} aria-hidden /> : <Volume2 size={16} aria-hidden />}
            {falando ? 'Parar' : 'Ouvir a Bela'}
          </button>
        )}
      </div>
    </section>
  )
}
