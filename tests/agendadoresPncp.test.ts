import { beforeEach, describe, expect, it, vi } from 'vitest'

const filas = vi.hoisted(() => {
  const porNome = new Map<string, { repetiveis: string[]; removidos: string[]; agendados: { id: string; opcoes: unknown; job: unknown }[]; adicionados: { nome: string; dados: unknown }[]; agendadoresRemovidos: string[] }>()
  return { porNome }
})

vi.mock('ioredis', () => ({ default: class RedisFalso {} }))

vi.mock('bullmq', () => ({
  Queue: class FilaFalsa {
    name: string
    constructor(name: string) {
      this.name = name
      filas.porNome.set(name, { repetiveis: [], removidos: [], agendados: [], adicionados: [], agendadoresRemovidos: [] })
    }
    private get estado() {
      return filas.porNome.get(this.name)!
    }
    async getRepeatableJobs() {
      return this.estado.repetiveis.map((key) => ({ key }))
    }
    async removeRepeatableByKey(key: string) {
      this.estado.removidos.push(key)
      this.estado.repetiveis = this.estado.repetiveis.filter((k) => k !== key)
    }
    async upsertJobScheduler(id: string, opcoes: unknown, job: unknown) {
      this.estado.agendados.push({ id, opcoes, job })
    }
    async removeJobScheduler(id: string) {
      this.estado.agendadoresRemovidos.push(id)
      return true
    }
    async add(nome: string, dados: unknown) {
      this.estado.adicionados.push({ nome, dados })
    }
  },
}))

describe('agendadores do PNCP', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('a varredura de propostas e a coleta convivem na mesma fila sem uma apagar a outra', async () => {
    const { scheduleColetorJobs } = await import('../src/queues')
    const pncp = filas.porNome.get('coletor-pncp')!
    pncp.repetiveis = ['coleta-pncp', 'varredura-propostas-pncp', 'repeat:legado:123']

    await scheduleColetorJobs()

    expect(pncp.removidos).toEqual(['repeat:legado:123'])
    const varredura = pncp.agendados.find((a) => a.id === 'varredura-propostas-pncp')
    expect(varredura?.opcoes).toEqual({ pattern: '30 0 * * *', tz: 'America/Sao_Paulo' })
    expect(varredura?.job).toEqual({ name: 'varredura-propostas-pncp', data: { varredura: 'propostas', fonte: 'PNCP' } })
    expect(pncp.agendados.find((a) => a.id === 'coleta-pncp')?.job).toEqual({ name: 'coleta-pncp', data: { fonte: 'PNCP' } })
  })

  it('a varredura não roda a cada subida do processo', async () => {
    const { dispararColetaInicial } = await import('../src/queues')
    await dispararColetaInicial()
    const nomes = filas.porNome.get('coletor-pncp')!.adicionados.map((a) => a.nome)
    expect(nomes).toEqual(['coleta-pncp-inicial'])
  })

  it('o módulo legado do Compras.gov.br não é mais agendado e o agendador antigo sai do Redis', async () => {
    const { scheduleColetorJobs, dispararColetaInicial, COLETOR_SCHEDULERS } = await import('../src/queues')
    const comprasnet = filas.porNome.get('coletor-comprasnet')!
    await scheduleColetorJobs()
    await dispararColetaInicial()
    expect(COLETOR_SCHEDULERS.some((s) => s.fonte === 'COMPRASNET')).toBe(false)
    expect(comprasnet.agendadoresRemovidos).toContain('coleta-comprasnet')
    expect(comprasnet.agendados).toEqual([])
    expect(comprasnet.adicionados).toEqual([])
  })
})
