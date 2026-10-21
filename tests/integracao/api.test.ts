// ============================================================
// Teste de integração da API com um PostgreSQL REAL (descartável).
// Só roda se TEST_DATABASE_URL estiver definida — sem ela, é pulado (o CI
// padrão não tem banco). Como rodar localmente:
//   1) suba um Postgres vazio e aplique as migrations:
//        DATABASE_URL=postgresql://.../teste npx prisma migrate deploy
//   2) TEST_DATABASE_URL=postgresql://.../teste npm run test:integracao
// Cobre o que mais importa para vender: uma empresa nunca lê nem altera dado
// de outra, os limites do plano valem, e tudo deixa rastro de auditoria.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('API com banco real', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quota: any
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const email = (n: string) => `${n}-${sufixo}@teste.local`

  const ids: Record<string, string> = {}
  const tokens: Record<string, string> = {}
  let tenderId = ''

  async function http(
    metodo: string,
    caminho: string,
    quem: string | null,
    corpo?: unknown
  ): Promise<{ status: number; body: any; texto: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(quem ? { Authorization: `Bearer ${tokens[quem]}` } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: unknown = null
    try { body = JSON.parse(texto) } catch { /* resposta não-JSON (ex.: CSV) */ }
    return { status: res.status, body, texto }
  }

  async function criarConta(chave: string, plano: string, opcoes: { admin?: boolean } = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: email(chave),
        name: chave,
        passwordHash: await hashPassword(SENHA),
        isAdmin: opcoes.admin === true,
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${chave} ${sufixo}`, planCode: plano } },
      },
    })
    ids[chave] = user.id
    ids[`empresa${chave}`] = user.companyId
    const login = await http('POST', '/api/auth/login', null, { email: email(chave), password: SENHA })
    expect(login.status).toBe(200)
    tokens[chave] = login.body.token
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    process.env.AI_ANALYSIS_ENABLED = 'false'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    quota = await import('../../src/services/quotaService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    await criarConta('a', 'PROFISSIONAL')
    await criarConta('b', 'PROFISSIONAL')
    await criarConta('teste', 'TESTE') // 3 itens, 1 usuário, 3 análises
    await criarConta('admin', 'EMPRESARIAL', { admin: true })

    const tender = await prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `teste-${sufixo}`,
        modalidade: 'PREGAO_ELETRONICO',
        objeto: 'Objeto de teste de integração',
        rawJson: {},
        encerramentoAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    })
    tenderId = tender.id
  }, 60_000)

  afterAll(async () => {
    // Planos criados pelo teste (código TESTE_XXXX) não podem sobrar no banco.
    await prisma?.subscriptionPlan.deleteMany({ where: { code: { startsWith: 'TESTE_' } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  // -----------------------------------------------------------------
  describe('isolamento entre empresas', () => {
    let itemA = ''
    let docA = ''

    it('empresa A cria item, documento, checklist e decisão de participação', async () => {
      const item = await http('POST', '/api/monitored-items', 'a', { name: 'Item secreto de A', keywords: ['notebook'] })
      expect(item.status).toBe(201)
      itemA = item.body.id

      const doc = await http('POST', '/api/company-documents', 'a', { nome: 'Certidão de A', tipo: 'cnd-federal' })
      expect(doc.status).toBe(201)
      docA = doc.body.id

      const ck = await http('GET', `/api/tenders/${tenderId}/checklist`, 'a')
      expect(ck.status).toBe(200)
      const itens = ck.body.items.map((i: { checked: boolean }, n: number) => ({ ...i, checked: n === 0 }))
      expect((await http('PUT', `/api/tenders/${tenderId}/checklist`, 'a', { items: itens })).status).toBe(200)

      expect((await http('PATCH', `/api/tenders/${tenderId}/plano/status`, 'a', { status: 'VOU_PARTICIPAR' })).status).toBe(200)
    })

    it('desativar e reativar o item muda o active de verdade', async () => {
      const off = await http('PATCH', `/api/monitored-items/${itemA}`, 'a', { active: false })
      expect(off.status).toBe(200)
      expect(off.body.active).toBe(false)
      const on = await http('PATCH', `/api/monitored-items/${itemA}`, 'a', { active: true })
      expect(on.body.active).toBe(true)
    })

    it('palavra-chave de 1 letra é recusada com mensagem por campo', async () => {
      const r = await http('POST', '/api/monitored-items', 'a', { name: 'Curta', keywords: ['a'] })
      expect(r.status).toBe(400)
      expect(r.body.details[0].path[0]).toBe('keywords')
    })

    it('empresa B não enxerga nada de A nas listagens', async () => {
      const itens = await http('GET', '/api/monitored-items', 'b')
      expect(itens.body.map((i: { id: string }) => i.id)).not.toContain(itemA)

      const docs = await http('GET', '/api/company-documents', 'b')
      expect(docs.body.map((d: { id: string }) => d.id)).not.toContain(docA)

      const empresa = await http('GET', '/api/company', 'b')
      expect(empresa.body.id).toBe(ids.empresab)
      expect(JSON.stringify(empresa.body)).not.toContain(email('a'))

      const plano = await http('GET', `/api/tenders/${tenderId}/plano`, 'b')
      expect(plano.body.status).toBe('AVALIANDO') // a decisão de A não vaza

      const ckB = await http('GET', `/api/tenders/${tenderId}/checklist`, 'b')
      expect(ckB.body.items.filter((i: { checked: boolean }) => i.checked)).toHaveLength(0)
    })

    it('empresa B não lê, altera nem apaga o item de A pelo id', async () => {
      expect((await http('GET', `/api/monitored-items/${itemA}`, 'b')).status).toBe(403)
      expect((await http('PATCH', `/api/monitored-items/${itemA}`, 'b', { name: 'invadido' })).status).toBe(403)
      expect((await http('DELETE', `/api/monitored-items/${itemA}`, 'b')).status).toBe(403)
      expect((await http('POST', `/api/monitored-items/${itemA}/rematch`, 'b')).status).toBe(403)
      const intacto = await prisma.monitoredItem.findUnique({ where: { id: itemA } })
      expect(intacto.name).toBe('Item secreto de A')
    })

    it('anexa, baixa, troca e remove o arquivo de um documento; B não acessa', async () => {
      const pdf = Buffer.from('%PDF-1.4 conteudo de teste %%EOF')
      const enviar = (quem: string, corpo: Buffer, nome = 'Certidão.pdf') =>
        fetch(`${base}/api/company-documents/${docA}/arquivo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(nome), Authorization: `Bearer ${tokens[quem]}` },
          body: corpo,
        })

      const up = await enviar('a', pdf)
      expect(up.status).toBe(200)
      expect(((await up.json()) as { nomeArquivo: string }).nomeArquivo).toBe('Certidao.pdf')

      const lista = await http('GET', '/api/company-documents', 'a')
      expect(lista.body.find((d: { id: string }) => d.id === docA).arquivo.tamanho).toBe(pdf.length)

      const down = await fetch(`${base}/api/company-documents/${docA}/arquivo`, { headers: { Authorization: `Bearer ${tokens.a}` } })
      expect(down.status).toBe(200)
      expect(down.headers.get('content-type')).toBe('application/pdf')
      expect(Buffer.from(await down.arrayBuffer()).equals(pdf)).toBe(true)

      expect((await enviar('a', Buffer.from('<html>nao sou pdf</html>'), 'falso.pdf')).status).toBe(415)
      expect((await enviar('b', pdf)).status).toBe(403)
      const deB = await fetch(`${base}/api/company-documents/${docA}/arquivo`, { headers: { Authorization: `Bearer ${tokens.b}` } })
      expect(deB.status).toBe(403)

      expect((await enviar('a', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), 'foto.png')).status).toBe(200)
      expect((await http('DELETE', `/api/company-documents/${docA}/arquivo`, 'a')).status).toBe(204)
      expect((await http('DELETE', `/api/company-documents/${docA}/arquivo`, 'a')).status).toBe(404)
    })

    it('cadastra documento e arquivo de uma vez; arquivo inválido não deixa documento sem arquivo', async () => {
      const criar = (corpo: Buffer, metadados: unknown) =>
        fetch(`${base}/api/company-documents/com-arquivo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Nome-Arquivo': encodeURIComponent('Balanço.pdf'),
            ...(metadados !== undefined ? { 'X-Documento': encodeURIComponent(JSON.stringify(metadados)) } : {}),
            Authorization: `Bearer ${tokens.a}`,
          },
          body: corpo,
        })
      const contar = () => prisma.companyDocument.count({ where: { companyId: ids.empresaa } })
      const antes = await contar()

      expect((await criar(Buffer.from('<html>nao sou pdf</html>'), { tipo: 'balanco', nome: 'Balanço patrimonial' })).status).toBe(415)
      expect((await criar(Buffer.from('<html>nao sou pdf</html>'), { tipo: 'balanco', nome: 'Balanço patrimonial' })).status).toBe(415)
      expect((await criar(Buffer.from('%PDF-1.4 x'), undefined)).status).toBe(400)
      expect((await criar(Buffer.from('%PDF-1.4 x'), { tipo: 'balanco' })).status).toBe(400)
      const dataRuim = await criar(Buffer.from('%PDF-1.4 x'), { tipo: 'balanco', nome: 'Balanço patrimonial', dataValidade: 'não é data' })
      expect(dataRuim.status).toBe(400)
      expect(await dataRuim.json()).toMatchObject({ error: 'Data de validade inválida', campo: 'dataValidade' })
      expect(await contar()).toBe(antes)

      const ok = await criar(Buffer.from('%PDF-1.4 balanco %%EOF'), { tipo: 'balanco', nome: 'Balanço patrimonial', dataValidade: '2027-04-30' })
      expect(ok.status).toBe(201)
      const criado = (await ok.json()) as { id: string; nome: string; tipo: string; dataValidade: string; arquivo: { nomeArquivo: string; tamanho: number } }
      expect(criado).toMatchObject({ nome: 'Balanço patrimonial', tipo: 'balanco', arquivo: { nomeArquivo: 'Balanco.pdf' } })
      expect(criado.dataValidade.slice(0, 10)).toBe('2027-04-30')
      expect(await contar()).toBe(antes + 1)
      expect((await fetch(`${base}/api/company-documents/${criado.id}/arquivo`, { headers: { Authorization: `Bearer ${tokens.b}` } })).status).toBe(403)
      expect((await http('DELETE', `/api/company-documents/${criado.id}`, 'a')).status).toBe(204)
    })

    it('empresa B não altera nem apaga o documento de A pelo id', async () => {
      expect((await http('PATCH', `/api/company-documents/${docA}`, 'b', { nome: 'invadido' })).status).toBe(403)
      expect((await http('DELETE', `/api/company-documents/${docA}`, 'b')).status).toBe(403)
      expect(await prisma.companyDocument.findUnique({ where: { id: docA } })).not.toBeNull()
    })

    it('empresa B não mexe nos matches de A', async () => {
      const match = await prisma.tenderMatch.create({
        data: { tenderId, monitoredItemId: itemA, companyId: ids.empresaa, userId: ids.a, score: 1, matchedKeywords: ['x'] },
      })
      const lista = await http('GET', '/api/matches', 'b')
      expect(lista.body.items.map((m: { id: string }) => m.id)).not.toContain(match.id)
      const patch = await http('PATCH', `/api/matches/${match.id}`, 'b', { read: true })
      expect([403, 404]).toContain(patch.status)
      const del = await http('DELETE', `/api/matches/${match.id}`, 'b')
      expect([403, 404]).toContain(del.status)
      expect(await prisma.tenderMatch.findUnique({ where: { id: match.id } })).not.toBeNull()
    })

    it('empresa B não mexe em usuário de A', async () => {
      // o dono de B só gerencia membros da própria empresa
      expect((await http('PATCH', `/api/company/members/${ids.a}`, 'b', { active: false })).status).toBe(404)
      expect((await prisma.user.findUnique({ where: { id: ids.a } })).active).toBe(true)
    })

    it('membro convidado precisa confirmar o próprio e-mail antes de entrar', async () => {
      const convite = await http('POST', '/api/company/members', 'a', { email: email('convidado'), name: 'Convidado', password: 'Convidado-Forte-2026' })
      expect(convite.status).toBe(201)
      const membro = await prisma.user.findUnique({ where: { email: email('convidado') } })
      expect(membro.emailVerifiedAt).toBeNull()
      const login = await http('POST', '/api/auth/login', null, { email: email('convidado'), password: 'Convidado-Forte-2026' })
      expect(login.status).toBe(403)
      expect(login.body.code).toBe('EMAIL_NAO_VERIFICADO')
    })

    it('PATCH da empresa devolve só os campos públicos', async () => {
      const r = await http('PATCH', '/api/company', 'a', { telefone: '(61) 3333-0000' })
      expect(r.status).toBe(200)
      expect(r.body.telefone).toBe('(61) 3333-0000')
      expect(r.body).not.toHaveProperty('quotaOverrides')
      expect(Array.isArray(r.body.users)).toBe(true)
    })

    it('checklist e plano recusam listas e textos gigantes', async () => {
      const enorme = Array.from({ length: 201 }, (_, i) => ({ id: `m${i}`, label: 'x', date: null, detalhe: null, done: false, custom: true }))
      expect((await http('PUT', `/api/tenders/${tenderId}/plano`, 'a', { status: 'VOU_PARTICIPAR', milestones: enorme })).status).toBe(400)
      const item = { id: 'c1', section: 's', label: 'x'.repeat(501), checked: false, custom: true }
      expect((await http('PUT', `/api/tenders/${tenderId}/checklist`, 'a', { items: [item] })).status).toBe(400)
    })

    it('endpoints de administrador recusam quem não é admin', async () => {
      for (const caminho of ['/api/admin/overview', '/api/admin/companies', '/api/admin/audit', '/api/admin/ai-usage', '/api/admin/plans', '/api/admin/users']) {
        expect((await http('GET', caminho, 'a')).status).toBe(403)
      }
      expect((await http('PATCH', `/api/admin/companies/${ids.empresab}`, 'a', { planCode: 'EMPRESARIAL' })).status).toBe(403)
      expect((await http('GET', '/api/admin/overview', null)).status).toBe(401)
    })
  })

  // -----------------------------------------------------------------
  describe('cotas por plano', () => {
    it('plano TESTE: permite 3 itens e barra o 4º com 402 e código estável', async () => {
      for (let n = 1; n <= 3; n++) {
        expect((await http('POST', '/api/monitored-items', 'teste', { name: `item ${n}`, keywords: ['cabo'] })).status).toBe(201)
      }
      const quarto = await http('POST', '/api/monitored-items', 'teste', { name: 'item 4', keywords: ['cabo'] })
      expect(quarto.status).toBe(402)
      expect(quarto.body.code).toBe('COTA_EXCEDIDA')
      expect(quarto.body.recurso).toBe('itensMonitorados')
      expect(quarto.body.limite).toBe(3)
      expect(quarto.body.usado).toBe(3)
    })

    it('plano TESTE: 1 usuário — convidar membro é barrado', async () => {
      const r = await http('POST', '/api/company/members', 'teste', { email: email('membro'), name: 'Membro' })
      expect(r.status).toBe(402)
      expect(r.body.recurso).toBe('usuarios')
    })

    it('GET /api/company/usage mostra plano, uso e limite', async () => {
      const r = await http('GET', '/api/company/usage', 'teste')
      expect(r.status).toBe(200)
      expect(r.body.plano.codigo).toBe('TESTE')
      const itens = r.body.recursos.find((x: { recurso: string }) => x.recurso === 'itensMonitorados')
      expect(itens).toMatchObject({ usado: 3, limite: 3, excedido: false, noLimite: true })
      const usuarios = r.body.recursos.find((x: { recurso: string }) => x.recurso === 'usuarios')
      expect(usuarios).toMatchObject({ usado: 1, limite: 1, excedido: false, noLimite: true })
    })

    it('o admin muda o plano e o limite sobe; ajuste pontual vence o plano', async () => {
      const antes = await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { planCode: 'ESSENCIAL' }) // 10 itens
      expect(antes.status).toBe(200)
      expect((await http('POST', '/api/monitored-items', 'teste', { name: 'item 4', keywords: ['cabo'] })).status).toBe(201)

      const ajuste = await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { quotaOverrides: { itensMonitorados: 4 } })
      expect(ajuste.status).toBe(200)
      expect((await http('POST', '/api/monitored-items', 'teste', { name: 'item 5', keywords: ['cabo'] })).status).toBe(402)

      const limpo = await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { quotaOverrides: null })
      expect(limpo.status).toBe(200)
      expect((await http('POST', '/api/monitored-items', 'teste', { name: 'item 5', keywords: ['cabo'] })).status).toBe(201)
    })

    it('plano inexistente é recusado; limite inválido também', async () => {
      expect((await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { planCode: 'NAO_EXISTE' })).status).toBe(400)
      expect((await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { quotaOverrides: { itensMonitorados: -5 } })).status).toBe(400)
      expect((await http('PATCH', `/api/admin/companies/${ids.empresateste}`, 'admin', { quotaOverrides: { inventado: 1 } })).status).toBe(400)
    })

    it('análises de IA do mês: só as OK contam, e o admin nunca é limitado', async () => {
      await prisma.company.update({ where: { id: ids.empresab }, data: { planCode: 'TESTE' } })
      const planoTeste = await prisma.subscriptionPlan.findUnique({ where: { code: 'TESTE' } })
      const limiteDoTeste = (planoTeste.limits as { analisesIaMes: number }).analisesIaMes
      for (let n = 0; n < limiteDoTeste; n++) {
        await prisma.aiUsage.create({
          data: { companyId: ids.empresab, userId: ids.b, provider: 'claude', model: 'm', inputTokens: 10, outputTokens: 5, status: 'OK' },
        })
      }
      await expect(quota.exigirCota(ids.empresab, 'analisesIaMes', false)).rejects.toMatchObject({ status: 402 })
      await expect(quota.exigirCota(ids.empresab, 'analisesIaMes', true)).resolves.toBeUndefined()

      // uma tentativa que falhou (ERRO) não gasta a cota do cliente
      await prisma.aiUsage.deleteMany({ where: { companyId: ids.empresab } })
      await prisma.aiUsage.create({ data: { companyId: ids.empresab, provider: 'claude', model: 'm', status: 'ERRO' } })
      await expect(quota.exigirCota(ids.empresab, 'analisesIaMes', false)).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------
  describe('auditoria e acesso do administrador', () => {
    it('login com senha errada e com conta inexistente: falha registrada, sem gravar e-mail digitado', async () => {
      await http('POST', '/api/auth/login', null, { email: email('a'), password: 'errada-errada' })
      const digitado = `colei-a-senha-aqui-${sufixo}@x.com`
      await http('POST', '/api/auth/login', null, { email: digitado, password: 'qualquer' })

      const falhas = await http('GET', '/api/admin/audit?action=LOGIN_FALHA&limit=200', 'admin')
      expect(falhas.status).toBe(200)
      const texto = JSON.stringify(falhas.body)
      expect(texto).toContain('senha-incorreta')
      expect(texto).toContain('conta-desconhecida')
      expect(texto).not.toContain(digitado)
    })

    it('a trilha registra criação de item, documento e mudança de decisão — com ator e empresa', async () => {
      const r = await http('GET', `/api/admin/audit?companyId=${ids.empresaa}&limit=200`, 'admin')
      const acoes = r.body.eventos.map((e: { action: string }) => e.action)
      expect(acoes).toEqual(expect.arrayContaining(['LOGIN_OK', 'ITEM_MONITORADO_CRIADO', 'DOCUMENTO_CRIADO', 'PARTICIPACAO_STATUS']))
      const decisao = r.body.eventos.find((e: { action: string }) => e.action === 'PARTICIPACAO_STATUS')
      expect(decisao.actorEmail).toBe(email('a'))
      expect(decisao.metadata).toMatchObject({ de: 'AVALIANDO', para: 'VOU_PARTICIPAR' })
    })

    it('repetir o mesmo status não gera evento duplicado', async () => {
      const contar = async () => (await http('GET', `/api/admin/audit?action=PARTICIPACAO_STATUS&companyId=${ids.empresaa}`, 'admin')).body.eventos.length
      const antes = await contar()
      await http('PATCH', `/api/tenders/${tenderId}/plano/status`, 'a', { status: 'VOU_PARTICIPAR' })
      expect(await contar()).toBe(antes)
    })

    it('a trilha nunca guarda senha nem token', async () => {
      const r = await http('GET', '/api/admin/audit?limit=200', 'admin')
      const texto = JSON.stringify(r.body)
      expect(texto).not.toContain(SENHA)
      expect(texto).not.toContain(tokens.a)
      expect(texto).not.toMatch(/passwordHash|\$2[aby]\$/)
    })

    it('a cota excedida também fica registrada', async () => {
      const r = await http('GET', `/api/admin/audit?action=COTA_EXCEDIDA&companyId=${ids.empresateste}`, 'admin')
      expect(r.body.eventos.length).toBeGreaterThan(0)
      expect(r.body.eventos[0].metadata).toMatchObject({ recurso: 'itensMonitorados' })
    })

    it('o admin vê tudo de uma empresa — e essa consulta fica auditada', async () => {
      const r = await http('GET', `/api/admin/companies/${ids.empresaa}`, 'admin')
      expect(r.status).toBe(200)
      expect(r.body.itensMonitorados.map((i: { name: string }) => i.name)).toContain('Item secreto de A')
      expect(r.body.documentos.map((d: { nome: string }) => d.nome)).toContain('Certidão de A')
      expect(r.body.usuarios.map((u: { email: string }) => u.email)).toContain(email('a'))
      expect(r.body.planosDeParticipacao.map((p: { status: string }) => p.status)).toContain('VOU_PARTICIPAR')
      expect(r.body.cotas.plano.codigo).toBe('PROFISSIONAL')
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/)

      const trilha = await http('GET', `/api/admin/audit?action=ADMIN_CONSULTOU_EMPRESA&companyId=${ids.empresaa}`, 'admin')
      expect(trilha.body.eventos.length).toBeGreaterThan(0)
      expect(trilha.body.eventos[0].actorEmail).toBe(email('admin'))
    })

    it('visão geral, lista de empresas e planos respondem', async () => {
      const ov = await http('GET', '/api/admin/overview', 'admin')
      expect(ov.status).toBe(200)
      expect(ov.body.empresas).toBeGreaterThanOrEqual(4)

      const lista = await http('GET', `/api/admin/companies?q=${sufixo}`, 'admin')
      expect(lista.body.total).toBe(4)

      const planos = await http('GET', '/api/admin/plans', 'admin')
      expect(planos.body.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['TESTE', 'ESSENCIAL', 'PROFISSIONAL', 'EMPRESARIAL']))
    })

    it('editar um plano muda o limite de quem está nele e fica auditado', async () => {
      const novo = await http('POST', '/api/admin/plans', 'admin', {
        code: `TESTE_${sufixo.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
        name: 'Plano de teste',
        limits: { itensMonitorados: 1, usuarios: 1, analisesIaMes: 1 },
      })
      expect(novo.status).toBe(201)
      const put = await http('PUT', `/api/admin/plans/${novo.body.code}`, 'admin', { limits: { itensMonitorados: 7, usuarios: 2, analisesIaMes: 3 } })
      expect(put.status).toBe(200)
      const trilha = await http('GET', '/api/admin/audit?action=PLANO_ALTERADO', 'admin')
      expect(trilha.body.eventos.length).toBeGreaterThanOrEqual(2)
    })

    it('exportação CSV traz cabeçalho, neutraliza fórmulas e se auto-audita', async () => {
      await http('POST', '/api/company-documents', 'a', { nome: '=HYPERLINK("http://x")', tipo: 'teste' })
      const r = await http('GET', '/api/admin/audit/export', 'admin')
      expect(r.status).toBe(200)
      expect(r.texto).toContain('data,ator,empresa,acao')
      expect(r.texto).not.toMatch(/,"=HYPERLINK/)
      const trilha = await http('GET', '/api/admin/audit?action=ADMIN_EXPORTOU_AUDITORIA', 'admin')
      expect(trilha.body.eventos.length).toBeGreaterThan(0)
    })

    it('uso de IA agrega por empresa', async () => {
      await prisma.aiUsage.create({
        data: { companyId: ids.empresaa, userId: ids.a, provider: 'claude', model: 'm', inputTokens: 1000, outputTokens: 500, costUsd: '0.5', status: 'OK' },
      })
      const r = await http('GET', '/api/admin/ai-usage', 'admin')
      expect(r.status).toBe(200)
      const linha = r.body.porEmpresa.find((e: { companyId: string }) => e.companyId === ids.empresaa)
      expect(linha).toMatchObject({ chamadas: 1, tokensEntrada: 1000, tokensSaida: 500, custoEstimadoUsd: 0.5 })
      expect(r.body.porMes.length).toBeGreaterThan(0)
    })
  })

  // -----------------------------------------------------------------
  describe('prazos em dias úteis', () => {
    it('GET /api/tenders/:id/prazos calcula o limite de impugnação', async () => {
      const r = await http('GET', `/api/tenders/${tenderId}/prazos`, 'a')
      expect(r.status).toBe(200)
      expect(r.body.disponivel).toBe(true)
      expect(r.body.limiteImpugnacao < r.body.dataSessao).toBe(true)
      expect(r.body.limitePassou).toBe(false)
    })

    it('sem data de sessão devolve indisponível, sem inventar', async () => {
      const semData = await prisma.tender.create({
        data: { fonte: 'PNCP', fonteId: `sem-data-${sufixo}`, modalidade: 'OUTROS', objeto: 'x', rawJson: {} },
      })
      const r = await http('GET', `/api/tenders/${semData.id}/prazos`, 'a')
      expect(r.body.disponivel).toBe(false)
    })
  })
})
