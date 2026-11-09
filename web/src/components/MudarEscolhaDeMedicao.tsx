'use client'

import { Button } from '@/components/ui'
import { reabrirEscolha } from '@/lib/medicaoNoNavegador'

export default function MudarEscolhaDeMedicao() {
  return (
    <Button size="sm" variant="secondary" onClick={reabrirEscolha}>
      Mudar minha escolha sobre cookies
    </Button>
  )
}
