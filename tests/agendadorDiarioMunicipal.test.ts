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

  it('a FAMEM roda às 11:10 e 18:10 de Brasília, num horário que nenhuma outra fonte usa', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { scheduleColetorJobs, COLETOR_SCHEDULERS } = await import('../src/queues')
    await scheduleColetorJobs()

    expect(filas.agendados.get('coletor-famem')?.at(-1)).toEqual({
      id: 'coleta-famem',
      opcoes: { pattern: '10 11,18 * * *', tz: 'America/Sao_Paulo' },
      job: { name: 'coleta-famem', data: { fonte: 'FAMEM' } },
    })
    const outras = COLETOR_SCHEDULERS.filter((s) => s.fonte !== 'FAMEM' && s.tz === 'America/Sao_Paulo').map((s) => s.pattern)
    expect(outras.some((p) => p.startsWith('10 ') && /\b(11|18)\b/.test(p.split(' ')[1]))).toBe(false)
  })
})
