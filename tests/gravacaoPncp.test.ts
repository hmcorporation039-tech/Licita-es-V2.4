import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  salvar: vi.fn(),
  enfileirar: vi.fn(async () => true),
  avisar: vi.fn(async () => 0),
  esconder: vi.fn<(tenderId: string, tender: { fonteId: string }) => Promise<number>>(async () => 0),
}))

vi.mock('../src/queues', () => ({ redisConnection: {}, matcherQueue: { name: 'matcher' } }))
vi.mock('../src/queues/enfileirar', () => ({ enfileirarSemTravar: dubles.enfileirar }))
vi.mock('../src/services/tenderChangeService', () => ({ avisarAlteracaoDeTender: dubles.avisar }))
vi.mock('../src/services/coletaCursorService', () => ({ ultimaPublicacaoColetada: async () => null }))
vi.mock('../src/services/duplicataEntreFontes', () => ({ esconderRepeticoesDaLicitacaoDoPncp: dubles.esconder, revisarRepeticoesDoPncp: vi.fn() }))
vi.mock('../src/services/tenderService', () => ({ saveTenderSeAindaServir: dubles.salvar, saveWorkerLog: vi.fn() }))

import { gravarContratacoesPncp } from '../src/workers/coletorPNCP'
import { contadoresZerados } from '../src/services/pncpColeta'

function bruto(numero: string) {
  return {
    numeroControlePNCP: numero,
    modalidadeId: 6,
    objetoCompra: 'Aquisição de cadeiras',
    orgaoEntidade: { cnpj: '00000000000191', esferaId: 'M' },
    unidadeOrgao: { ufSigla: 'MG', municipioNome: 'Uberlândia', codigoIbge: '3170206' },
    anoCompra: 2026,
    sequencialCompra: 1,
  }
}

describe('gravarContratacoesPncp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('conta só o que entrou de verdade como novo e só enfileira o matcher para ele', async () => {
    dubles.salvar
      .mockResolvedValueOnce({ isNew: true, tenderId: 't-novo', isDupe: false, changed: false, changedFields: [] })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ isNew: false, tenderId: 't-mudou', isDupe: true, changed: true, changedFields: ['encerramentoAt'] })
      .mockResolvedValueOnce({ isNew: false, tenderId: 't-igual', isDupe: true, changed: false, changedFields: [] })
      .mockRejectedValueOnce(new Error('banco fora'))

    const contadores = contadoresZerados()
    await gravarContratacoesPncp(['a', 'b', 'c', 'd', 'e'].map(bruto), contadores, 'teste')

    expect(contadores).toEqual({ vistos: 5, novos: 1, atualizados: 1, inalterados: 1, descartados: 1, comErro: 1 })
    expect(dubles.enfileirar).toHaveBeenCalledTimes(1)
    expect(dubles.enfileirar).toHaveBeenCalledWith({ name: 'matcher' }, 'match-tender', { tenderId: 't-novo' }, 'teste')
    expect(dubles.avisar).toHaveBeenCalledWith('t-mudou', ['encerramentoAt'])
    expect(dubles.esconder).toHaveBeenCalledTimes(1)
    expect(dubles.esconder.mock.calls[0][0]).toBe('t-novo')
    expect(dubles.esconder.mock.calls[0][1]).toMatchObject({ fonteId: 'a', uf: 'MG', municipioIbge: '3170206' })
  })

  it('falha ao procurar a repetição em diário/TCE-CE não conta a licitação do PNCP como erro', async () => {
    dubles.salvar.mockResolvedValueOnce({ isNew: true, tenderId: 't-novo', isDupe: false, changed: false, changedFields: [] })
    dubles.esconder.mockRejectedValueOnce(new Error('banco ocupado'))
    const contadores = contadoresZerados()
    await gravarContratacoesPncp([bruto('a')], contadores, 'teste')
    expect(contadores).toMatchObject({ novos: 1, comErro: 0 })
  })

  it('grava o código IBGE do município e a esfera vindos do PNCP', async () => {
    dubles.salvar.mockResolvedValueOnce(null)
    await gravarContratacoesPncp([bruto('x')], contadoresZerados(), 'teste')
    const normalizada = dubles.salvar.mock.calls[0][0]
    expect(normalizada.municipioIbge).toBe('3170206')
    expect(normalizada.rawJson).toMatchObject({ orgaoEntidade: { cnpj: '00000000000191', esferaId: 'M' } })
  })
})
