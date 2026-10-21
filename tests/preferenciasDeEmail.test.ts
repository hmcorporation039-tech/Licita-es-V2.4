import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    tenderMatch: { findMany: vi.fn() },
    tenderParticipationPlan: { findMany: vi.fn() },
    companyDocument: { findMany: vi.fn(), update: vi.fn() },
    notification: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    tender: { findUnique: vi.fn() },
  },
  email: {
    sendResumoDiarioEmail: vi.fn(async () => true),
    sendLembreteDePrazoEmail: vi.fn(async () => true),
    sendDocumentExpiryEmail: vi.fn(async () => undefined),
    sendTenderChangedEmail: vi.fn(async () => undefined),
  },
  reserva: {
    reservarNotificacao: vi.fn(async () => true),
    confirmarEnvio: vi.fn(async () => undefined),
    desfazerReservas: vi.fn(async () => undefined),
  },
}))

vi.mock('../src/services/tenderService', () => ({ prisma: dubles.prisma }))
vi.mock('../src/queues', () => ({ redisConnection: {} }))
vi.mock('../src/services/reservaDeNotificacao', () => dubles.reserva)
vi.mock('../src/services/emailService', async (original) => ({ ...(await original<typeof import('../src/services/emailService')>()), ...dubles.email }))

import { enviarResumoDoUsuario } from '../src/services/resumoDiario'
import { enviarLembretesDaEmpresa } from '../src/services/lembreteDePrazo'
import { checkExpiringDocuments } from '../src/services/documentAlertService'
import { processarAlteracao } from '../src/workers/notificador'

const AGORA = new Date('2026-10-21T12:00:00Z')

function usuario(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@teste.local`,
    companyId: 'empresa-1',
    active: true,
    disabledByAdmin: false,
    accessExpiresAt: null,
    isAdmin: false,
    companyRole: 'OWNER',
    company: { users: [{ active: true, disabledByAdmin: false, accessExpiresAt: null }] },
    receberResumoDiario: true,
    receberLembreteDePrazo: true,
    receberAvisoDeDocumento: true,
    receberAvisoDeAlteracao: true,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dubles.prisma.notification.findMany.mockResolvedValue([])
  dubles.prisma.notification.findFirst.mockResolvedValue(null)
})

describe('cada rotina de e-mail pula quem desligou o aviso', () => {
  it('resumo diário: quem desligou não recebe e nem tem os matches consultados', async () => {
    dubles.prisma.user.findUnique.mockResolvedValue(usuario('u1', { receberResumoDiario: false }))
    expect(await enviarResumoDoUsuario('u1', AGORA)).toBe('desligado')
    expect(dubles.prisma.tenderMatch.findMany).not.toHaveBeenCalled()
    expect(dubles.email.sendResumoDiarioEmail).not.toHaveBeenCalled()
  })

  it('lembrete de prazo: só quem deixou ligado recebe', async () => {
    const fim = new Date(AGORA.getTime() + 20 * 3_600_000)
    dubles.prisma.tenderParticipationPlan.findMany.mockResolvedValue([
      {
        tender: { id: 't1', objeto: 'Cimento', objetoResumido: null, fonte: 'PNCP', orgao: 'Órgão', municipio: null, uf: 'GO', encerramentoAt: fim, aberturaAt: null },
      },
    ])
    dubles.prisma.user.findMany.mockResolvedValue([usuario('ligado'), usuario('desligado', { receberLembreteDePrazo: false })])
    const resultado = await enviarLembretesDaEmpresa('empresa-1', AGORA)
    expect(resultado).toEqual({ enviados: 1, falhas: 0 })
    expect(dubles.email.sendLembreteDePrazoEmail).toHaveBeenCalledTimes(1)
    expect(dubles.email.sendLembreteDePrazoEmail.mock.calls[0]).toContain('ligado@teste.local')
    expect(dubles.reserva.reservarNotificacao).toHaveBeenCalledTimes(1)
  })

  it('documento perto de vencer: a consulta já deixa de fora quem desligou', async () => {
    dubles.prisma.companyDocument.findMany.mockResolvedValue([])
    await checkExpiringDocuments()
    const consulta = dubles.prisma.companyDocument.findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(consulta.where.user).toEqual({ receberAvisoDeDocumento: true })
  })

  it('licitação alterada: quem desligou não recebe e nada é registrado', async () => {
    dubles.prisma.tender.findUnique.mockResolvedValue({ id: 't1', objeto: 'Cimento', objetoResumido: null, orgao: 'Órgão', encerramentoAt: null, fonte: 'PNCP', linkEdital: null })
    dubles.prisma.user.findUnique.mockResolvedValue(usuario('u1', { receberAvisoDeAlteracao: false }))
    await processarAlteracao({ tipo: 'alteracao', tenderId: 't1', userId: 'u1', campos: ['encerramentoAt'] })
    expect(dubles.email.sendTenderChangedEmail).not.toHaveBeenCalled()
    expect(dubles.prisma.notification.create).not.toHaveBeenCalled()
  })

  it('licitação alterada: com o aviso ligado, o e-mail sai com o link de descadastro quando há segredo', async () => {
    const segredoOriginal = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-bom'
    try {
      dubles.prisma.tender.findUnique.mockResolvedValue({ id: 't1', objeto: 'Cimento', objetoResumido: null, orgao: 'Órgão', encerramentoAt: null, fonte: 'PNCP', linkEdital: null })
      dubles.prisma.user.findUnique.mockResolvedValue(usuario('u1'))
      await processarAlteracao({ tipo: 'alteracao', tenderId: 't1', userId: 'u1', campos: ['encerramentoAt'] })
      expect(dubles.email.sendTenderChangedEmail).toHaveBeenCalledTimes(1)
      const [parametros] = dubles.email.sendTenderChangedEmail.mock.calls[0] as unknown as [{ descadastro?: { pagina: string } }]
      expect(parametros.descadastro?.pagina).toMatch(/\/descadastro\?t=/)
    } finally {
      if (segredoOriginal === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = segredoOriginal
    }
  })
})
