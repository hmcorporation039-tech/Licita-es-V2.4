'use client'

import { paraData } from '@/lib/datas'
import { useHidratado } from './PrazoNoCliente'

const FUSO = 'America/Sao_Paulo'
const DIA_MS = 24 * 60 * 60 * 1000

function partesEmBrasilia(data: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(data)
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  return { dia: Date.UTC(valor('year'), valor('month') - 1, valor('day')), hora: valor('hour'), minuto: valor('minute'), diaDoMes: valor('day'), mes: valor('month') }
}

export function quandoEncerra(prazo: Date, agora: Date = new Date()): string {
  const alvo = partesEmBrasilia(prazo)
  const hoje = partesEmBrasilia(agora)
  const dias = Math.round((alvo.dia - hoje.dia) / DIA_MS)
  const horario = `${alvo.hora}h${alvo.minuto ? String(alvo.minuto).padStart(2, '0') : ''}`
  if (dias <= 0) return `hoje às ${horario}`
  if (dias === 1) return `amanhã às ${horario}`
  if (dias <= 6) return `em ${dias} dias`
  return `no dia ${String(alvo.diaDoMes).padStart(2, '0')}/${String(alvo.mes).padStart(2, '0')}`
}

function fraseDoTotal(total: number, termo: string): string {
  if (total === 1) return `Achei 1 licitação de ${termo} aberta.`
  return `Achei ${total.toLocaleString('pt-BR')} licitações de ${termo} abertas.`
}

export default function FalaDaBelaNoHeroi({ total, termo, primeiroPrazo, className }: { total: number | null; termo: string; primeiroPrazo: string | null; className?: string }) {
  const hidratado = useHidratado()
  const prazo = paraData(primeiroPrazo)
  const prazoValido = hidratado && prazo && prazo.getTime() > Date.now()

  return (
    <p className={className}>
      <span className="az-balao-autora">Bela</span>
      {total && total > 0 ? (
        <span>
          “{fraseDoTotal(total, termo)}
          {prazoValido ? ` A primeira encerra ${quandoEncerra(prazo)}.` : ''}”
        </span>
      ) : (
        <span>“Me diga o que você vende que eu encontro as licitações abertas e aviso o que encerra primeiro.”</span>
      )}
    </p>
  )
}
