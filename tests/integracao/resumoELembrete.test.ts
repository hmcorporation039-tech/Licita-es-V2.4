import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/emailService', async (original) => ({
  ...(await original<typeof import('../../src/services/emailService')>()),
  sendMatchEmail: vi.fn(async () => undefined),
  sendResumoDiarioEmail: vi.fn(async () => true),
  sendLembreteDePrazoEmail: vi.fn(async () => true),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)
const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS

rodar('Resumo diário e lembrete de prazo por e-mail', () => {
  let prisma: typeof import('../../src/services/tenderService').prisma
  let email: typeof import('../../src/services/emailService')
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `rl-${sufixo}-`
  const empresaPrefixo = `Resumo ${sufixo}`

  const licitacao = (nome: string, extra: Partial<Prisma.TenderUncheckedCreateInput> = {}) =>
    prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `${prefixo}${nome}`,
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: `Objeto ${nome}`,
        objetoNorm: `objeto ${nome}`,
        orgao: `Órgão ${nome}`,
        municipio: 'Goiânia',
        uf: 'GO',
        rawJson: {},
        publicadoAt: new Date(Date.now() - DIA_MS),
        encerramentoAt: new Date(Date.now() + 10 * DIA_MS),
        ...extra,
      },
    })

  const conta = async (nome: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}, companyId?: string) => {
    const base = { email: `${prefixo}${nome}@teste.local`, passwordHash: 'x', emailVerifiedAt: new Date(), ...extra }
    if (companyId) return prisma.user.create({ data: { ...base, companyId } })
    const empresa = await prisma.company.create({ data: { name: `${empresaPrefixo} ${nome}` } })
    return prisma.user.create({ data: { ...base, companyId: empresa.id } })
  }

  const item = (user: { id: string; companyId: string }, nome: string) =>
    prisma.monitoredItem.create({ data: { name: nome, keywords: [`${nome.toLowerCase()}${sufixo}`], companyId: user.companyId, userId: user.id } })

  const casar = (user: { id: string; companyId: string }, itemId: string, tenderId: string, extra: Partial<Prisma.TenderMatchUncheckedCreateInput> = {}) =>
    prisma.tenderMatch.create({ data: { tenderId, monitoredItemId: itemId, companyId: user.companyId, userId: user.id, score: 0.8, matchedKeywords: ['x'], ...extra } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.REDIS_URL = 'redis://127.0.0.1:1'
    ;({ prisma } = await import('../../src/services/tenderService'))
    email = await import('../../src/services/emailService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
  }, 120_000)

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: prefixo } } } })
    await prisma.tenderParticipationPlan.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tenderMatch.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    await prisma.monitoredItem.deleteMany({ where: { company: { name: { startsWith: empresaPrefixo } } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { name: { startsWith: empresaPrefixo } } })
    desconectar()
    await prisma.$disconnect()
  }, 120_000)

  describe('resumo diário', () => {
    let user: { id: string; companyId: string; email: string }
    const ids: Record<string, string> = {}
    let agora = new Date()

    beforeAll(async () => {
      user = await conta('resumo')
      const cimento = await item(user, 'Cimento')
      const areia = await item(user, 'Areia')
      const dupla = await licitacao('dupla', { encerramentoAt: new Date(Date.now() + 3 * DIA_MS) })
      const longe = await licitacao('longe', { encerramentoAt: new Date(Date.now() + 12 * DIA_MS) })
      const obra = await licitacao('obra', { encerramentoAt: new Date(Date.now() + 2 * DIA_MS) })
      const encerrada = await licitacao('encerrada', { encerramentoAt: new Date(Date.now() - DIA_MS) })
      Object.assign(ids, { dupla: dupla.id, longe: longe.id, obra: obra.id, encerrada: encerrada.id })
      await casar(user, cimento.id, dupla.id)
      await casar(user, areia.id, dupla.id)
      await casar(user, cimento.id, longe.id)
      await casar(user, areia.id, obra.id, { dentroDeObraCompleta: true })
      await casar(user, cimento.id, encerrada.id)
      ids.cimento = cimento.id
      agora = new Date()
    }, 60_000)

    const enviadosPara = (to: string) => vi.mocked(email.sendResumoDiarioEmail).mock.calls.filter(([destino]) => destino === to)

    it('junta os matches de vários itens sem repetir licitação, deixa a encerrada de fora e põe obra completa no fim', async () => {
      const { enviarResumoDoUsuario, idDoResumoDiario } = await import('../../src/services/resumoDiario')
      const { diaDeBrasilia } = await import('../../src/lib/dataDeBrasilia')
      vi.mocked(email.sendResumoDiarioEmail).mockClear()

      expect(await enviarResumoDoUsuario(user.id, agora)).toBe('enviado')
      const chamadas = enviadosPara(user.email)
      expect(chamadas).toHaveLength(1)
      const licitacoes = chamadas[0][1]
      expect(licitacoes.map((l) => l.tenderId)).toEqual([ids.dupla, ids.longe, ids.obra])
      expect(licitacoes[0].itens.sort()).toEqual(['Areia', 'Cimento'])
      expect(email.montarEmailDoResumoDiario(licitacoes).assunto).toBe('3 licitações novas para você hoje')

      const registro = await prisma.notification.findUnique({ where: { id: idDoResumoDiario(user.id, diaDeBrasilia(agora)) } })
      const metadata = registro?.metadata as { resumoDiario: string; tenderMatchIds: string[] }
      expect(registro?.sentAt).not.toBeNull()
      expect(metadata.resumoDiario).toBe(diaDeBrasilia(agora))
      expect(metadata.tenderMatchIds).toHaveLength(4)
    }, 60_000)

    it('não reenvia no mesmo dia, mesmo rodando de novo', async () => {
      const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
      vi.mocked(email.sendResumoDiarioEmail).mockClear()
      expect(await enviarResumoDoUsuario(user.id, new Date(agora.getTime() + 60_000))).toBe('ja-enviado')
      const outros = await Promise.all([enviarResumoDoUsuario(user.id, agora), enviarResumoDoUsuario(user.id, agora)])
      expect(outros).toEqual(['ja-enviado', 'ja-enviado'])
      expect(enviadosPara(user.email)).toHaveLength(0)
    }, 60_000)

    it('o próximo resumo só traz o que é novo', async () => {
      const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
      const amanha = new Date(agora.getTime() + DIA_MS)
      const nova = await licitacao('nova', { encerramentoAt: new Date(Date.now() + 5 * DIA_MS) })
      await casar(user, ids.cimento, nova.id, { createdAt: new Date(agora.getTime() + 12 * HORA_MS) })
      vi.mocked(email.sendResumoDiarioEmail).mockClear()

      expect(await enviarResumoDoUsuario(user.id, amanha)).toBe('enviado')
      expect(enviadosPara(user.email)[0][1].map((l) => l.tenderId)).toEqual([nova.id])

      expect(await enviarResumoDoUsuario(user.id, new Date(amanha.getTime() + DIA_MS))).toBe('sem-novidade')
    }, 60_000)

    it('se o Resend recusa, não marca como enviado e a próxima rodada envia', async () => {
      const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
      const outro = await conta('falha')
      const cal = await item(outro, 'Cal')
      const t = await licitacao('falha')
      await casar(outro, cal.id, t.id)

      const depois = new Date()
      vi.mocked(email.sendResumoDiarioEmail).mockRejectedValueOnce(new Error('Resend recusou'))
      await expect(enviarResumoDoUsuario(outro.id, depois)).rejects.toThrow('Resend recusou')
      expect(await prisma.notification.count({ where: { userId: outro.id } })).toBe(0)

      vi.mocked(email.sendResumoDiarioEmail).mockClear()
      expect(await enviarResumoDoUsuario(outro.id, depois)).toBe('enviado')
      expect(enviadosPara(outro.email)).toHaveLength(1)
    }, 60_000)

    it('sem acesso ativo não recebe resumo', async () => {
      const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
      const vencido = await conta('vencido', { accessExpiresAt: new Date(Date.now() - DIA_MS) })
      const brita = await item(vencido, 'Brita')
      const t = await licitacao('vencido')
      await casar(vencido, brita.id, t.id)
      vi.mocked(email.sendResumoDiarioEmail).mockClear()
      expect(await enviarResumoDoUsuario(vencido.id, agora)).toBe('sem-acesso')
      expect(enviadosPara(vencido.email)).toHaveLength(0)
    }, 60_000)

    it('o notificador não manda mais um e-mail por match', async () => {
      const { processarMatch } = await import('../../src/workers/notificador')
      const match = await prisma.tenderMatch.findFirst({ where: { userId: user.id, tenderId: ids.longe } })
      vi.mocked(email.sendMatchEmail).mockClear()
      const antes = await prisma.notification.count({ where: { userId: user.id } })
      await processarMatch({ tenderMatchId: match!.id })
      expect(email.sendMatchEmail).not.toHaveBeenCalled()
      expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(antes)
    }, 60_000)
  })

  describe('lembrete de prazo', () => {
    let dono: { id: string; companyId: string; email: string }
    let colega: { id: string; email: string }
    let desativado: { id: string; email: string }
    const agora = new Date()

    beforeAll(async () => {
      dono = await conta('lembrete')
      colega = await conta('colega', { companyRole: 'MEMBER' }, dono.companyId)
      desativado = await conta('desativado', { companyRole: 'MEMBER', active: false }, dono.companyId)
      const escolhidas = [
        await licitacao('perto-a', { encerramentoAt: new Date(agora.getTime() + 47.5 * HORA_MS) }),
        await licitacao('perto-b', { encerramentoAt: new Date(agora.getTime() + 47.8 * HORA_MS) }),
        await licitacao('distante', { encerramentoAt: new Date(agora.getTime() + 100 * HORA_MS) }),
      ]
      const avaliando = await licitacao('avaliando', { encerramentoAt: new Date(agora.getTime() + 47 * HORA_MS) })
      for (const t of escolhidas) {
        await prisma.tenderParticipationPlan.create({ data: { companyId: dono.companyId, userId: dono.id, tenderId: t.id, status: 'VOU_PARTICIPAR', state: {} } })
      }
      await prisma.tenderParticipationPlan.create({ data: { companyId: dono.companyId, userId: dono.id, tenderId: avaliando.id, status: 'AVALIANDO', state: {} } })
    }, 60_000)

    const rodada = async (horasDepois: number) => {
      const { enviarLembretesDaEmpresa } = await import('../../src/services/lembreteDePrazo')
      vi.mocked(email.sendLembreteDePrazoEmail).mockClear()
      const resultado = await enviarLembretesDaEmpresa(dono.companyId, new Date(agora.getTime() + horasDepois * HORA_MS))
      return { ...resultado, chamadas: vi.mocked(email.sendLembreteDePrazoEmail).mock.calls }
    }

    it('dispara em 48 h e em 24 h, uma vez cada, um e-mail por usuário ativo com as licitações da rodada', async () => {
      const em48 = await rodada(0)
      expect(em48.enviados).toBe(2)
      expect(em48.chamadas.map(([to]) => to).sort()).toEqual([colega.email, dono.email].sort())
      expect(em48.chamadas.every(([, licitacoes]) => licitacoes.map((l) => l.objeto).sort().join() === 'Objeto perto-a,Objeto perto-b')).toBe(true)
      expect(em48.chamadas.some(([to]) => to === desativado.email)).toBe(false)
      expect(email.montarEmailDoLembreteDePrazo(em48.chamadas[0][1], agora).assunto).toBe('Prazo encerrando: 2 licitações escolhidas')

      expect((await rodada(0)).enviados).toBe(0)
      expect((await rodada(1)).enviados).toBe(0)
      expect((await rodada(23)).enviados).toBe(0)

      const em24 = await rodada(24)
      expect(em24.enviados).toBe(2)
      expect(em24.chamadas[0][1]).toHaveLength(2)

      expect((await rodada(25)).enviados).toBe(0)
      expect((await rodada(47)).enviados).toBe(0)
      expect((await rodada(49)).enviados).toBe(0)

      const registros = await prisma.notification.findMany({ where: { userId: dono.id, id: { startsWith: 'lembrete-de-prazo:' } } })
      expect(registros).toHaveLength(4)
      expect(registros.every((r) => r.sentAt !== null)).toBe(true)
      expect(registros.map((r) => (r.metadata as { lembreteDePrazo: string }).lembreteDePrazo).sort()).toEqual(['24h', '24h', '48h', '48h'])
    }, 60_000)

    it('se o envio falha, não marca e a rodada seguinte tenta de novo', async () => {
      const outraEmpresa = await conta('lembrete-falha')
      const t = await licitacao('lembrete-falha', { encerramentoAt: new Date(agora.getTime() + 20 * HORA_MS) })
      await prisma.tenderParticipationPlan.create({ data: { companyId: outraEmpresa.companyId, userId: outraEmpresa.id, tenderId: t.id, status: 'VOU_PARTICIPAR', state: {} } })
      const { enviarLembretesDaEmpresa } = await import('../../src/services/lembreteDePrazo')

      vi.mocked(email.sendLembreteDePrazoEmail).mockRejectedValueOnce(new Error('Resend recusou'))
      expect(await enviarLembretesDaEmpresa(outraEmpresa.companyId, agora)).toEqual({ enviados: 0, falhas: 1 })
      expect(await prisma.notification.count({ where: { userId: outraEmpresa.id } })).toBe(0)

      expect(await enviarLembretesDaEmpresa(outraEmpresa.companyId, new Date(agora.getTime() + HORA_MS))).toEqual({ enviados: 1, falhas: 0 })
    }, 60_000)
  })
})
