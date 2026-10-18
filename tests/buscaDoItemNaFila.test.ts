import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONCORRENCIA_DA_BUSCA_DO_ITEM, processarBuscaDoItem } from '../src/workers/rematchItem'
import { executarBuscaDoItem } from '../src/services/rematchService'

vi.mock('../src/queues', () => ({ redisConnection: {} }))
vi.mock('../src/services/rematchService', () => ({ executarBuscaDoItem: vi.fn() }))

const job = (attemptsMade: number, attempts?: number) => ({ data: { itemId: 'item-1', modo: 'edicao' as const }, attemptsMade, opts: { attempts } })

describe('worker da busca do item', () => {
  beforeEach(() => {
    vi.mocked(executarBuscaDoItem).mockReset()
    vi.mocked(executarBuscaDoItem).mockResolvedValue({ matchesFound: 3, limitado: false })
  })

  it('roda uma busca por vez: duas buscas do mesmo item nunca se sobrepõem', () => {
    expect(CONCORRENCIA_DA_BUSCA_DO_ITEM).toBe(1)
  })

  it('repassa item e modo e só marca falha definitiva na última tentativa', async () => {
    await processarBuscaDoItem(job(0, 2))
    expect(executarBuscaDoItem).toHaveBeenLastCalledWith('item-1', 'edicao', { ultimaTentativa: false })
    await processarBuscaDoItem(job(1, 2))
    expect(executarBuscaDoItem).toHaveBeenLastCalledWith('item-1', 'edicao', { ultimaTentativa: true })
    await processarBuscaDoItem(job(0))
    expect(executarBuscaDoItem).toHaveBeenLastCalledWith('item-1', 'edicao', { ultimaTentativa: true })
  })

  it('item apagado antes da vez dele não quebra o job', async () => {
    vi.mocked(executarBuscaDoItem).mockResolvedValue(null)
    await expect(processarBuscaDoItem(job(0, 2))).resolves.toBeUndefined()
  })

  it('falha da busca propaga para o BullMQ tentar de novo', async () => {
    vi.mocked(executarBuscaDoItem).mockRejectedValue(new Error('banco fora'))
    await expect(processarBuscaDoItem(job(0, 2))).rejects.toThrow('banco fora')
  })
})
