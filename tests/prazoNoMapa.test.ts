import { describe, expect, it } from 'vitest'
import { prazoNoMapa, urgenciaDoEstado } from '../src/lib/prazoNoMapa'
import { parseDataBr } from '../src/lib/scrapingHelpers'
import { rotuloDoPrazoNoMapa } from '../web/src/lib/prazoNoMapa'

const HORA = 60 * 60 * 1000
const agora = new Date('2026-10-17T15:00:00Z').getTime()
const daqui = (horas: number) => new Date(agora + horas * HORA)

describe('prazo das licitações escolhidas no mapa', () => {
  it('encerrada há 10 h não é "encerra hoje" nem urgente', () => {
    const prazo = prazoNoMapa(daqui(-10), 'PNCP', agora)
    expect(prazo).toEqual({ horasRestantes: -10, urgencia: 'encerrada' })
    expect(rotuloDoPrazoNoMapa(prazo.horasRestantes)).toBe('Propostas encerradas há 10 h')
  })

  it('encerrada há 3 dias também não pinta de vermelho', () => {
    const prazo = prazoNoMapa(daqui(-72), 'PNCP', agora)
    expect(prazo.urgencia).toBe('encerrada')
    expect(rotuloDoPrazoNoMapa(prazo.horasRestantes)).toBe('Propostas encerradas há 3 dias')
  })

  it('encerrando em 3 h mostra horas, não "1 dia"', () => {
    const prazo = prazoNoMapa(daqui(3), 'PNCP', agora)
    expect(prazo).toEqual({ horasRestantes: 3, urgencia: 'urgente' })
    expect(rotuloDoPrazoNoMapa(prazo.horasRestantes)).toBe('Encerra em 3 h')
  })

  it('menos de 1 h, até 48 h, até 7 dias e depois', () => {
    expect(rotuloDoPrazoNoMapa(prazoNoMapa(daqui(0.5), 'PNCP', agora).horasRestantes)).toBe('Encerra em menos de 1 h')
    expect(prazoNoMapa(daqui(48), 'PNCP', agora).urgencia).toBe('urgente')
    const quatroDias = prazoNoMapa(daqui(4 * 24 + 5), 'PNCP', agora)
    expect(quatroDias.urgencia).toBe('andamento')
    expect(rotuloDoPrazoNoMapa(quatroDias.horasRestantes)).toBe('Encerra em 4 dias')
    expect(prazoNoMapa(daqui(10 * 24), 'PNCP', agora).urgencia).toBe('selecionada')
  })

  it('sem prazo fica como selecionada', () => {
    expect(prazoNoMapa(null, 'PNCP', agora)).toEqual({ horasRestantes: null, urgencia: 'selecionada' })
    expect(rotuloDoPrazoNoMapa(null)).toBe('Sem prazo de encerramento definido')
  })

  it('prazo só com o dia, de portal, vale até o fim daquele dia em Brasília', () => {
    const hoje = parseDataBr('17/10/2026')!
    const prazo = prazoNoMapa(hoje, 'SESC_REGIONAL', agora)
    expect(prazo.urgencia).toBe('urgente')
    expect(prazo.horasRestantes).toBe(11)
  })

  it('o estado assume a urgência mais alta e só fica cinza se todas encerraram', () => {
    expect(urgenciaDoEstado(['encerrada', 'urgente', 'selecionada'])).toBe('urgente')
    expect(urgenciaDoEstado(['encerrada', 'selecionada'])).toBe('selecionada')
    expect(urgenciaDoEstado(['encerrada', 'encerrada'])).toBe('encerrada')
  })
})
