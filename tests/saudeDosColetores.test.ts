import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RegistroDeColeta,
  coletoresSemColeta,
  limparAvisosDeColetor,
  textoDoColetorParado,
  verificarColetoresParados,
} from '../src/services/saudeDosColetores'

const agora = new Date('2026-10-17T15:00:00Z')

function registro(over: Partial<RegistroDeColeta>): RegistroDeColeta {
  return { fonte: 'PNCP', status: 'SUCCESS', totalFetched: 0, totalNew: 0, totalDupes: 0, errorMsg: null, finishedAt: agora, ...over }
}

describe('coletor que passou 24 h sem trazer licitação', () => {
  beforeEach(() => {
    limparAvisosDeColetor()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('SUCCESS com 0 coletadas o tempo todo é coletor parado, mesmo sem nenhuma falha', () => {
    const registros = [
      registro({ fonte: 'COMPRASNET' }),
      registro({ fonte: 'COMPRASNET' }),
      registro({ fonte: 'PNCP', totalFetched: 900, totalNew: 12 }),
    ]
    expect(coletoresSemColeta(['PNCP', 'COMPRASNET'], registros)).toEqual([{ fonte: 'COMPRASNET', execucoes: 2, falhas: 0, ultimoErro: null }])
  })

  it('fonte que só repetiu o que já estava no banco conta como coletando', () => {
    expect(coletoresSemColeta(['QUERIDO_DIARIO'], [registro({ fonte: 'QUERIDO_DIARIO', totalDupes: 30 })])).toEqual([])
  })

  it('sem execução nenhuma na janela também é parado, e o último erro vai junto', () => {
    expect(coletoresSemColeta(['SISTEMA_S'], [])).toEqual([{ fonte: 'SISTEMA_S', execucoes: 0, falhas: 0, ultimoErro: null }])
    const parado = coletoresSemColeta(
      ['INFRAERO'],
      [
        registro({ fonte: 'INFRAERO', status: 'FAILED', errorMsg: 'antigo', finishedAt: new Date('2026-10-17T01:00:00Z') }),
        registro({ fonte: 'INFRAERO', status: 'FAILED', errorMsg: 'Varredura da Infraero interrompida', finishedAt: new Date('2026-10-17T12:00:00Z') }),
        registro({ fonte: 'INFRAERO', status: 'RUNNING', totalFetched: null }),
      ]
    )
    expect(parado).toEqual([{ fonte: 'INFRAERO', execucoes: 2, falhas: 2, ultimoErro: 'Varredura da Infraero interrompida' }])
    expect(textoDoColetorParado(parado[0])).toBe(
      'INFRAERO: 0 licitações coletadas nas últimas 24 h (2 execução(ões), 2 com falha) — último erro: Varredura da Infraero interrompida'
    )
  })

  it('avisa o administrador uma vez por dia por fonte, pelo alerta operacional', async () => {
    const avisar = vi.fn(async () => true)
    const dep = { registros: vi.fn(async () => [registro({ fonte: 'INFRAERO', status: 'FAILED' })]), avisar }

    await verificarColetoresParados(['INFRAERO', 'PNCP'], agora, dep)
    expect(dep.registros).toHaveBeenCalledWith(new Date('2026-10-16T15:00:00Z'))
    expect(avisar).toHaveBeenCalledTimes(1)
    const [chave, assunto, texto] = avisar.mock.calls[0] as unknown as [string, string, string]
    expect(chave).toBe('coletor-parado|INFRAERO,PNCP')
    expect(assunto).toBe('Coletores sem licitação coletada há 24 h')
    expect(texto).toContain('INFRAERO: 0 licitações coletadas nas últimas 24 h (1 execução(ões), 1 com falha)')
    expect(texto).toContain('PNCP: 0 licitações coletadas nas últimas 24 h (nenhuma execução registrada)')

    await verificarColetoresParados(['INFRAERO', 'PNCP'], new Date(agora.getTime() + 6 * 3_600_000), dep)
    expect(avisar).toHaveBeenCalledTimes(1)

    await verificarColetoresParados(['INFRAERO', 'PNCP'], new Date(agora.getTime() + 25 * 3_600_000), dep)
    expect(avisar).toHaveBeenCalledTimes(2)
  })

  it('nada parado, nada avisado', async () => {
    const avisar = vi.fn(async () => true)
    const parados = await verificarColetoresParados(['PNCP'], agora, { registros: async () => [registro({ totalFetched: 5 })], avisar })
    expect(parados).toEqual([])
    expect(avisar).not.toHaveBeenCalled()
  })
})
