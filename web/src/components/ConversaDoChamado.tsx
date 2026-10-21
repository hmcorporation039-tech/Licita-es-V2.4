'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { formatarData } from '@/lib/datas'
import { Button, Checkbox, FormError, Textarea, cx } from '@/components/ui'

export interface MensagemDoChamado {
  id: string
  autor: 'CLIENTE' | 'SUPORTE'
  texto: string
  createdAt: string
  nome: string | null
}

export function ListaDeMensagens({ relato, autorDoRelato, abertoEm, mensagens, ladoDoSuporte }: { relato: string; autorDoRelato: string | null; abertoEm: string; mensagens: MensagemDoChamado[]; ladoDoSuporte: boolean }) {
  const todas: MensagemDoChamado[] = [{ id: 'relato', autor: 'CLIENTE', texto: relato, createdAt: abertoEm, nome: autorDoRelato }, ...mensagens]
  return (
    <ul className="flex flex-col gap-4">
      {todas.map((m) => {
        const minha = ladoDoSuporte ? m.autor === 'SUPORTE' : m.autor === 'CLIENTE'
        return (
          <li key={m.id} className={cx('flex flex-col gap-1 sm:max-w-[85%]', minha ? 'self-end items-end' : 'self-start')}>
            <span className="text-xs text-muted">
              {m.autor === 'SUPORTE' ? 'Suporte Licita Bela' : (m.nome ?? 'Cliente')} · {formatarData(m.createdAt, { comHora: true })}
            </span>
            <p className={cx('whitespace-pre-line break-words rounded-lg px-3 py-2 text-sm text-ink', minha ? 'bg-accent-soft' : 'border border-line bg-surface')}>{m.texto}</p>
          </li>
        )
      })}
    </ul>
  )
}

export function ResponderChamado({ onEnviar, rotulo, permitirResolver = false }: { onEnviar: (texto: string, resolver: boolean) => Promise<void>; rotulo: string; permitirResolver?: boolean }) {
  const [texto, setTexto] = useState('')
  const [resolver, setResolver] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await onEnviar(texto, resolver)
      setTexto('')
      setResolver(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar agora')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <label htmlFor="resposta-do-chamado" className="sr-only">
        {rotulo}
      </label>
      <Textarea id="resposta-do-chamado" rows={4} maxLength={4000} value={texto} placeholder={rotulo} onChange={(e) => setTexto(e.target.value)} />
      {permitirResolver && <Checkbox label="Marcar como resolvido ao enviar" checked={resolver} onChange={(e) => setResolver(e.target.checked)} />}
      <FormError>{erro}</FormError>
      <div>
        <Button type="submit" variant="primary" icon={Send} loading={enviando} disabled={enviando || texto.trim().length < 2}>
          Enviar
        </Button>
      </div>
    </form>
  )
}
