import { X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SESC_UNIDADES } from '../src/services/sescRegional'
import {
  GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025,
  agenteDaUnidade,
} from '../src/services/sescRegional/certificados'
import { sescMT } from '../src/services/sescRegional/mt'
import { sescDF } from '../src/services/sescRegional/df'
import { publicadaRecentemente } from '../src/services/sescRegional/tipos'

const AGORA = new Date(2026, 8, 30, 12, 0)

describe('registro das unidades do SESC Regional', () => {
  it('cobre as 10 unidades da Fase 1, sem repetir UF', () => {
    const ufs = SESC_UNIDADES.map((u) => u.uf).sort()
    expect(ufs).toEqual(['AL', 'AM', 'CE', 'DF', 'MA', 'MS', 'MT', 'PA', 'SC', 'SE'])
    expect(new Set(ufs).size).toBe(ufs.length)
  })

  it('toda unidade tem nome "Sesc ...", URL https e parse', () => {
    for (const u of SESC_UNIDADES) {
      expect(u.nome).toMatch(/^Sesc /)
      expect(typeof u.parse).toBe('function')
      const urls = u.urls(AGORA)
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) expect(url).toMatch(/^https:\/\//)
    }
  })
})

describe('certificado intermediário do MT', () => {
  const cert = new X509Certificate(GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025)

  it('é o intermediário da GlobalSign, emitido pela raiz R6', () => {
    expect(cert.subject).toContain('GlobalSign GCC R6 AlphaSSL CA 2025')
    expect(cert.issuer).toContain('GlobalSign Root CA - R6')
    expect(cert.ca).toBe(true)
  })

  it('só o MT declara certificado extra; as demais usam as raízes normais', () => {
    expect(sescMT.certificadosConfiaveis).toEqual([GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025])
    for (const u of SESC_UNIDADES.filter((x) => x.uf !== 'MT')) {
      expect(u.certificadosConfiaveis).toBeUndefined()
      expect(agenteDaUnidade(u)).toBeUndefined()
    }
    expect(agenteDaUnidade(sescMT)).toBeDefined()
  })

  it('o MT abre a página de sessão antes (cookie + Referer)', () => {
    expect(sescMT.sessaoUrl).toMatch(/^https:\/\/www\.sescmt\.com\.br\//)
  })
})

describe('recência da publicação (portais sem data de sessão)', () => {
  it('aceita publicação dentro da janela e recusa antiga ou ausente', () => {
    expect(publicadaRecentemente(new Date(2026, 8, 1), AGORA)).toBe(true)
    expect(publicadaRecentemente(new Date(2026, 7, 10), AGORA)).toBe(true) // ~51 dias
    expect(publicadaRecentemente(new Date(2026, 5, 1), AGORA)).toBe(false) // ~121 dias
    expect(publicadaRecentemente(undefined, AGORA)).toBe(false)
  })

  it('o DF (sem data de sessão) usa essa regra', () => {
    expect(sescDF.urls(AGORA)[0]).toContain('portal-de-compras')
  })
})
