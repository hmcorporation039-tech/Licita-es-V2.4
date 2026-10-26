import { describe, expect, it } from 'vitest'
import { montarAgentes, inicioDoDiaBR, type DadosDoEscritorio } from '../src/services/escritorio'

const AGORA = new Date('2026-10-26T18:00:00Z')
const haSegundos = (s: number) => new Date(AGORA.getTime() - s * 1000)

// Base "tudo parado": nenhum agente trabalhando, nada aguardando.
function dadosParados(): DadosDoEscritorio {
  return {
    coleta: { rodando: false, ultimaColeta: haSegundos(3600), novasHoje: 0 },
    casamento: { ultimo: haSegundos(3600), hoje: 0 },
    analise: { rodando: 0, ultima: haSegundos(3600), concluidasHoje: 0 },
    orcamento: { ultimaAtividade: haSegundos(3600), estudosHoje: 0 },
    estrategia: { rodando: 0, ultima: haSegundos(3600), concluidasHoje: 0 },
    bela: { disputasAtivas: 0, ultimoLance: haSegundos(3600), lancesHoje: 0, aguardandoConfirmacao: 0 },
  }
}

describe('montarAgentes', () => {
  it('devolve os 6 agentes na ordem do fluxo real', () => {
    const agentes = montarAgentes(dadosParados(), AGORA)
    expect(agentes.map((a) => a.id)).toEqual(['garimpeira', 'casadora', 'analista', 'orcamentista', 'estrategista', 'bela'])
    expect(agentes.map((a) => a.ordem)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('com tudo parado, todos ficam ociosos', () => {
    const agentes = montarAgentes(dadosParados(), AGORA)
    expect(agentes.every((a) => a.estado === 'ocioso')).toBe(true)
  })

  it('só a Bela pode ter pedido de aprovação; nunca as outras', () => {
    const d = dadosParados()
    d.bela.aguardandoConfirmacao = 2
    const agentes = montarAgentes(d, AGORA)
    const bela = agentes.find((a) => a.id === 'bela')!
    expect(bela.estado).toBe('aguardando')
    expect(bela.pedidoAprovacao).toMatch(/aguardando confirmação no portal/)
    expect(bela.pedidoAprovacao).toMatch(/Quem dá o lance é o cliente/)
    expect(agentes.filter((a) => a.id !== 'bela').every((a) => a.pedidoAprovacao === null)).toBe(true)
  })

  it('Garimpeira fica trabalhando quando a coleta está rodando', () => {
    const d = dadosParados()
    d.coleta.rodando = true
    expect(montarAgentes(d, AGORA).find((a) => a.id === 'garimpeira')!.estado).toBe('trabalhando')
  })

  it('Analista e Estrategista trabalham quando há análise RUNNING', () => {
    const d = dadosParados()
    d.analise.rodando = 3
    d.estrategia.rodando = 1
    const agentes = montarAgentes(d, AGORA)
    expect(agentes.find((a) => a.id === 'analista')!.estado).toBe('trabalhando')
    expect(agentes.find((a) => a.id === 'analista')!.tarefaAtual).toBe('Lendo 3 editais')
    expect(agentes.find((a) => a.id === 'estrategista')!.tarefaAtual).toBe('Analisando 1 concorrente')
  })

  it('Casadora e Orçamentista trabalham só se a última entrega foi recente', () => {
    const d = dadosParados()
    d.casamento.ultimo = haSegundos(30)
    d.orcamento.ultimaAtividade = haSegundos(30)
    const recente = montarAgentes(d, AGORA)
    expect(recente.find((a) => a.id === 'casadora')!.estado).toBe('trabalhando')
    expect(recente.find((a) => a.id === 'orcamentista')!.estado).toBe('trabalhando')
    // Fora da janela de recência volta a ocioso.
    d.casamento.ultimo = haSegundos(600)
    d.orcamento.ultimaAtividade = haSegundos(600)
    const velho = montarAgentes(d, AGORA)
    expect(velho.find((a) => a.id === 'casadora')!.estado).toBe('ocioso')
    expect(velho.find((a) => a.id === 'orcamentista')!.estado).toBe('ocioso')
  })

  it('Bela trabalha quando há disputa ativa com lance recente, sem pedido pendente', () => {
    const d = dadosParados()
    d.bela.disputasAtivas = 2
    d.bela.ultimoLance = haSegundos(30)
    const bela = montarAgentes(d, AGORA).find((a) => a.id === 'bela')!
    expect(bela.estado).toBe('trabalhando')
    expect(bela.tarefaAtual).toBe('Acompanhando 2 pregões em disputa')
    expect(bela.pedidoAprovacao).toBeNull()
  })

  it('as métricas do dia passam direto para o agente', () => {
    const d = dadosParados()
    d.coleta.novasHoje = 42
    d.bela.lancesHoje = 7
    const agentes = montarAgentes(d, AGORA)
    expect(agentes.find((a) => a.id === 'garimpeira')!.metricaValor).toBe(42)
    expect(agentes.find((a) => a.id === 'bela')!.metricaValor).toBe(7)
  })
})

describe('inicioDoDiaBR', () => {
  it('início do dia de Brasília é 03:00 UTC (UTC-3 fixo)', () => {
    // 26/10/2026 18:00 UTC = 15:00 em Brasília → início do dia é 26/10 03:00 UTC.
    expect(inicioDoDiaBR(AGORA).toISOString()).toBe('2026-10-26T03:00:00.000Z')
  })

  it('antes das 03:00 UTC ainda é o dia anterior em Brasília', () => {
    // 26/10/2026 01:30 UTC = 25/10 22:30 em Brasília → início do dia é 25/10 03:00 UTC.
    expect(inicioDoDiaBR(new Date('2026-10-26T01:30:00Z')).toISOString()).toBe('2026-10-25T03:00:00.000Z')
  })
})
