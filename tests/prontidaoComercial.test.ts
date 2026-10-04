import { beforeEach, describe, expect, it } from 'vitest'
import { alertarFalha, avisarAdministrador, deveAlertar, limparSilencio, semSegredos } from '../src/services/alertaOperacional'
import { captchaValido, emailDescartavel, maxCadastrosPorHora } from '../src/lib/protecaoCadastro'
import { jwtSecretFraco } from '../src/services/authService'

describe('semSegredos', () => {
  it('remove senha de URL de banco, Bearer, JWT e chaves de API', () => {
    const t = semSegredos(
      'postgresql://postgres:SENHA123@host:5432/db redis://default:x@r:6379 Bearer abc.def ' +
        'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.c2lnbmF0dXJh sk-ant-api03-ABCDEFGHIJKLMNOP AIzaSyAbcdefghijklmnop re_AbCdEfGh1234'
    )
    expect(t).not.toMatch(/SENHA123|default:x|abc\.def|eyJ1c2Vy|ABCDEFGHIJKLMNOP|bcdefghijklmnop|EfGh1234/)
    expect(t).toContain('postgresql://***@host')
  })
})

describe('alertas ao administrador', () => {
  beforeEach(() => limparSilencio())
  const env = { ALERT_WEBHOOK_URL: 'https://hooks.exemplo/x', ALERT_EMAIL: 'admin@exemplo.com', NODE_ENV: 'production' }

  it('sem destino configurado não faz nada', async () => {
    expect(await alertarFalha('api', 'GET /x', new Error('e'), {})).toBe(false)
  })

  it('envia ao webhook e ao e-mail, sem segredos, e silencia repetições por 15 min', async () => {
    const enviados: unknown[] = []
    const envios = {
      webhook: async (_u: string, c: unknown) => void enviados.push(c),
      email: async (_p: string, assunto: string, texto: string) => void enviados.push({ assunto, texto }),
    }
    const erro = new Error('falhou conectando em postgresql://u:SEGREDO@h/db')
    expect(await alertarFalha('api', 'GET /api/tenders/:id', erro, env, envios)).toBe(true)
    expect(enviados).toHaveLength(2)
    expect(JSON.stringify(enviados)).not.toContain('SEGREDO')
    expect(JSON.stringify(enviados)).toContain('GET /api/tenders/:id')
    expect(await alertarFalha('api', 'GET /api/tenders/:id', erro, env, envios)).toBe(false)
    expect(await alertarFalha('api', 'POST /api/outra', erro, env, envios)).toBe(true)
  })

  it('falha ao enviar não lança (alertar não derruba quem alertou)', async () => {
    const envios = {
      webhook: async () => {
        throw new Error('webhook fora')
      },
      email: async () => undefined,
    }
    await expect(alertarFalha('api', 'x', 'string de erro', env, envios)).resolves.toBe(true)
  })

  it('avisos (não falhas) também chegam e respeitam o silêncio', async () => {
    const enviados: string[] = []
    const envios = { webhook: async () => undefined, email: async (_p: string, a: string) => void enviados.push(a) }
    expect(await avisarAdministrador('exclusao|1', 'Pedido de exclusão', 'texto', env, envios)).toBe(true)
    expect(enviados[0]).toMatch(/Pedido de exclusão/)
    expect(await avisarAdministrador('exclusao|1', 'Pedido de exclusão', 'texto', env, envios)).toBe(false)
  })

  it('deveAlertar volta a liberar depois de 15 min', () => {
    expect(deveAlertar('k', 0)).toBe(true)
    expect(deveAlertar('k', 14 * 60_000)).toBe(false)
    expect(deveAlertar('k', 16 * 60_000)).toBe(true)
  })
})

describe('proteção do cadastro', () => {
  it('reconhece e-mail descartável, inclusive subdomínio', () => {
    expect(emailDescartavel('a@mailinator.com')).toBe(true)
    expect(emailDescartavel('a@x.mailinator.com')).toBe(true)
    expect(emailDescartavel('A@YOPMAIL.COM')).toBe(true)
    expect(emailDescartavel('a@gmail.com')).toBe(false)
    expect(emailDescartavel('a@empresa.com.br')).toBe(false)
    expect(emailDescartavel('sem-arroba')).toBe(false)
  })

  it('teto de cadastros por hora: padrão 60, configurável', () => {
    expect(maxCadastrosPorHora({})).toBe(60)
    expect(maxCadastrosPorHora({ CADASTRO_MAX_POR_HORA: '10' })).toBe(10)
    expect(maxCadastrosPorHora({ CADASTRO_MAX_POR_HORA: '-1' })).toBe(60)
  })

  it('captcha: desligado libera; ligado exige resposta válida e falha de rede NÃO libera', async () => {
    expect(await captchaValido(undefined, '1.1.1.1', {})).toBe(true)
    const env = { TURNSTILE_SECRET_KEY: 'segredo' }
    expect(await captchaValido(undefined, '1.1.1.1', env, async () => ({ success: true }))).toBe(false)
    let corpoEnviado = ''
    expect(
      await captchaValido('resp', '1.1.1.1', env, async (_u, c) => {
        corpoEnviado = c.toString()
        return { success: true }
      })
    ).toBe(true)
    expect(corpoEnviado).toContain('secret=segredo')
    expect(corpoEnviado).toContain('response=resp')
    expect(await captchaValido('resp', undefined, env, async () => ({ success: false }))).toBe(false)
    expect(
      await captchaValido('resp', undefined, env, async () => {
        throw new Error('rede')
      })
    ).toBe(false)
  })
})

describe('JWT_SECRET', () => {
  it('segredo com menos de 32 caracteres é considerado fraco', () => {
    expect(jwtSecretFraco({ JWT_SECRET: 'segredo123' })).toBe(true)
    expect(jwtSecretFraco({})).toBe(true)
    expect(jwtSecretFraco({ JWT_SECRET: 'x'.repeat(48) })).toBe(false)
  })
})
