'use client'

import { useEffect, useState } from 'react'
import { CalendarPlus, MessageCircle } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui'
import { arquivoDaAgenda, linkDoWhatsApp, textoParaWhatsApp, type LicitacaoParaCompartilhar } from '@/lib/compartilharLicitacao'
import { rastrear } from '@/lib/rastreamento'

export default function CompartilharLicitacao({ licitacao }: { licitacao: LicitacaoParaCompartilhar }) {
  const [origem, setOrigem] = useState('')
  useEffect(() => setOrigem(window.location.origin), [])
  const agenda = origem ? arquivoDaAgenda(licitacao, origem) : null

  function baixarAgenda() {
    if (!agenda) return
    const url = URL.createObjectURL(new Blob([agenda], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `prazo-licitacao-${licitacao.id}.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    rastrear('agenda_da_licitacao', {})
  }

  return (
    <>
      <a
        href={origem ? linkDoWhatsApp(textoParaWhatsApp(licitacao, origem)) : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses('secondary', 'md')}
        onClick={() => rastrear('whatsapp_da_licitacao', {})}
      >
        <MessageCircle size={16} aria-hidden />
        Enviar no WhatsApp
      </a>
      {agenda && (
        <Button variant="secondary" icon={CalendarPlus} onClick={baixarAgenda} title="Baixa um arquivo que o Google Agenda, o Outlook e o calendário do celular abrem">
          Adicionar à agenda
        </Button>
      )}
    </>
  )
}
