'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { Field, Input, Select } from '@/components/ui'
import { ESTADOS, estadoDaSigla } from '@/lib/estados'

export interface Interesse {
  termo: string
  uf: string
}

export const TAMANHO_MINIMO_DO_TERMO = 2
export const TAMANHO_MAXIMO_DO_TERMO = 120

export function ondeMonitorar(uf: string): string {
  const estado = estadoDaSigla(uf)
  return estado ? estado.sigla : 'todo o Brasil'
}

export default function InteresseDoCadastro({ interesse, onMudar }: { interesse: Interesse | null; onMudar: (interesse: Interesse | null) => void }) {
  const [editando, setEditando] = useState(false)
  const [termo, setTermo] = useState(interesse?.termo ?? '')
  const [uf, setUf] = useState(interesse?.uf ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const tituloId = useId()
  const campoDoTermo = useRef<HTMLInputElement>(null)
  const botaoDeTrocar = useRef<HTMLButtonElement>(null)
  const botaoDeAdicionar = useRef<HTMLButtonElement>(null)

  function abrir() {
    setTermo(interesse?.termo ?? '')
    setUf(interesse?.uf ?? '')
    setErro(null)
    setEditando(true)
    requestAnimationFrame(() => campoDoTermo.current?.focus())
  }

  function aplicar() {
    const limpo = termo.trim().replace(/\s+/g, ' ')
    if (limpo.length < TAMANHO_MINIMO_DO_TERMO) {
      setErro(`Escreva ao menos ${TAMANHO_MINIMO_DO_TERMO} letras, por exemplo: material de limpeza.`)
      campoDoTermo.current?.focus()
      return
    }
    onMudar({ termo: limpo.slice(0, TAMANHO_MAXIMO_DO_TERMO), uf })
    setEditando(false)
    requestAnimationFrame(() => botaoDeTrocar.current?.focus())
  }

  function cancelar() {
    setEditando(false)
    setErro(null)
    requestAnimationFrame(() => (botaoDeTrocar.current ?? botaoDeAdicionar.current)?.focus())
  }

  function remover() {
    onMudar(null)
    requestAnimationFrame(() => botaoDeAdicionar.current?.focus())
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      aplicar()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    }
  }

  if (editando) {
    return (
      <div role="group" aria-labelledby={tituloId} className="pb-interesse">
        <p id={tituloId} className="pb-interesse-texto">
          <strong>O que você quer monitorar?</strong>
        </p>
        <div className="pb-interesse-campos">
          <Field label="O que você vende" error={erro}>
            <Input
              ref={campoDoTermo}
              value={termo}
              maxLength={TAMANHO_MAXIMO_DO_TERMO}
              placeholder="material de limpeza"
              enterKeyHint="done"
              onChange={(e) => {
                setTermo(e.target.value)
                if (erro) setErro(null)
              }}
              onKeyDown={aoTeclar}
            />
          </Field>
          <Field label="Onde">
            <Select value={uf} onChange={(e) => setUf(e.target.value)} onKeyDown={aoTeclar}>
              <option value="">Todo o Brasil</option>
              {ESTADOS.map((e) => (
                <option key={e.sigla} value={e.sigla}>
                  {e.sigla} · {e.nome}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="pb-interesse-acoes">
          <button type="button" className="pb-botao-link" onClick={aplicar}>
            Usar este
          </button>
          <button type="button" className="pb-botao-link" onClick={cancelar}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (!interesse) {
    return (
      <button ref={botaoDeAdicionar} type="button" className="pb-botao-link self-start" onClick={abrir}>
        <Plus size={16} strokeWidth={2.5} aria-hidden />
        Já dizer o que você vende (opcional)
      </button>
    )
  }

  return (
    <div role="group" aria-labelledby={tituloId} className="pb-interesse">
      <p id={tituloId} className="pb-interesse-texto">
        Você vai monitorar: <strong>{interesse.termo}</strong> em <strong>{ondeMonitorar(interesse.uf)}</strong>
      </p>
      <p className="pb-interesse-nota">Assim que você confirmar o e-mail, esse item já fica cadastrado e a Bela começa a procurar.</p>
      <div className="pb-interesse-acoes">
        <button ref={botaoDeTrocar} type="button" className="pb-botao-link" onClick={abrir}>
          <Pencil size={14} strokeWidth={2.5} aria-hidden />
          Trocar
        </button>
        <button type="button" className="pb-botao-link" onClick={remover}>
          <X size={16} strokeWidth={2.5} aria-hidden />
          Remover
        </button>
      </div>
    </div>
  )
}
