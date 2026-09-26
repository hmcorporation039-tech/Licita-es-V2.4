import { describe, expect, it } from 'vitest'
import { descreverAlvo, ehBancoLocal, hostDoBanco } from '../scripts/lib/alvoDoBanco'

describe('ehBancoLocal', () => {
  it('reconhece os endereços locais', () => {
    expect(ehBancoLocal('postgresql://postgres:senha@localhost:5432/licitacao')).toBe(true)
    expect(ehBancoLocal('postgresql://postgres:senha@127.0.0.1:5432/licitacao')).toBe(true)
    expect(ehBancoLocal('postgresql://postgres:senha@[::1]:5432/licitacao')).toBe(true)
    expect(ehBancoLocal('postgresql://postgres:senha@host.docker.internal:5432/licitacao')).toBe(true)
  })

  it('trata Railway e Supabase como remotos', () => {
    expect(ehBancoLocal('postgresql://postgres:senha@monorail.proxy.rlwy.net:41234/railway')).toBe(false)
    expect(ehBancoLocal('postgresql://postgres:senha@aws-0-us-east-1.pooler.supabase.com:6543/postgres')).toBe(false)
  })

  // Na dúvida, pergunta: URL ilegível não pode virar passe livre para apagar.
  it('não libera quando a URL é ilegível', () => {
    expect(ehBancoLocal('nao e uma url')).toBe(false)
    expect(ehBancoLocal('')).toBe(false)
  })

  it('não confunde host que apenas contém "localhost"', () => {
    expect(ehBancoLocal('postgresql://u:s@localhost.empresa.com.br:5432/db')).toBe(false)
  })
})

describe('hostDoBanco', () => {
  it('extrai o host sem os colchetes do IPv6', () => {
    expect(hostDoBanco('postgresql://u:s@[::1]:5432/db')).toBe('::1')
    expect(hostDoBanco('postgresql://u:s@monorail.proxy.rlwy.net:41234/railway')).toBe('monorail.proxy.rlwy.net')
  })

  it('devolve null para URL inválida', () => {
    expect(hostDoBanco('xyz')).toBeNull()
  })
})

describe('descreverAlvo', () => {
  it('esconde usuário e senha, preservando host e banco', () => {
    const descrito = descreverAlvo('postgresql://postgres:s3nh4-secreta@monorail.proxy.rlwy.net:41234/railway')

    expect(descrito).toBe('postgresql://***:***@monorail.proxy.rlwy.net:41234/railway')
    expect(descrito).not.toContain('s3nh4-secreta')
  })
})
