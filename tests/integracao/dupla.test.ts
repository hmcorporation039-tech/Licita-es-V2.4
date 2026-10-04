// ============================================================
// Teste de integração da análise em DUPLA (analista + revisor) e da matriz de
// exigências, com PostgreSQL real e modelos de mentira (nenhuma rede, nenhum
// crédito de IA). Só roda com TEST_DATABASE_URL.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analiseBase, exigencia } from '../helpers/analises'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Análise em dupla e matriz de exigências', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let servico: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quota: any
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const ids: Record<string, string> = {}
  const tokens: Record<string, string> = {}
  const tenders: Record<string, string> = {}

  async function http(metodo: string, caminho: string, quem: string | null, corpo?: unknown) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(quem ? { Authorization: `Bearer ${tokens[quem]}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body, texto }
  }

  async function criarConta(chave: string, admin = false) {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `${chave}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        isAdmin: admin,
        company: { create: { name: `Empresa ${chave} ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    ids[chave] = user.id
    ids[`empresa${chave}`] = user.companyId
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: SENHA }) })
    tokens[chave] = ((await r.json()) as { token: string }).token
  }

  const TEXTO_EDITAL =
    '[[PÁGINA 1]]\nPREGÃO ELETRÔNICO. Objeto: aquisição de computadores.\n\n[[PÁGINA 2]]\n' +
    '10.3.2 A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto.\n\n[[PÁGINA 3]]\n' +
    'A garantia de proposta será de 3% do valor estimado da contratação.'

  const docs = async () => [{ nome: 'Edital.pdf', tipo: 'texto' as const, texto: TEXTO_EDITAL }]

  const usoGemini = { provider: 'gemini', model: 'gemini-teste', inputTokens: 1000, outputTokens: 300 }
  const usoClaude = { provider: 'claude', model: 'claude-opus-5-5', inputTokens: 4000, outputTokens: 1200 }

  // O analista erra de propósito (garantia "não exigida" e uma exigência que não existe);
  // o revisor corrige a garantia e troca a exigência inventada por uma real.
  const rascunho = analiseBase({
    garantiaProposta: 'não exigida',
    matrizExigencias: [
      exigencia('A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto', { pagina: '9' }),
      exigencia('A licitante deverá possuir frota própria de dez veículos refrigerados'),
    ],
  })
  const final = analiseBase({
    garantiaProposta: 'A garantia de proposta será de 3% do valor estimado da contratação.',
    matrizExigencias: [
      exigencia('A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto', { pagina: '2' }),
      exigencia('A garantia de proposta será de 3% do valor estimado da contratação', { pagina: '3', item: '', categoria: 'proposta' }),
    ],
  })

  const analista = async () => ({ resultado: rascunho, uso: usoGemini })
  const revisorBom = async () => ({
    resultado: final,
    relatorio: {
      veredito: 'corrigida' as const,
      resumo: 'Corrigi a garantia de proposta e a matriz.',
      justificativas: [{ campo: 'garantiaProposta', motivo: 'O edital exige 3% na página 3.' }],
    },
    uso: usoClaude,
  })

  async function novaLicitacao(chave: string) {
    const t = await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `dupla-${chave}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', objeto: `Objeto ${chave}`, rawJson: {}, valorEstimado: 1_000_000 },
    })
    tenders[chave] = t.id
    return t.id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.AI_ANALYSIS_ENABLED = 'true'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    servico = await import('../../src/services/editalAnalysisService')
    quota = await import('../../src/services/quotaService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await criarConta('a')
    await criarConta('b')
    await criarConta('admin', true)
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  describe('fluxo completo: Gemini analisa, Claude revisa', () => {
    it('grava o resultado FINAL (revisado), o rascunho do analista e o relatório da revisão', async () => {
      const id = await novaLicitacao('ok')
      await servico.runEditalAnalysis(id, { companyId: ids.empresaa, userId: ids.a }, { obterDocumentos: docs, analista, revisor: revisorBom })

      const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: id } })
      expect(a.status).toBe('DONE')
      expect(a.pipeline).toBe('dupla')
      expect(a.resultado.garantiaProposta).toMatch(/3%/)
      expect(a.rascunho.garantiaProposta).toBe('não exigida')
      expect(a.revisao).toMatchObject({ status: 'OK', veredito: 'corrigida', analista: { provider: 'gemini' }, revisor: { provider: 'claude', model: 'claude-opus-5-5' } })
      const campos = a.revisao.alteracoes.map((x: { campo: string }) => x.campo)
      expect(campos).toEqual(expect.arrayContaining(['garantiaProposta', 'matrizExigencias']))
      expect(a.revisao.alteracoes.find((x: { campo: string }) => x.campo === 'garantiaProposta').motivo).toMatch(/página 3/)
    })

    it('a conferência por código marca a página real e sinaliza o que a IA inventou', async () => {
      const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: tenders.ok } })
      const [atestado, garantia] = a.resultado.matrizExigencias
      expect(atestado.verificacao).toMatchObject({ status: 'confirmado', paginaConfirmada: '2' })
      expect(garantia.verificacao).toMatchObject({ status: 'confirmado', paginaConfirmada: '3' })
      // o rascunho tinha uma exigência que não existe no edital — o revisor a tirou, mas confira que um item inventado seria pego:
      const inventada = a.rascunho.matrizExigencias[1].texto
      expect(JSON.stringify(a.resultado.matrizExigencias)).not.toContain(inventada)
    })

    it('registra o consumo das duas etapas, e a cota do cliente conta só a análise', async () => {
      const usos = await prisma.aiUsage.findMany({ where: { tenderId: tenders.ok }, orderBy: { createdAt: 'asc' } })
      expect(usos.map((u: { etapa: string; provider: string; status: string }) => [u.etapa, u.provider, u.status])).toEqual([
        ['analise', 'gemini', 'OK'],
        ['revisao', 'claude', 'OK'],
      ])
      expect(usos.every((u: { companyId: string }) => u.companyId === ids.empresaa)).toBe(true)
      expect((await quota.usoDaEmpresa(ids.empresaa)).analisesIaMes).toBe(1) // não 2
    })

    it('usuário comum vê o resultado e o relatório da revisão, mas NÃO o rascunho', async () => {
      const r = await http('GET', `/api/tenders/${tenders.ok}/analysis`, 'a')
      expect(r.status).toBe(200)
      expect(r.body.resultado.garantiaProposta).toMatch(/3%/)
      expect(r.body.revisao.veredito).toBe('corrigida')
      expect(r.body.revisao.totalDeAlteracoes).toBeGreaterThan(0)
      expect(r.body).not.toHaveProperty('rascunho')
      // o relatório mostra o antes/depois de cada campo corrigido (transparência da revisão)
      expect(r.body.revisao.alteracoes.find((x: { campo: string }) => x.campo === 'garantiaProposta').antes).toBe('não exigida')
    })

    it('o admin vê o rascunho e audita as etapas', async () => {
      const r = await http('GET', `/api/tenders/${tenders.ok}/analysis`, 'admin')
      expect(r.body.rascunho.garantiaProposta).toBe('não exigida')

      const det = await http('GET', `/api/admin/analyses/${tenders.ok}`, 'admin')
      expect(det.status).toBe(200)
      expect(det.body.analise.rascunho).toBeTruthy()
      expect(det.body.usos.map((u: { etapa: string }) => u.etapa)).toEqual(['analise', 'revisao'])
      expect((await http('GET', `/api/admin/analyses/${tenders.ok}`, 'a')).status).toBe(403)
    })

    it('o consumo por etapa e provedor aparece no painel do admin', async () => {
      const r = await http('GET', '/api/admin/ai-usage', 'admin')
      const etapas = r.body.porEtapa.map((e: { etapa: string; provider: string }) => `${e.etapa}:${e.provider}`)
      expect(etapas).toEqual(expect.arrayContaining(['analise:gemini', 'revisao:claude']))
    })
  })

  describe('quando o revisor falha', () => {
    it('vale a análise do analista, marcada como NÃO revisada; o detalhe técnico é só do admin', async () => {
      const id = await novaLicitacao('falha')
      const revisorQuebrado = async () => {
        const { ErroComUso } = await import('../../src/services/llm/types')
        throw new ErroComUso(new Error('503 upstream host=interno.exemplo'), usoClaude)
      }
      await servico.runEditalAnalysis(id, { companyId: ids.empresaa, userId: ids.a }, { obterDocumentos: docs, analista, revisor: revisorQuebrado })

      const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: id } })
      expect(a.status).toBe('DONE')
      expect(a.resultado.garantiaProposta).toBe('não exigida') // do analista
      expect(a.revisao.status).toBe('FALHOU')

      const usuario = await http('GET', `/api/tenders/${id}/analysis`, 'a')
      expect(usuario.body.revisao.status).toBe('FALHOU')
      expect(usuario.body.revisao.motivo).toMatch(/NÃO foi revisada/)
      expect(usuario.texto).not.toMatch(/interno\.exemplo/)
      const admin = await http('GET', `/api/tenders/${id}/analysis`, 'admin')
      expect(admin.body.revisao.detalheTecnico).toMatch(/interno\.exemplo/)

      // os tokens gastos na revisão que falhou entram na medição (ERRO) e NÃO gastam a cota do cliente
      const usos = await prisma.aiUsage.findMany({ where: { tenderId: id }, orderBy: { createdAt: 'asc' } })
      expect(usos.map((u: { etapa: string; status: string }) => `${u.etapa}:${u.status}`)).toEqual(['analise:OK', 'revisao:ERRO'])
      expect((await quota.usoDaEmpresa(ids.empresaa)).analisesIaMes).toBe(2) // 1ª + 2ª análise; revisões não contam
    })

    it('sem revisor (um só provedor): análise simples, dita como tal', async () => {
      const id = await novaLicitacao('simples')
      await servico.runEditalAnalysis(id, { companyId: ids.empresab, userId: ids.b }, { obterDocumentos: docs, analista, revisor: null })
      const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: id } })
      expect(a.pipeline).toBe('gemini')
      expect(a.revisao.status).toBe('NAO_EXECUTADA')
      expect(a.rascunho).toBeNull()
      expect(await prisma.aiUsage.count({ where: { tenderId: id } })).toBe(1)
    })

    it('o analista falha: a análise falha e nada é revisado', async () => {
      const id = await novaLicitacao('analistaFalha')
      let revisorChamado = false
      await expect(
        servico.runEditalAnalysis(id, { companyId: ids.empresaa, userId: ids.a }, {
          obterDocumentos: docs,
          analista: async () => { throw new Error('boom') },
          revisor: async () => { revisorChamado = true; return revisorBom() },
        })
      ).rejects.toThrow('boom')
      expect(revisorChamado).toBe(false)
      const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: id } })
      expect(a.status).toBe('FAILED')
      expect(a.errorMsg).not.toMatch(/boom/) // detalhe técnico não vai para o usuário
    })

    it('sem nenhuma chave de IA configurada: falha com mensagem clara, sem chamar modelo', async () => {
      const guardadas = { g: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY, p: process.env.AI_PIPELINE }
      delete process.env.GEMINI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.AI_PIPELINE
      try {
        const id = await novaLicitacao('semChave')
        await servico.runEditalAnalysis(id, { companyId: ids.empresaa, userId: ids.a }, { obterDocumentos: docs })
        const a = await prisma.tenderAnalysis.findUnique({ where: { tenderId: id } })
        expect(a.status).toBe('FAILED')
        expect(a.errorMsg).toMatch(/não está configurada/)
      } finally {
        if (guardadas.g) process.env.GEMINI_API_KEY = guardadas.g
        if (guardadas.a) process.env.ANTHROPIC_API_KEY = guardadas.a
        if (guardadas.p) process.env.AI_PIPELINE = guardadas.p
      }
    })
  })

  describe('matriz de exigências', () => {
    let chaveAtestado = ''
    let chaveGarantia = ''

    it('lista as exigências com texto literal, página, item, responsável e a conferência', async () => {
      const r = await http('GET', `/api/tenders/${tenders.ok}/matriz`, 'a')
      expect(r.status).toBe(200)
      expect(r.body.disponivel).toBe(true)
      expect(r.body.pipeline).toBe('dupla')
      expect(r.body.itens).toHaveLength(2)
      const it0 = r.body.itens[0]
      expect(it0).toMatchObject({ pagina: '2', item: '10.3.2', responsavel: 'fiscal', atendida: false, verificacao: { status: 'confirmado', paginaConfirmada: '2' } })
      expect(it0.chave).toMatch(/^[0-9a-f]{12}$/)
      expect(r.body.resumo).toMatchObject({ total: 2, atendidas: 0, verificacao: { confirmado: 2 } })
      chaveAtestado = it0.chave
      chaveGarantia = r.body.itens[1].chave
    })

    it('a empresa marca o que já atendeu, com nota, e isso persiste', async () => {
      const put = await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveAtestado}`, 'a', { atendida: true, nota: 'Atestado da obra X anexado' })
      expect(put.status).toBe(200)
      const r = await http('GET', `/api/tenders/${tenders.ok}/matriz`, 'a')
      const item = r.body.itens.find((i: { chave: string }) => i.chave === chaveAtestado)
      expect(item).toMatchObject({ atendida: true, nota: 'Atestado da obra X anexado' })
      expect(r.body.resumo.atendidas).toBe(1)
      // desmarcar
      await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveGarantia}`, 'a', { atendida: true })
      await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveGarantia}`, 'a', { atendida: false })
      expect((await http('GET', `/api/tenders/${tenders.ok}/matriz`, 'a')).body.resumo.atendidas).toBe(1)
    })

    it('o progresso de uma empresa NÃO aparece para outra', async () => {
      const r = await http('GET', `/api/tenders/${tenders.ok}/matriz`, 'b')
      expect(r.body.itens.every((i: { atendida: boolean }) => i.atendida === false)).toBe(true)
      expect(r.body.resumo.atendidas).toBe(0)
      expect(JSON.stringify(r.body)).not.toContain('Atestado da obra X')
      // B marca o seu sem mexer no de A
      await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveAtestado}`, 'b', { atendida: true })
      const a = await http('GET', `/api/tenders/${tenders.ok}/matriz`, 'a')
      expect(a.body.itens.find((i: { chave: string }) => i.chave === chaveAtestado).nota).toBe('Atestado da obra X anexado')
    })

    it('chave inexistente, corpo inválido e licitação inexistente são recusados', async () => {
      expect((await http('PUT', `/api/tenders/${tenders.ok}/matriz/naoexiste1234`, 'a', { atendida: true })).status).toBe(404)
      expect((await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveAtestado}`, 'a', { atendida: 'sim' })).status).toBe(400)
      expect((await http('PUT', `/api/tenders/${tenders.ok}/matriz/${chaveAtestado}`, 'a', { atendida: true, nota: 'x'.repeat(400) })).status).toBe(400)
      expect((await http('GET', '/api/tenders/00000000-0000-0000-0000-000000000000/matriz', 'a')).status).toBe(404)
      expect((await http('GET', `/api/tenders/${tenders.ok}/matriz`, null)).status).toBe(401)
    })

    it('sem análise ou com análise antiga (sem matriz): indisponível, com motivo', async () => {
      const semAnalise = await novaLicitacao('semAnalise')
      expect((await http('GET', `/api/tenders/${semAnalise}/matriz`, 'a')).body).toMatchObject({ disponivel: false })

      const antiga = await novaLicitacao('antiga')
      const { matrizExigencias: _m, ...semMatriz } = analiseBase()
      void _m
      await prisma.tenderAnalysis.create({ data: { tenderId: antiga, status: 'DONE', resultado: semMatriz } })
      const r = await http('GET', `/api/tenders/${antiga}/matriz`, 'a')
      expect(r.body.disponivel).toBe(false)
      expect(r.body.motivo).toMatch(/anterior/)
    })

    it('marcar uma exigência fica na trilha de auditoria', async () => {
      const r = await http('GET', `/api/admin/audit?action=EXIGENCIA_ATUALIZADA&companyId=${ids.empresaa}`, 'admin')
      expect(r.body.eventos.length).toBeGreaterThan(0)
      expect(r.body.eventos[0].metadata).toMatchObject({ atendida: expect.any(Boolean) })
    })
  })
})
