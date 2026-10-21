import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const gerar = vi.hoisted(() => vi.fn())

vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = { generateContent: gerar }
  },
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

function respostaDaIa(corpo: unknown) {
  return { text: JSON.stringify(corpo), usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 100 }, candidates: [{ finishReason: 'STOP' }] }
}

const atendimento = (intencao: string, resposta: string, extra: Record<string, unknown> = {}) =>
  respostaDaIa({ intencao, resposta, sabeResponder: true, abrirChamado: false, tipoDoChamado: 'DUVIDA', assuntoDoChamado: '', ...extra })

rodar('Atendimento e especialista do suporte', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `atd-${sufixo}-`
  const SENHA = 'Senha-forte-123'

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      body = JSON.parse(texto)
    } catch {
      body = null
    }
    return { status: res.status, body }
  }

  async function conta(nome: string, empresa: Record<string, unknown> = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        name: `Pessoa ${nome}`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: 'OWNER',
        company: { create: { name: `Atendimento ${sufixo} ${nome}`, ...empresa } },
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string
    return { id: u.id as string, companyId: u.companyId as string, token }
  }

  const falar = (token: string, mensagem: string, extra: Record<string, unknown> = {}) => http('POST', '/api/suporte/conversa', { mensagem, tela: '/tenders/xyz', ...extra }, token)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.AI_ANALYSIS_ENABLED = 'true'
    process.env.GEMINI_API_KEY = 'chave-de-teste'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)

  beforeEach(() => {
    gerar.mockReset()
  })

  afterAll(async () => {
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Atendimento ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.chamado.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.aiUsage.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  it('responde dúvida do sistema com os limites reais da conta e guarda a conversa', async () => {
    const dono = await conta('uso')
    gerar.mockResolvedValueOnce(atendimento('SISTEMA', 'Você usou 0 de 10 itens monitorados.'))
    const r = await falar(dono.token, 'Quantos itens posso monitorar?')
    expect(r.status).toBe(201)
    expect(r.body.resposta).toMatchObject({ papel: 'ATENDIMENTO', texto: 'Você usou 0 de 10 itens monitorados.' })
    expect(r.body.cota).toEqual({ usadas: 1, limite: 30 })

    const pedido = gerar.mock.calls[0][0]
    const partes = pedido.contents[0].parts.map((p: { text: string }) => p.text)
    expect(partes[0]).toContain('BASE DE CONHECIMENTO')
    expect(partes[1]).toContain('Itens monitorados: 0 usados de 10')
    expect(partes[2]).toContain('Mensagem nova do cliente: Quantos itens posso monitorar?')
    expect(pedido.config.systemInstruction).toContain('atendimento da Licita Bela')

    const conversa = await http('GET', '/api/suporte/conversa', undefined, dono.token)
    expect(conversa.body.mensagens.map((m: { papel: string }) => m.papel)).toEqual(['USUARIO', 'ATENDIMENTO'])
    expect(await prisma.aiUsage.count({ where: { userId: dono.id, etapa: 'suporte', status: 'OK' } })).toBe(1)
  })

  it('passa dúvida de licitação ao especialista, com artigo conferido na lei e o aviso fixo', async () => {
    const dono = await conta('lei')
    gerar
      .mockResolvedValueOnce(atendimento('LICITACAO', 'Vou passar ao especialista.'))
      .mockResolvedValueOnce(
        respostaDaIa({
          resposta: 'O recurso cabe em 3 dias úteis (art. 165).',
          encontrado: true,
          citacoes: [
            { artigo: '165', trecho: 'recurso, no prazo de 3 (três) dias úteis, contado da data de intimação ou de lavratura da ata' },
            { artigo: '999', trecho: 'qualquer licitante poderá recorrer em até 30 dias corridos da decisão final do pregoeiro' },
          ],
        })
      )
    const r = await falar(dono.token, 'Qual o prazo para recorrer no pregão?')
    expect(r.status).toBe(201)
    expect(r.body.resposta.papel).toBe('ESPECIALISTA')
    expect(r.body.resposta.citacoes).toEqual([{ artigo: '165', trecho: 'recurso, no prazo de 3 (três) dias úteis, contado da data de intimação ou de lavratura da ata', conferencia: 'confirmado' }])
    expect(r.body.resposta.semComprovacao).toBe(false)
    expect(r.body.resposta.aviso).toContain('não é parecer jurídico')
    const artigosEnviados = gerar.mock.calls[1][0].contents[0].parts[0].text as string
    expect(artigosEnviados).toContain('Art. 165.')
    expect(await prisma.aiUsage.count({ where: { userId: dono.id, etapa: 'especialista' } })).toBe(1)
  })

  it('erro relatado abre chamado do atendimento e a mensagem seguinte entra no mesmo chamado', async () => {
    const dono = await conta('erro')
    gerar.mockResolvedValueOnce(atendimento('ERRO', 'Sinto muito pelo problema, a equipe vai analisar.', { abrirChamado: true, tipoDoChamado: 'ERRO', assuntoDoChamado: 'Análise do edital não termina' }))
    const r = await falar(dono.token, 'A análise do edital fica carregando e não termina', { errosRecentes: [{ codigo: `${prefixo}cod-1`, rota: '/api/tenders/xyz/analise', status: 502 }] })
    expect(r.status).toBe(201)
    const numero = r.body.resposta.chamado as number
    expect(numero).toBeGreaterThan(0)
    expect(r.body.resposta.texto).toContain(`Abri o chamado #${numero}`)
    const chamado = await prisma.chamado.findUnique({ where: { numero } })
    expect(chamado).toMatchObject({ origem: 'ATENDIMENTO', tipo: 'ERRO', assunto: 'Análise do edital não termina', userId: dono.id })
    expect(chamado.contexto.tela).toBe('/tenders/xyz')
    expect(chamado.contexto.errosRecentes[0].codigo).toBe(`${prefixo}cod-1`)

    gerar.mockResolvedValueOnce(atendimento('ERRO', 'Anotado.', { abrirChamado: true, tipoDoChamado: 'ERRO', assuntoDoChamado: 'Continua travando' }))
    const segunda = await falar(dono.token, 'Tentei de novo agora e continua igual')
    expect(segunda.body.resposta.chamado).toBe(numero)
    expect(segunda.body.resposta.texto).toContain(`chamado #${numero}`)
    expect(await prisma.chamado.count({ where: { companyId: dono.companyId } })).toBe(1)
    expect(await prisma.chamadoMensagem.count({ where: { chamadoId: chamado.id, autor: 'CLIENTE' } })).toBe(1)
  })

  it('para na cota do plano e não cobra mensagem que a IA não respondeu', async () => {
    const dono = await conta('cota', { quotaOverrides: { mensagensDeSuporteMes: 1 } })
    gerar.mockRejectedValueOnce(new Error('fora do ar'))
    const falhou = await falar(dono.token, 'Como exporto para o Excel?')
    expect(falhou.status).toBe(502)
    expect(await prisma.mensagemDeSuporte.count({ where: { userId: dono.id } })).toBe(0)
    expect(await prisma.aiUsage.count({ where: { userId: dono.id, etapa: 'suporte', status: 'ERRO' } })).toBe(1)

    gerar.mockResolvedValueOnce(atendimento('SISTEMA', 'Use o botão Exportar para Excel em Meus matches.'))
    expect((await falar(dono.token, 'Como exporto para o Excel?')).status).toBe(201)
    const barrada = await falar(dono.token, 'E para o PDF?')
    expect(barrada.status).toBe(402)
    expect(barrada.body.code).toBe('COTA_EXCEDIDA')
  })
  it('o técnico gera o diagnóstico com os erros guardados, sem aceitar arquivo inventado', async () => {
    const dono = await conta('tecnico')
    const admin = await prisma.user.create({ data: { email: `${prefixo}admin@teste.local`, passwordHash: (await (await import('../../src/services/authService')).hashPassword(SENHA)), emailVerifiedAt: new Date(), isAdmin: true, company: { create: { name: `Atendimento ${sufixo} admin` } } } })
    const tokenAdmin = (await http('POST', '/api/auth/login', { email: admin.email, password: SENHA })).body.token as string
    const codigo = `${prefixo}diag-1`
    await prisma.erroDoSistema.create({ data: { origem: 'api', codigoDeRastreio: codigo, metodo: 'POST', rota: '/api/suporte/chamados', status: 500, mensagem: 'TypeError: x is undefined', pilha: 'at abrirChamado (/app/dist/services/chamados.js:40:11)', userId: dono.id, companyId: dono.companyId } })
    const aberto = await http('POST', '/api/suporte/chamados', { tipo: 'ERRO', assunto: 'Erro ao abrir chamado', relato: 'Cliquei em enviar e deu erro interno.', errosRecentes: [{ codigo, status: 500 }] }, dono.token)
    gerar.mockResolvedValueOnce(
      respostaDaIa({
        resumo: 'O envio do chamado falha com erro interno.',
        passosParaReproduzir: ['Abrir Suporte', 'Enviar um chamado'],
        causaProvavel: 'Variável indefinida em abrirChamado.',
        confianca: 'media',
        arquivosEnvolvidos: ['src/services/chamados.ts', 'src/services/naoExiste.ts'],
        correcaoSugerida: 'Conferir o valor antes de usar.',
        informacoesQueFaltam: '',
      })
    )
    const r = await http('POST', `/api/admin/chamados/${aberto.body.numero}/diagnostico`, undefined, tokenAdmin)
    expect(r.status).toBe(200)
    expect(r.body.diagnosticoStatus).toBe('PRONTO')
    expect(r.body.diagnostico).toMatchObject({ arquivosEnvolvidos: ['src/services/chamados.ts'], arquivosDescartados: ['src/services/naoExiste.ts'], errosAnalisados: 1, confianca: 'media' })
    const partes = gerar.mock.calls[0][0].contents[0].parts.map((p: { text: string }) => p.text)
    expect(partes[1]).toContain('TypeError: x is undefined')
    expect(partes[3]).toContain('src/services/chamados.ts')
    expect(partes[4]).toContain('--- src/services/chamados.ts ---')
    expect(gerar.mock.calls[0][0].config.systemInstruction).toContain('não altera código')
    const visto = await http('GET', `/api/suporte/chamados/${aberto.body.numero}`, undefined, dono.token)
    expect(visto.body.diagnostico).toBeUndefined()
    await prisma.erroDoSistema.deleteMany({ where: { codigoDeRastreio: codigo } })
  })
})
