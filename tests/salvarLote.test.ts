import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  salvar: vi.fn(),
  enfileirar: vi.fn(async () => true),
  avisar: vi.fn(async () => 0),
}))

vi.mock('../src/queues', () => ({ matcherQueue: { name: 'matcher' } }))
vi.mock('../src/queues/enfileirar', () => ({ enfileirarSemTravar: dubles.enfileirar }))
vi.mock('../src/services/tenderChangeService', () => ({ avisarAlteracaoDeTender: dubles.avisar }))
vi.mock('../src/services/tenderService', () => ({ saveTenderSeAindaServir: dubles.salvar }))

import { salvarLote } from '../src/workers/coletorHtmlShared'
import { NormalizedTender } from '../src/types'

const tender = (fonteId: string) => ({ fonteId }) as NormalizedTender

describe('salvarLote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('não conta como nova nem manda ao matcher a licitação que já chega encerrada', async () => {
    dubles.salvar
      .mockResolvedValueOnce({ isNew: true, tenderId: 't-novo', isDupe: false, changed: false, changedFields: [] })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ isNew: false, tenderId: 't-mudou', isDupe: true, changed: true, changedFields: ['encerramentoAt'] })
      .mockResolvedValueOnce({ isNew: false, tenderId: 't-igual', isDupe: true, changed: false, changedFields: [] })

    const contagem = await salvarLote(['a', 'b', 'c', 'd', 'e'].map(tender), 'teste')

    expect(contagem).toEqual({ totalNew: 1, totalDupes: 2, totalUpdated: 1, totalDescartadas: 2 })
    expect(dubles.enfileirar).toHaveBeenCalledTimes(1)
    expect(dubles.enfileirar).toHaveBeenCalledWith({ name: 'matcher' }, 'match-tender', { tenderId: 't-novo' }, 'teste')
    expect(dubles.avisar).toHaveBeenCalledWith('t-mudou', ['encerramentoAt'])
  })
})
