import { describe, expect, it } from 'vitest'
import { ESPERA_APOS_FALHA_MS, ESPERA_APOS_SEM_DOCUMENTOS_MS, falhouHaPouco } from '../src/lib/esperaDeReanalise'

const agora = new Date('2026-10-13T12:00:00Z')
const haMs = (ms: number) => new Date(agora.getTime() - ms)

describe('falhouHaPouco', () => {
  it('bloqueia nova análise logo depois de uma falha', () => {
    expect(falhouHaPouco({ status: 'FAILED', errorMsg: 'x', updatedAt: haMs(5 * 60_000) }, false, agora)).toBe(true)
  })

  it('libera depois da espera de falha', () => {
    expect(falhouHaPouco({ status: 'FAILED', errorMsg: 'x', updatedAt: haMs(ESPERA_APOS_FALHA_MS + 1) }, false, agora)).toBe(false)
  })

  it('espera mais quando o edital não tinha documentos', () => {
    const analise = { status: 'NO_DOCUMENTS' as const, errorMsg: null, updatedAt: haMs(ESPERA_APOS_FALHA_MS + 1) }
    expect(falhouHaPouco(analise, false, agora)).toBe(true)
    expect(falhouHaPouco({ ...analise, updatedAt: haMs(ESPERA_APOS_SEM_DOCUMENTOS_MS + 1) }, false, agora)).toBe(false)
  })

  it('admin não espera', () => {
    expect(falhouHaPouco({ status: 'FAILED', errorMsg: 'x', updatedAt: agora }, true, agora)).toBe(false)
  })

  it('não se aplica a análises concluídas ou desligadas', () => {
    expect(falhouHaPouco({ status: 'DONE', errorMsg: null, updatedAt: agora }, false, agora)).toBe(false)
    expect(falhouHaPouco({ status: 'DISABLED', errorMsg: null, updatedAt: agora }, false, agora)).toBe(false)
  })
})
