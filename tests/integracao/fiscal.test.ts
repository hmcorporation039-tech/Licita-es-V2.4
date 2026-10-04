// ============================================================
// Teste de integração do painel do Fiscal (semáforo da habilitação e alertas
// legais) com PostgreSQL real. Só roda com TEST_DATABASE_URL.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Painel do Fiscal', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const tokens: Record<string, string> = {}
  const emDias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
  const diaIso = (n: number) => emDias(n).toISOString().slice(0, 10)

  async function http(caminho: string, quem: string | null) {
    const res = await fetch(base + caminho, { headers: quem ? { Authorization: `Bearer ${tokens[quem]}` } : {} })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body }
  }

  async function criarConta(chave: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `${chave}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${chave} ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: SENHA }),
    })
    tokens[chave] = ((await r.json()) as { token: string }).token
    return user
  }

  const analiseBase = {
    resumo: 'x', valorEstimado: 'R$ 1.000.000,00', dataSessao: '', registroPrecos: 'Não', prazoEntrega: '', local: '',
    pagamento: '', criterioJulgamento: '', adesaoAta: '', prazoImpugnacao: '', prazoEsclarecimento: '',
    exigenciasTecnicas: [], documentosExigidos: ['Atestado de capacidade técnica com quantitativo mínimo', 'Comprovação de frota própria'], riscos: [],
  }

  const tenders: Record<string, string> = {}

  async function criarTender(chave: string, extra: Record<string, unknown>, resultado?: Record<string, unknown>) {
    const t = await prisma.tender.create({
      data: {
        fonte: 'PNCP', fonteId: `fiscal-${chave}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', objeto: `Objeto ${chave}`, rawJson: {},
        aberturaAt: emDias(20), valorEstimado: 1_000_000, ...extra,
        ...(resultado ? { analysis: { create: { status: 'DONE', resultado } } } : {}),
      },
    })
    tenders[chave] = t.id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const a = await criarConta('a')
    await criarConta('b')

    // Cofre da empresa A, com a sessão em 20 dias:
    for (const d of [
      { tipo: 'contrato-social', dataValidade: null },
      { tipo: 'cnd-federal', dataValidade: new Date(`${diaIso(120)}T00:00:00Z`) }, // cobre a sessão
      { tipo: 'crf-fgts', dataValidade: new Date(`${diaIso(8)}T00:00:00Z`) }, // vence antes da sessão
      { tipo: 'cndt', dataValidade: new Date(`${diaIso(-3)}T00:00:00Z`) }, // já venceu
    ]) {
      await prisma.companyDocument.create({ data: { companyId: a.companyId, userId: a.id, nome: `Doc ${d.tipo}`, ...d } })
    }

    await criarTender('completa', {}, {
      ...analiseBase,
      garantiaProposta: 'Será exigida garantia de proposta de 3% do valor estimado da contratação.',
      garantiaContratual: 'Garantia contratual de 5% do valor do contrato.',
      patrimonioLiquidoMinimo: 'Patrimônio líquido mínimo de 15% do valor estimado.',
      visitaTecnica: 'A visita técnica é obrigatória e deverá ser agendada.',
    })
    await criarTender('limpa', {}, {
      ...analiseBase,
      garantiaProposta: 'Garantia de 1% do valor estimado.',
      garantiaContratual: 'não exigida',
      patrimonioLiquidoMinimo: 'não exigido',
      visitaTecnica: 'não exigida',
    })
    await criarTender('antiga', {}, analiseBase) // análise de antes da função: sem os campos novos
    await criarTender('semAnalise', {})
    await criarTender('semValor', { valorEstimado: null }, {
      ...analiseBase,
      garantiaProposta: 'Garantia de proposta no valor de R$ 30.000,00.',
      garantiaContratual: '', patrimonioLiquidoMinimo: '', visitaTecnica: '',
    })
    await criarTender('semSessao', { aberturaAt: null })
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const req = (r: { body: any }, id: string) => r.body.habilitacao.requisitos.find((x: { id: string }) => x.id === id) // eslint-disable-line @typescript-eslint/no-explicit-any

  describe('semáforo', () => {
    it('cruza o cofre com a data da sessão: verde, amarelo e vermelho', async () => {
      const r = await http(`/api/tenders/${tenders.completa}/habilitacao`, 'a')
      expect(r.status).toBe(200)
      expect(r.body.habilitacao.referencia.dataSessao).toBe(diaIso(20))

      expect(req(r, 'contrato-social').status).toBe('verde')
      expect(req(r, 'cnd-federal').status).toBe('verde')
      expect(req(r, 'crf-fgts').status).toBe('amarelo') // vence antes da sessão
      expect(req(r, 'crf-fgts').motivo).toMatch(/antes da sessão/)
      expect(req(r, 'cndt').status).toBe('vermelho') // já vencido
      expect(req(r, 'cartao-cnpj').status).toBe('vermelho') // padrão da lei e ausente do cofre
      expect(r.body.habilitacao.semPendenciaBloqueante).toBe(false)
      expect(r.body.habilitacao.resumo.verde).toBeGreaterThanOrEqual(2)
    })

    it('usa a análise do edital: o que ela cita vira exigido; o que não casa vira item extra', async () => {
      const r = await http(`/api/tenders/${tenders.completa}/habilitacao`, 'a')
      expect(req(r, 'atestado-capacidade-tecnica')).toMatchObject({ origem: 'edital', status: 'vermelho' })
      const extra = r.body.habilitacao.requisitos.find((x: { origem: string }) => x.origem === 'extra')
      expect(extra.label).toMatch(/frota/)
      expect(req(r, 'art-rrt').status).toBe('cinza') // a análise não cita
    })

    it('a empresa B não enxerga o cofre da A', async () => {
      const r = await http(`/api/tenders/${tenders.completa}/habilitacao`, 'b')
      expect(req(r, 'cnd-federal').status).toBe('vermelho')
      expect(req(r, 'cnd-federal').documento).toBeNull()
      expect(JSON.stringify(r.body)).not.toContain('Doc cnd-federal')
    })

    it('sem análise do edital: itens condicionais ficam cinza e o resto segue valendo', async () => {
      const r = await http(`/api/tenders/${tenders.semAnalise}/habilitacao`, 'a')
      expect(r.body.analise.feita).toBe(false)
      expect(req(r, 'atestado-capacidade-tecnica').status).toBe('cinza')
      expect(req(r, 'atestado-capacidade-tecnica').motivo).toMatch(/Rode a análise/)
      expect(req(r, 'cnd-federal').status).toBe('verde')
    })

    it('sem data de sessão: compara com hoje e avisa', async () => {
      const r = await http(`/api/tenders/${tenders.semSessao}/habilitacao`, 'a')
      expect(r.body.habilitacao.referencia).toEqual({ dataSessao: null, usouHoje: true })
      expect(r.body.prazos).toBeNull()
      expect(req(r, 'crf-fgts').status).toBe('verde') // vale hoje; sem sessão não há "antes da sessão"
    })

    it('traz também o prazo de impugnação em dias úteis', async () => {
      const r = await http(`/api/tenders/${tenders.completa}/habilitacao`, 'a')
      expect(r.body.prazos.dataSessao).toBe(diaIso(20))
      expect(r.body.prazos.limiteImpugnacao < r.body.prazos.dataSessao).toBe(true)
    })
  })

  describe('alertas legais', () => {
    it('detecta garantia de proposta, patrimônio líquido e visita técnica fora do limite', async () => {
      const r = await http(`/api/tenders/${tenders.completa}/habilitacao`, 'a')
      expect(r.body.alertas.disponivel).toBe(true)
      expect(r.body.alertas.itens.map((a: { id: string }) => a.id).sort()).toEqual(['garantia-proposta', 'patrimonio-liquido', 'visita-tecnica'])
      const g = r.body.alertas.itens.find((a: { id: string }) => a.id === 'garantia-proposta')
      expect(g.fundamento).toMatch(/art\. 58/)
      expect(g.trecho).toMatch(/3%/)
      expect(r.body.alertas.aviso).toMatch(/não conclusões/)
    })

    it('edital dentro dos limites: disponível, mas sem alertas', async () => {
      const r = await http(`/api/tenders/${tenders.limpa}/habilitacao`, 'a')
      expect(r.body.alertas).toMatchObject({ disponivel: true, itens: [] })
    })

    it('análise antiga (sem os campos novos): diz que não está disponível, em vez de inventar', async () => {
      const r = await http(`/api/tenders/${tenders.antiga}/habilitacao`, 'a')
      expect(r.body.alertas).toMatchObject({ disponivel: false, itens: [] })
    })

    it('sem análise: alertas indisponíveis', async () => {
      const r = await http(`/api/tenders/${tenders.semAnalise}/habilitacao`, 'a')
      expect(r.body.alertas.disponivel).toBe(false)
    })

    it('sem valor estimado na licitação, usa o valor que a IA leu do edital', async () => {
      // 30.000 de 1.000.000 (lido da análise) = 3% > 1%
      const r = await http(`/api/tenders/${tenders.semValor}/habilitacao`, 'a')
      expect(r.body.alertas.itens.map((a: { id: string }) => a.id)).toEqual(['garantia-proposta'])
    })
  })

  describe('acesso', () => {
    it('exige login e responde 404 para licitação inexistente', async () => {
      expect((await http(`/api/tenders/${tenders.completa}/habilitacao`, null)).status).toBe(401)
      expect((await http('/api/tenders/00000000-0000-0000-0000-000000000000/habilitacao', 'a')).status).toBe(404)
    })
  })
})
