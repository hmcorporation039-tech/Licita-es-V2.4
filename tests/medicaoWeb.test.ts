import { describe, expect, it } from 'vitest'
import { guardarEscolha, idDaMedicao, lerEscolha } from '../web/src/lib/medicao'

function memoria() {
  const dados = new Map<string, string>()
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v) }
}

describe('Google Analytics com consentimento', () => {
  it('usa o ID da Licita Bela por padrão, aceita troca e pode ser desligado', () => {
    expect(idDaMedicao(undefined)).toBe('G-ZJQHVTXD35')
    expect(idDaMedicao('G-ABC1234')).toBe('G-ABC1234')
    expect(idDaMedicao('desligado')).toBeNull()
    expect(idDaMedicao('qualquer-coisa')).toBeNull()
  })

  it('sem escolha guardada o aviso aparece; a escolha fica guardada', () => {
    const a = memoria()
    expect(lerEscolha(a)).toBeNull()
    guardarEscolha('recusada', a)
    expect(lerEscolha(a)).toBe('recusada')
    guardarEscolha('aceita', a)
    expect(lerEscolha(a)).toBe('aceita')
  })

  it('valor estranho no armazenamento conta como sem escolha', () => {
    const a = memoria()
    a.setItem('licita-bela:medicao', 'talvez')
    expect(lerEscolha(a)).toBeNull()
    expect(lerEscolha(null)).toBeNull()
  })
})

describe('origem do cadastro vinda de anúncio do Google', () => {
  it('com a medição aceita, manda o identificador do clique e marca google / cpc', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/rastreamento')
    expect(utmParaEnvio({ gclid: 'abc123' }, true)).toEqual({ gclid: 'abc123', utm_source: 'google', utm_medium: 'cpc' })
  })

  it('com a medição recusada, não manda o identificador, mas continua contando como google / cpc', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/rastreamento')
    expect(utmParaEnvio({ gclid: 'abc123' }, false)).toEqual({ utm_source: 'google', utm_medium: 'cpc' })
    expect(utmParaEnvio({ gbraid: 'x' }, false)).toEqual({ utm_source: 'google', utm_medium: 'cpc' })
  })

  it('respeita a fonte e a campanha que já vieram no link (sufixo do anúncio)', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/rastreamento')
    expect(utmParaEnvio({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'lb-teste-5-dias', gclid: 'abc' }, false)).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'lb-teste-5-dias',
    })
    expect(utmParaEnvio({ utm_source: 'instagram' }, false)).toEqual({ utm_source: 'instagram' })
  })

  it('sem nada guardado, não manda origem (cadastro direto)', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/rastreamento')
    expect(utmParaEnvio(null, true)).toBeUndefined()
    expect(utmParaEnvio({ capturadoEm: '2026-11-18T00:00:00Z' }, true)).toBeUndefined()
  })
})
