import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Cópia dos dados em ZIP (LGPD)', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `zip-${sufixo}-`
  const SENHA = 'Senha-forte-123'

  async function entrar(email: string): Promise<string> {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: SENHA }) })
    return ((await r.json()) as { token: string }).token
  }

  async function baixar(token: string) {
    const r = await fetch(base + '/api/conta/meus-dados.zip', { headers: { Authorization: `Bearer ${token}` } })
    return { status: r.status, headers: r.headers, arquivos: r.status === 200 ? unzipSync(new Uint8Array(await r.arrayBuffer())) : {} }
  }

  async function pessoa(nome: string, companyRole: 'OWNER' | 'MEMBER', companyId?: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole,
        ...(companyId ? { companyId } : { company: { create: { name: `Zip ${sufixo} ${nome}` } } }),
      },
    })
    return { id: u.id as string, companyId: u.companyId as string, email: u.email as string }
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
  }, 60_000)

  afterAll(async () => {
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Zip ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.monitoredItem.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('traz os arquivos do cofre, a logo, as licitações, estudos e pregões, e confere com o que foi enviado', async () => {
    const dono = await pessoa('dono', 'OWNER')
    const membro = await pessoa('membro', 'MEMBER', dono.companyId)
    const outraEmpresa = await pessoa('outra', 'OWNER')

    const pdf = Buffer.from('%PDF-1.4 certidao negativa ' + 'x'.repeat(2000))
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    const certidao = await prisma.companyDocument.create({ data: { companyId: dono.companyId, userId: dono.id, nome: 'Certidão Negativa Federal', dataValidade: new Date('2027-01-31T00:00:00Z') } })
    await prisma.companyDocumentFile.create({
      data: { documentId: certidao.id, companyId: dono.companyId, nomeArquivo: 'CND federal/2026.PDF', mimeType: 'application/pdf', tamanho: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'), conteudo: pdf },
    })
    await prisma.companyDocument.create({ data: { companyId: dono.companyId, userId: dono.id, nome: 'Contrato social' } })
    await prisma.companyLogo.create({ data: { companyId: dono.companyId, mimeType: 'image/png', tamanho: logo.length, conteudo: logo } })
    const segredoAlheio = Buffer.from('%PDF-1.4 documento de outra empresa')
    const alheio = await prisma.companyDocument.create({ data: { companyId: outraEmpresa.companyId, userId: outraEmpresa.id, nome: 'Balanço' } })
    await prisma.companyDocumentFile.create({
      data: { documentId: alheio.id, companyId: outraEmpresa.companyId, nomeArquivo: 'balanco.pdf', mimeType: 'application/pdf', tamanho: segredoAlheio.length, sha256: 'x', conteudo: segredoAlheio },
    })

    const licitacao = await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `${prefixo}1`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA', objeto: '=HYPERLINK("x"); aquisição de notebooks', orgao: 'Prefeitura de Teste', uf: 'DF', rawJson: {}, linkEdital: 'https://pncp.gov.br/x' },
    })
    const item = await prisma.monitoredItem.create({ data: { companyId: dono.companyId, userId: dono.id, name: 'Notebooks', keywords: ['notebook'], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] } })
    await prisma.tenderMatch.create({ data: { tenderId: licitacao.id, monitoredItemId: item.id, companyId: dono.companyId, userId: dono.id, score: 0.82, matchedKeywords: ['notebook'] } })
    await prisma.costStudy.create({ data: { companyId: dono.companyId, userId: dono.id, tenderId: licitacao.id, dados: { margem: 12 } } })
    const pregao = await prisma.pregaoAcompanhamento.create({ data: { companyId: dono.companyId, tenderId: licitacao.id } })
    await prisma.pregaoLance.create({ data: { acompanhamentoId: pregao.id, alvo: 'item 1', origem: 'MEU_LANCE', valor: '1234.56', userId: dono.id } })
    await prisma.mensagemDeSuporte.create({ data: { companyId: dono.companyId, userId: dono.id, papel: 'USUARIO', texto: 'Como exporto meus dados?' } })
    await prisma.mensagemDeSuporte.create({ data: { companyId: dono.companyId, userId: membro.id, papel: 'USUARIO', texto: 'Pergunta particular do membro' } })

    const doDono = await baixar(await entrar(dono.email))
    expect(doDono.status).toBe(200)
    expect(doDono.headers.get('content-type')).toBe('application/zip')
    expect(doDono.headers.get('content-disposition')).toMatch(/attachment; filename="licita-bela-meus-dados-\d{4}-\d{2}-\d{2}\.zip"/)

    const nomes = Object.keys(doDono.arquivos).sort()
    expect(nomes).toEqual([
      'LEIA-ME.txt',
      'cofre-de-documentos.csv',
      'cofre-de-documentos/Certidao Negativa Federal - CND federal 2026.pdf',
      'dados.json',
      'licitacoes-encontradas.csv',
      'logo/logo.png',
    ])
    expect(Buffer.from(doDono.arquivos['cofre-de-documentos/Certidao Negativa Federal - CND federal 2026.pdf']).equals(pdf)).toBe(true)
    expect(Buffer.from(doDono.arquivos['logo/logo.png']).equals(logo)).toBe(true)
    expect(JSON.stringify(Object.values(doDono.arquivos).map((a) => strFromU8(a, true)))).not.toContain('documento de outra empresa')

    const dados = JSON.parse(strFromU8(doDono.arquivos['dados.json']))
    expect(dados.usuario.email).toBe(dono.email)
    expect(dados.licitacoesEncontradas).toHaveLength(1)
    expect(dados.estudosDeCustos[0].dados).toEqual({ margem: 12 })
    expect(dados.pregoes[0].lances[0].valor).toBe('1234.56')
    expect(dados.conversaComOSuporte.map((m: { texto: string }) => m.texto)).toEqual(['Como exporto meus dados?'])
    expect(dados.arquivosDoCofre[0]).toMatchObject({ documento: 'Certidão Negativa Federal', sha256: createHash('sha256').update(pdf).digest('hex') })
    expect(dados.membros.map((m: { email: string }) => m.email).sort()).toEqual([dono.email, membro.email].sort())
    expect(strFromU8(doDono.arquivos['dados.json'])).not.toMatch(/passwordHash|tokenHash|totp/)

    const csv = strFromU8(doDono.arquivos['licitacoes-encontradas.csv'])
    expect([...doDono.arquivos['licitacoes-encontradas.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csv.startsWith('encontrada_em;item;nota')).toBe(true)
    expect(csv).toContain(`;Notebooks;82;notebook;`)
    expect(csv).toContain(`"'=HYPERLINK(""x""); aquisição de notebooks"`)
    const cofre = strFromU8(doDono.arquivos['cofre-de-documentos.csv'])
    expect(cofre).toContain('Contrato social;;;;;;')
    expect(strFromU8(doDono.arquivos['LEIA-ME.txt'])).toContain('1 documento(s) do cofre estão cadastrados sem arquivo')

    const doMembro = await baixar(await entrar(membro.email))
    expect(doMembro.status).toBe(200)
    const dadosDoMembro = JSON.parse(strFromU8(doMembro.arquivos['dados.json']))
    expect(dadosDoMembro.membros).toEqual([])
    expect(dadosDoMembro.assinaturasEPagamentos).toEqual([])
    expect(dadosDoMembro.conversaComOSuporte.map((m: { texto: string }) => m.texto)).toEqual(['Pergunta particular do membro'])
    expect(Object.keys(doMembro.arquivos)).toContain('cofre-de-documentos/Certidao Negativa Federal - CND federal 2026.pdf')
    expect(strFromU8(doMembro.arquivos['LEIA-ME.txt'])).toContain('Você é membro da empresa')

    await expect.poll(() => prisma.auditLog.count({ where: { companyId: dono.companyId, action: 'DADOS_EXPORTADOS' } })).toBe(2)
    const auditoria = await prisma.auditLog.findMany({ where: { companyId: dono.companyId, action: 'DADOS_EXPORTADOS' }, select: { metadata: true } })
    expect(auditoria[0].metadata).toMatchObject({ formato: 'zip', arquivosDoCofre: 1 })

    expect((await fetch(base + '/api/conta/meus-dados.zip')).status).toBe(401)
  })
})
