import { X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SESC_UNIDADES } from '../src/services/sescRegional'
import {
  GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025,
  SECTIGO_DV_R36_CA,
  agenteDaUnidade,
} from '../src/services/sescRegional/certificados'
import { sescMT } from '../src/services/sescRegional/mt'
import { sescDF } from '../src/services/sescRegional/df'
import { publicadaRecentemente } from '../src/services/sescRegional/tipos'

const AGORA = new Date(2026, 8, 30, 12, 0)

describe('registro das unidades do SESC Regional', () => {
  it('cobre as 27 unidades da planilha (Fases 1 a 3) (DN e RJ dividem a UF, mas têm chaves distintas)', () => {
    const chaves = SESC_UNIDADES.map((u) => u.chave ?? u.uf).sort()
    expect(chaves).toEqual([
      'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'DN', 'ES', 'MA', 'MG', 'MS', 'MT',
      'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
    ])
    // A chave é o prefixo do fonteId: não pode repetir, senão as unidades colidem.
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  // Únicas unidades cujo portal só é servido em HTTP puro (sem TLS). Qualquer
  // outra unidade nova precisa ser https.
  const SO_HTTP = ['AC']

  it('toda unidade tem nome "Sesc ...", URL https (exceto as sem TLS) e parse', () => {
    for (const u of SESC_UNIDADES) {
      expect(u.nome).toMatch(/^Sesc /)
      expect(typeof u.parse).toBe('function')
      const urls = u.urls(AGORA)
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) expect(url).toMatch(SO_HTTP.includes(u.uf) ? /^https?:\/\// : /^https:\/\//)
    }
  })
})

describe('certificados intermediários (servidores com cadeia TLS incompleta)', () => {
  // Unidades cujo servidor não envia o intermediário: MT (GlobalSign) e RR (Sectigo).
  const COM_CERTIFICADO = ['MT', 'RR']

  it('o intermediário do MT é da GlobalSign, emitido pela raiz R6', () => {
    const cert = new X509Certificate(GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025)
    expect(cert.subject).toContain('GlobalSign GCC R6 AlphaSSL CA 2025')
    expect(cert.issuer).toContain('GlobalSign Root CA - R6')
    expect(cert.ca).toBe(true)
  })

  it('o intermediário do RR é da Sectigo, emitido pela raiz R46', () => {
    const cert = new X509Certificate(SECTIGO_DV_R36_CA)
    expect(cert.subject).toContain('Sectigo Public Server Authentication CA DV R36')
    expect(cert.issuer).toContain('Sectigo Public Server Authentication Root R46')
    expect(cert.ca).toBe(true)
  })

  it('só MT e RR declaram certificado extra, e cada um é um certificado de CA válido', () => {
    for (const u of SESC_UNIDADES) {
      const k = u.chave ?? u.uf
      if (COM_CERTIFICADO.includes(k)) {
        expect(u.certificadosConfiaveis?.length).toBe(1)
        for (const pem of u.certificadosConfiaveis!) expect(new X509Certificate(pem).ca).toBe(true)
        expect(agenteDaUnidade(u)).toBeDefined()
      } else {
        // As demais usam as raízes normais: nada de confiar em certificado avulso.
        expect(u.certificadosConfiaveis).toBeUndefined()
        expect(agenteDaUnidade(u)).toBeUndefined()
      }
    }
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
