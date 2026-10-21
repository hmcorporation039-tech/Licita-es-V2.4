'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { enviarErroDaTela } from '@/lib/suporte'
import { Button, LinkButton, Panel } from '@/components/ui'

export default function ErroNaTela({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    enviarErroDaTela(error)
  }, [error])

  return (
    <Panel title="Algo deu errado nesta tela">
      <div className="flex flex-col gap-4">
        <p className="max-w-prose text-sm text-muted">
          O erro já foi registrado para a nossa equipe. Tente de novo; se continuar, abra um chamado que a gente olha com prioridade.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={RotateCcw} onClick={() => retry()}>
            Tentar de novo
          </Button>
          <LinkButton href="/suporte?tipo=ERRO" variant="secondary">
            Falar com o suporte
          </LinkButton>
        </div>
      </div>
    </Panel>
  )
}
