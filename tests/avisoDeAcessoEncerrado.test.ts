import { beforeEach, describe, expect, it } from 'vitest'
import { caixaDeSaidaDeTeste, enviarAvisoDeAcessoEncerrado, linkDoAcessoEncerrado } from '../src/services/emailTransacional'

describe('e-mail de fim do teste com licitações esperando', () => {
  beforeEach(() => {
    caixaDeSaidaDeTeste.length = 0
  })

  it('diz quantas licitações estão esperando e leva para a tela de acesso encerrado', async () => {
    await enviarAvisoDeAcessoEncerrado('cliente@exemplo.com', { licitacoesEsperando: 3, emTeste: true })
    const [msg] = caixaDeSaidaDeTeste
    expect(msg.to).toBe('cliente@exemplo.com')
    expect(msg.subject).toBe('Seu teste terminou: 3 licitações novas esperando por você')
    expect(msg.link).toBe(linkDoAcessoEncerrado())
    expect(msg.link).toMatch(/\/acesso-encerrado$/)
    expect(msg.html).toContain('Seu teste grátis terminou')
    expect(msg.html).toContain('3 licitações novas esperando')
  })

  it('no singular e para conta que não estava em teste', async () => {
    await enviarAvisoDeAcessoEncerrado('cliente@exemplo.com', { licitacoesEsperando: 1, emTeste: false })
    expect(caixaDeSaidaDeTeste[0].subject).toBe('Seu acesso terminou: 1 licitação nova esperando por você')
    expect(caixaDeSaidaDeTeste[0].html).toContain('O acesso da sua conta terminou')
  })
})
