import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const rodar = describe.skipIf(!process.env.TEST_DATABASE_URL)

rodar('Cofre Meus Portais (integração)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let companyId = ''

  beforeAll(async () => {
    process.env.CREDENCIAIS_PORTAL_CHAVE = Buffer.alloc(32, 7).toString('base64')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const company = await prisma.company.create({ data: { name: `Teste Cofre ${randomUUID().slice(0, 6)}`, planCode: 'TESTE' } })
    companyId = company.id
  })

  afterAll(async () => {
    if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
  })

  it('salva cifrado, lista mascarado sem a senha, decifra, isola por empresa e remove', async () => {
    const svc = await import('../../src/services/meusPortais')
    const { id } = await svc.salvarCredencial(companyId, {
      portal: 'COMPRASNET',
      login: 'empresa@teste.com',
      senha: 'SenhaForte!99',
      consentimentoTexto: 'Autorizo a Bela a usar este acesso.',
    })

    const lista = await svc.listarCredenciais(companyId)
    expect(lista).toHaveLength(1)
    expect(JSON.stringify(lista)).not.toContain('SenhaForte!99')
    expect(lista[0].login).not.toBe('empresa@teste.com')
    expect(lista[0].temConsentimento).toBe(true)

    const row = await prisma.portalCredencial.findUnique({ where: { id } })
    expect(Buffer.from(row.senhaCifrada).toString('utf8')).not.toContain('SenhaForte!99')
    expect(Buffer.from(row.senhaCifrada).toString('latin1')).not.toContain('SenhaForte!99')

    expect(await svc.senhaDaCredencial(companyId, id)).toBe('SenhaForte!99')
    await expect(svc.senhaDaCredencial(`outra-${companyId}`, id)).rejects.toThrow()

    await svc.removerCredencial(companyId, id)
    expect(await svc.listarCredenciais(companyId)).toHaveLength(0)
  })

  it('recusa portal que não está no registro', async () => {
    const svc = await import('../../src/services/meusPortais')
    await expect(
      svc.salvarCredencial(companyId, { portal: 'NAO_EXISTE', login: 'x', senha: 'y', consentimentoTexto: 'z' }),
    ).rejects.toThrow()
  })
})
