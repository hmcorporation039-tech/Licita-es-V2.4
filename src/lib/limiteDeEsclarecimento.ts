// ============================================================
// lib/limiteDeEsclarecimento.ts — Quando avisar no celular que o prazo para
// pedir esclarecimento ou impugnar o edital (art. 164 da Lei 14.133/2021:
// até 3 dias úteis antes da sessão) está acabando. Avisa no dia útil anterior
// ao limite e no próprio dia limite, só em horário comercial de Brasília.
// Sem rede e sem banco.
// ============================================================

import { calcularPrazosDaSessao, diaEmBrasilia, ehDiaUtil, type Dia } from './diasUteis'
import { encurtar, type MensagemNoCelular } from './notificacaoNoCelular'

export type MarcoDoLimite = 'vespera' | 'ultimo-dia'

export interface AvisoDoLimite {
  marco: MarcoDoLimite
  limite: Dia
}

// Das 8h às 18h de Brasília: ninguém quer esse aviso de madrugada.
export const PRIMEIRA_HORA_DO_AVISO = 8
export const ULTIMA_HORA_DO_AVISO = 18

export function horaEmBrasilia(instante: Date): number {
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(instante)
  return Number(hora)
}

export function avisoDoLimite(sessao: Date, agora: Date): AvisoDoLimite | null {
  const hoje = diaEmBrasilia(agora)
  if (!ehDiaUtil(hoje)) return null
  const hora = horaEmBrasilia(agora)
  if (hora < PRIMEIRA_HORA_DO_AVISO || hora >= ULTIMA_HORA_DO_AVISO) return null
  const prazos = calcularPrazosDaSessao(sessao, agora)
  if (prazos.limitePassou) return null
  if (prazos.diasUteisAteLimite === 0) return { marco: 'ultimo-dia', limite: prazos.limiteImpugnacao }
  if (prazos.diasUteisAteLimite === 1) return { marco: 'vespera', limite: prazos.limiteImpugnacao }
  return null
}

const diaBr = (dia: Dia) => dia.split('-').reverse().join('/')

export interface LicitacaoComLimite {
  tenderId: string
  objeto: string
  aviso: AvisoDoLimite
}

export function mensagemDoLimite(licitacoes: LicitacaoComLimite[]): MensagemNoCelular {
  const ordenadas = [...licitacoes].sort((a, b) => a.aviso.limite.localeCompare(b.aviso.limite))
  const [primeira] = ordenadas
  const hoje = primeira.aviso.marco === 'ultimo-dia'
  if (ordenadas.length === 1) {
    return {
      titulo: hoje ? 'Hoje é o último dia para pedir esclarecimento' : `Esclarecimento e impugnação: até ${diaBr(primeira.aviso.limite)}`,
      corpo: encurtar(`Se tiver dúvida no edital ou nos itens, mande o pedido ao pregoeiro. ${primeira.objeto}`),
      url: `/tenders/${primeira.tenderId}/documentos`,
      tag: `esclarecimento-${primeira.tenderId}`,
    }
  }
  return {
    titulo: `${ordenadas.length} licitações com prazo de esclarecimento acabando`,
    corpo: encurtar(`${hoje ? 'Hoje é o último dia' : `Até ${diaBr(primeira.aviso.limite)}`}: ${primeira.objeto} e mais ${ordenadas.length - 1}.`),
    url: '/escolhidas',
    tag: 'esclarecimento',
  }
}
