import { describe, expect, it } from 'vitest'
import { PORTAIS, idsDePortais, mascararLogin, portalPorId } from '../src/lib/portais'

describe('registro de portais', () => {
  it('tem o Compras.gov.br e os principais, todos com campos obrigatórios', () => {
    expect(idsDePortais()).toContain('COMPRASNET')
    expect(PORTAIS.length).toBeGreaterThanOrEqual(8)
    for (const p of PORTAIS) {
      expect(p.id).toMatch(/^[A-Z0-9_]+$/)
      expect(p.nome.length).toBeGreaterThan(0)
      expect(p.hosts.length).toBeGreaterThan(0)
      expect(['confirmar', 'permitida', 'vedada']).toContain(p.automacao)
    }
  })

  it('não tem ids repetidos', () => {
    expect(new Set(idsDePortais()).size).toBe(PORTAIS.length)
  })

  it('portalPorId acha e devolve null para desconhecido', () => {
    expect(portalPorId('COMPRASNET')?.nome).toBe('Compras.gov.br')
    expect(portalPorId('NAO_EXISTE')).toBeNull()
  })
})

describe('mascararLogin', () => {
  it('mascara e-mail preservando o domínio', () => {
    expect(mascararLogin('empresa@teste.com')).toBe('em•••••@teste.com')
  })

  it('mascara login comum deixando início e fim', () => {
    expect(mascararLogin('usuario123')).toBe('us•••••••3')
  })

  it('não vaza logins muito curtos', () => {
    expect(mascararLogin('ab')).toBe('••')
  })
})

describe('portal da licitação (portal dentro da Bela)', () => {
  it('acha o portal pelo link do processo, depois pelo nome da plataforma', async () => {
    const { portalDaLicitacao, inicioNoPortal, portalDoHost, portalPorId } = await import('../src/lib/portais')
    expect(portalDaLicitacao({ linkEdital: 'https://www.licitanet.com.br/processo/1' })?.id).toBe('LICITANET')
    expect(portalDaLicitacao({ linkEdital: 'https://pncp.gov.br/app/editais/1', plataformaDeOrigem: 'BLL COMPRAS' })?.id).toBe('BLL')
    expect(portalDaLicitacao({ plataformaDeOrigem: 'Portal de Compras Públicas' })?.id).toBe('PCP')
    expect(portalDaLicitacao({ plataformaDeOrigem: 'Compras.gov.br' })?.id).toBe('COMPRASNET')
    expect(portalDaLicitacao({ plataformaDeOrigem: 'Prefeitura Municipal de Vitória' })).toBeNull()
    expect(portalDaLicitacao({ fonte: 'COMPRASNET' })?.id).toBe('COMPRASNET')
    expect(portalDoHost('bll.org.br.example.com')).toBeNull()
    const bll = portalPorId('BLL')!
    expect(inicioNoPortal(bll, 'https://bllcompras.com/Process/1')).toBe('https://bllcompras.com/Process/1')
    expect(inicioNoPortal(bll, 'https://pncp.gov.br/app/editais/1')).toBe(bll.inicio)
    expect(inicioNoPortal(bll, 'http://bllcompras.com/Process/1')).toBe(bll.inicio)
  })
})

describe('portais que abrem dentro da Bela', () => {
  it('só o Compras.gov.br abre no quadro; os particulares vão para a aba com a extensão', async () => {
    const { PORTAIS: todos } = await import('../src/lib/portais')
    expect(todos.filter((p) => p.abreDentroDaBela).map((p) => p.id)).toEqual(['COMPRASNET'])
  })

  it('a extensão cobre todos os domínios dos portais do catálogo', async () => {
    const { hostsDosPortais } = await import('../src/lib/portais')
    const { portalDoHost: daExtensao } = await import('../extensao-bela/config.mjs')
    for (const host of hostsDosPortais()) expect(daExtensao(host), host).not.toBeNull()
  })
})
