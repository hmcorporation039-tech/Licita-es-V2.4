'use client'

// Aviso de cookies (LGPD): o Google Analytics só carrega depois do "Aceitar".
// Fica no rodapé da tela, pequeno, e some depois da escolha. A Política de
// Privacidade tem um botão para mudar a escolha (reabrirEscolha).

import { useEffect, useSyncExternalStore } from 'react'
import { Button, TextLink } from '@/components/ui'
import { EVENTO_REABRIR, idDaMedicao, type EscolhaDeMedicao } from '@/lib/medicao'
import { guardarEscolha, lerEscolha, ligarMedicao } from '@/lib/medicaoNoNavegador'

const MUDOU = 'bela:medicao-mudou'
let reaberto = false

function assinar(avisar: () => void) {
  const reabrir = () => {
    reaberto = true
    avisar()
  }
  window.addEventListener(MUDOU, avisar)
  window.addEventListener(EVENTO_REABRIR, reabrir)
  window.addEventListener('storage', avisar)
  return () => {
    window.removeEventListener(MUDOU, avisar)
    window.removeEventListener(EVENTO_REABRIR, reabrir)
    window.removeEventListener('storage', avisar)
  }
}

// 'pendente' = mostrar o aviso. No servidor não mostra nada (evita piscar na hidratação).
function estadoNoCliente(): EscolhaDeMedicao | 'pendente' {
  const escolha = lerEscolha()
  return reaberto || !escolha ? 'pendente' : escolha
}
const estadoNoServidor = () => 'recusada' as const

export default function AvisoDeMedicao() {
  const id = idDaMedicao()
  const estado = useSyncExternalStore(assinar, estadoNoCliente, estadoNoServidor)

  useEffect(() => {
    if (id && estado === 'aceita' && process.env.NODE_ENV === 'production') ligarMedicao(id)
  }, [id, estado])

  if (!id || estado !== 'pendente') return null

  function escolher(escolha: EscolhaDeMedicao) {
    const antes = lerEscolha()
    guardarEscolha(escolha)
    reaberto = false
    window.dispatchEvent(new Event(MUDOU))
    // Quem tinha aceitado e agora recusou: recarrega para o script do Google sair da página.
    if (antes === 'aceita' && escolha === 'recusada') window.location.reload()
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-2 bottom-2 z-50 mx-auto flex max-w-2xl flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-sm text-ink shadow-lg sm:flex-row sm:items-center"
    >
      <p className="flex-1 text-ink-2">
        Usamos o Google Analytics para saber como as pessoas chegam e usam a Licita Bela. Ele só é ligado se você aceitar.{' '}
        <TextLink href="/privacidade">Saiba mais</TextLink>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" onClick={() => escolher('recusada')}>
          Recusar
        </Button>
        <Button size="sm" variant="primary" onClick={() => escolher('aceita')}>
          Aceitar
        </Button>
      </div>
    </div>
  )
}
