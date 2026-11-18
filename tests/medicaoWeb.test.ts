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
    const { utmParaEnvio } = await import('../web/src/lib/origemDoAnuncio')
    expect(utmParaEnvio({ gclid: 'abc123' }, true)).toEqual({ gclid: 'abc123', utm_source: 'google', utm_medium: 'cpc' })
  })

  it('com a medição recusada, não manda o identificador, mas continua contando como google / cpc', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/origemDoAnuncio')
    expect(utmParaEnvio({ gclid: 'abc123' }, false)).toEqual({ utm_source: 'google', utm_medium: 'cpc' })
    expect(utmParaEnvio({ gbraid: 'x' }, false)).toEqual({ utm_source: 'google', utm_medium: 'cpc' })
  })

  it('respeita a fonte e a campanha que já vieram no link (sufixo do anúncio)', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/origemDoAnuncio')
    expect(utmParaEnvio({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'lb-teste-5-dias', gclid: 'abc' }, false)).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'lb-teste-5-dias',
    })
    expect(utmParaEnvio({ utm_source: 'instagram' }, false)).toEqual({ utm_source: 'instagram' })
  })

  it('sem nada guardado, não manda origem (cadastro direto)', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/origemDoAnuncio')
    expect(utmParaEnvio(null, true)).toBeUndefined()
    expect(utmParaEnvio({ capturadoEm: '2026-11-18T00:00:00Z' }, true)).toBeUndefined()
  })
})

describe('Pixel da Meta', () => {
  it('usa o pixel da Licita Bela por padrão, aceita troca e pode ser desligado', async () => {
    const { idDoPixelDaMeta } = await import('../web/src/lib/medicao')
    expect(idDoPixelDaMeta(undefined)).toBe('1675739133906804')
    expect(idDoPixelDaMeta('123456789012345')).toBe('123456789012345')
    expect(idDoPixelDaMeta('desligado')).toBeNull()
    expect(idDoPixelDaMeta('abc')).toBeNull()
  })

  it('só carrega nas páginas públicas, nunca dentro do sistema nem na troca de senha', async () => {
    const { paginaComPixel } = await import('../web/src/lib/medicao')
    for (const p of ['/', '/cadastro', '/verificar-email', '/login', '/licitacoes', '/licitacoes/obras/df', '/privacidade', '/termos']) {
      expect(paginaComPixel(p)).toBe(true)
    }
    for (const p of ['/dashboard', '/tenders/abc', '/tenders/abc/pregao', '/escolhidas/x', '/empresa', '/redefinir-senha', '/esqueci-senha', '/descadastro', '/cadastrox', null]) {
      expect(paginaComPixel(p)).toBe(false)
    }
  })

  it('traduz nossos eventos para os eventos padrão da Meta', async () => {
    const { eventoDaMeta } = await import('../web/src/lib/medicao')
    expect(eventoDaMeta('cadastro_enviado')).toEqual({ padrao: 'Lead' })
    expect(eventoDaMeta('begin_checkout')).toEqual({ padrao: 'InitiateCheckout' })
    expect(eventoDaMeta('clique_whatsapp')).toEqual({ padrao: 'Contact' })
    expect(eventoDaMeta('busca_vitrine')).toEqual({ personalizado: 'busca_vitrine' })
    // O cadastro concluído sai à parte, com o id para não contar duas vezes.
    expect(eventoDaMeta('sign_up')).toBeNull()
  })

  it('monta o cookie _fbc a partir do fbclid guardado', async () => {
    const { valorDoCookieFbc } = await import('../web/src/lib/medicao')
    expect(valorDoCookieFbc('IwAR1abcDEF_-x', '2026-11-18T12:00:00Z')).toBe(`fb.1.${Date.parse('2026-11-18T12:00:00Z')}.IwAR1abcDEF_-x`)
    expect(valorDoCookieFbc(undefined, undefined)).toBeNull()
    expect(valorDoCookieFbc('com espaço;', undefined)).toBeNull()
  })

  it('meta tag de verificação do domínio só com código válido', async () => {
    const { verificacaoDoDominioDaMeta } = await import('../web/src/lib/medicao')
    expect(verificacaoDoDominioDaMeta('abcdef0123456789abcdef0123456')).toBe('abcdef0123456789abcdef0123456')
    expect(verificacaoDoDominioDaMeta('<script>')).toBeNull()
  })
})

describe('origem do cadastro vinda de anúncio da Meta', () => {
  it('com o aceite manda o fbclid; sem o aceite, só meta / paid_social', async () => {
    const { utmParaEnvio } = await import('../web/src/lib/origemDoAnuncio')
    expect(utmParaEnvio({ fbclid: 'IwAR1abc' }, true)).toEqual({ fbclid: 'IwAR1abc', utm_source: 'meta', utm_medium: 'paid_social' })
    expect(utmParaEnvio({ fbclid: 'IwAR1abc' }, false)).toEqual({ utm_source: 'meta', utm_medium: 'paid_social' })
    expect(utmParaEnvio({ utm_source: 'meta', utm_campaign: 'lb-meta-brasil', fbclid: 'x' }, false)).toEqual({ utm_source: 'meta', utm_campaign: 'lb-meta-brasil' })
  })
})

describe('verificação do domínio da Meta', () => {
  it('usa o código do portfólio por padrão', async () => {
    const { verificacaoDoDominioDaMeta } = await import('../web/src/lib/medicao')
    expect(verificacaoDoDominioDaMeta(undefined)).toBe('gsh0mgsngmg9m52sjy1ad1icbbmu38')
  })
})
