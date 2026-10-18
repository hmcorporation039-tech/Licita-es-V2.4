import { beforeEach, describe, expect, it, vi } from 'vitest'

const fila = vi.hoisted(() => ({ redisConnection: { status: 'ready' }, notificadorQueue: { name: 'notificador' }, rematchItemQueue: { name: 'rematch-item' } }))
const enfileirar = vi.hoisted(() => vi.fn(async () => true))

vi.mock('../src/queues', () => fila)
vi.mock('../src/queues/enfileirar', () => ({ enfileirarSemTravar: enfileirar }))

import { enfileirarAvisosDeMatch } from '../src/services/rematchService'

describe('avisos de match na fila', () => {
  beforeEach(() => {
    enfileirar.mockReset()
    enfileirar.mockResolvedValue(true)
    fila.redisConnection.status = 'ready'
  })

  it('com o Redis pronto, enfileira um aviso por match', async () => {
    expect(await enfileirarAvisosDeMatch(['m1', 'm2', 'm3'], 'Teste')).toBe(3)
    expect(enfileirar).toHaveBeenCalledTimes(3)
    expect(enfileirar).toHaveBeenCalledWith(fila.notificadorQueue, 'notify-match', { tenderMatchId: 'm2' }, 'Teste')
  })

  it('com o Redis fora do ar, não tenta enfileirar nenhum', async () => {
    fila.redisConnection.status = 'reconnecting'
    expect(await enfileirarAvisosDeMatch(Array.from({ length: 20 }, (_, i) => `m${i}`), 'Teste')).toBe(0)
    expect(enfileirar).not.toHaveBeenCalled()
  })

  it('para na primeira falha em vez de esperar o tempo limite de cada um', async () => {
    enfileirar.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await enfileirarAvisosDeMatch(Array.from({ length: 20 }, (_, i) => `m${i}`), 'Teste')).toBe(1)
    expect(enfileirar).toHaveBeenCalledTimes(2)
  })
})
