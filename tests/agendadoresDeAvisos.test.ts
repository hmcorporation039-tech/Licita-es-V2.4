import { describe, expect, it, vi } from 'vitest'

const agendados = vi.hoisted(() => [] as { fila: string; id: string; opcoes: unknown; job: unknown }[])

vi.mock('ioredis', () => ({ default: class RedisFalso {} }))

vi.mock('bullmq', () => ({
  Queue: class FilaFalsa {
    name: string
    constructor(name: string) {
      this.name = name
    }
    async upsertJobScheduler(id: string, opcoes: unknown, job: unknown) {
      agendados.push({ fila: this.name, id, opcoes, job })
    }
  },
}))

describe('agendadores do resumo diário e do lembrete de prazo', () => {
  it('resumo às 07:00 e lembrete de hora em hora, no horário de Brasília, na fila do notificador', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { agendarAvisosPorEmail } = await import('../src/queues')
    await agendarAvisosPorEmail()
    expect(agendados).toEqual([
      { fila: 'notificador', id: 'resumo-diario', opcoes: { pattern: '0 7 * * *', tz: 'America/Sao_Paulo' }, job: { name: 'resumo-diario', data: { tipo: 'resumo-diario' } } },
      { fila: 'notificador', id: 'lembrete-de-prazo', opcoes: { pattern: '0 * * * *', tz: 'America/Sao_Paulo' }, job: { name: 'lembrete-de-prazo', data: { tipo: 'lembrete-de-prazo' } } },
    ])
  })
})
