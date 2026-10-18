import { describe, expect, it, vi } from 'vitest'

const filas = vi.hoisted(() => ({ agendados: new Map<string, { id: string; opcoes: unknown; job: unknown }[]>() }))

vi.mock('ioredis', () => ({ default: class RedisFalso {} }))

vi.mock('bullmq', () => ({
  Queue: class FilaFalsa {
    name: string
    constructor(name: string) {
      this.name = name
      filas.agendados.set(name, [])
    }
    async getRepeatableJobs() {
      return []
    }
    async removeRepeatableByKey() {
      return undefined
    }
    async removeJobScheduler() {
      return undefined
    }
    async upsertJobScheduler(id: string, opcoes: unknown, job: unknown) {
      filas.agendados.get(this.name)!.push({ id, opcoes, job })
    }
    async add() {
      return undefined
    }
  },
}))

describe('agendador dos diários municipais (SIGPub)', () => {
  it('roda duas vezes por dia no fuso de Brasília, em fila e agendador próprios', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { scheduleColetorJobs } = await import('../src/queues')
    await scheduleColetorJobs()

    expect(filas.agendados.get('coletor-diario-municipal')).toEqual([
      {
        id: 'coleta-diario-municipal',
        opcoes: { pattern: '35 5,17 * * *', tz: 'America/Sao_Paulo' },
        job: { name: 'coleta-diario-municipal', data: { fonte: 'DIARIO_MUNICIPAL' } },
      },
    ])
  })
})
