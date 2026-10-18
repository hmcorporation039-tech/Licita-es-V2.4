'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { PainelDoFiscal } from '@/lib/adminTypes'
import { diasUteis } from '@/lib/datas'
import { Button, Notice } from '@/components/ui'

function dia(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function AvisoDeClausulas({ tenderId, onVerDetalhes, onImpugnar }: { tenderId: string; onVerDetalhes: () => void; onImpugnar: () => void }) {
  const [dados, setDados] = useState<Pick<PainelDoFiscal, 'alertas' | 'prazos'> | null>(null)

  useEffect(() => {
    let ativo = true
    api
      .get<PainelDoFiscal>(`/api/tenders/${tenderId}/habilitacao`)
      .then((r) => ativo && setDados({ alertas: r.alertas, prazos: r.prazos }))
      .catch(() => ativo && setDados(null))
    return () => {
      ativo = false
    }
  }, [tenderId])

  const itens = dados?.alertas.disponivel ? dados.alertas.itens : []
  if (itens.length === 0) return null

  const altas = itens.filter((a) => a.gravidade === 'alta').length
  const prazos = dados?.prazos
  const prazo =
    prazos && !prazos.sessaoPassou
      ? prazos.limitePassou
        ? 'O prazo para impugnar já terminou.'
        : `Prazo para impugnar ou pedir esclarecimento: até ${dia(prazos.limiteImpugnacao)} (${diasUteis(prazos.diasUteisAteLimite)}).`
      : null

  return (
    <Notice
      tone={altas > 0 ? 'danger' : 'warn'}
      title={itens.length === 1 ? '1 exigência do edital parece passar dos limites da lei' : `${itens.length} exigências do edital parecem passar dos limites da lei`}
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={onVerDetalhes} className="h-11! sm:h-8!">
            Ver detalhes
          </Button>
          <Button size="sm" variant="primary" onClick={onImpugnar} className="h-11! sm:h-8!">
            Gerar impugnação
          </Button>
        </div>
      }
    >
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
        {itens.slice(0, 4).map((a) => (
          <li key={a.chave ?? a.id}>{a.titulo}</li>
        ))}
        {itens.length > 4 && <li>e mais {itens.length - 4}</li>}
      </ul>
      {prazo && <p className="mt-2">{prazo}</p>}
      <p className="mt-1 text-xs">São indícios para análise jurídica: confira com advogado antes de impugnar.</p>
    </Notice>
  )
}
