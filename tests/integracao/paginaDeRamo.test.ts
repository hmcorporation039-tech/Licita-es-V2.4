import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Página pública de ramo (SEO)', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const DIA = 86_400_000

  function licitacao(n: number, objeto: string, uf: string, municipio: string, encerraEmDias: number | null) {
    return {
      fonte: 'PNCP' as const,
      fonteId: `ramo-${sufixo}-${n}`,
      modalidade: 'PREGAO_ELETRONICO' as const,
      objeto,
      objetoNorm: objeto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
      uf,
      municipio,
      municipioNorm: municipio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
      orgao: 'Prefeitura de Teste',
      encerramentoAt: encerraEmDias === null ? null : new Date(Date.now() + encerraEmDias * DIA),
      situacao: 'ABERTA' as const,
      contentHash: `${sufixo}-${n}`,
      rawJson: {},
    }
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
    await prisma.tender.createMany({
      data: [
        licitacao(1, `Aquisição de vassouras ${sufixo}`, 'GO', 'Anápolis', 3),
        licitacao(2, `Aquisição de rodos ${sufixo}`, 'GO', 'Anápolis', 5),
        licitacao(3, `Vassouras e rodos ${sufixo}`, 'GO', 'Goiânia', 1),
        licitacao(4, `Escolas: rodos ${sufixo}`, 'BA', 'Salvador', 8),
        licitacao(5, `Vassouras já encerradas ${sufixo}`, 'GO', 'Goiânia', -2),
      ],
    })
  })

  afterAll(async () => {
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `ramo-${sufixo}` } } })
    server?.close()
    desconectar()
  })

  it('junta os termos sem repetir, ordena pelo prazo e mostra a distribuição por estado e cidade', async () => {
    const termos = [`vassouras ${sufixo}`, `rodos ${sufixo}`].join(',')
    const r = await fetch(`${base}/api/public/ramo?termos=${encodeURIComponent(termos)}`)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as {
      total: number
      amostras: Array<{ objeto: string; local: string }>
      porUf: Array<{ uf: string; total: number }>
      porMunicipio: Array<{ municipio: string; uf: string; total: number }>
    }
    expect(corpo.total).toBe(4)
    expect(corpo.amostras.map((a) => a.objeto)).toEqual([
      `Vassouras e rodos ${sufixo}`,
      `Aquisição de vassouras ${sufixo}`,
      `Aquisição de rodos ${sufixo}`,
      `Escolas: rodos ${sufixo}`,
    ])
    expect(corpo.porUf).toEqual([
      { uf: 'GO', total: 3 },
      { uf: 'BA', total: 1 },
    ])
    expect(corpo.porMunicipio[0]).toEqual({ municipio: 'Anápolis', uf: 'GO', total: 2 })
  })

  it('filtra pelo estado e não repete a distribuição por estado', async () => {
    const r = await fetch(`${base}/api/public/ramo?termos=${encodeURIComponent(`rodos ${sufixo}`)}&uf=ba`)
    const corpo = (await r.json()) as { total: number; porUf: unknown[]; amostras: Array<{ local: string }> }
    expect(corpo.total).toBe(1)
    expect(corpo.porUf).toEqual([])
    expect(corpo.amostras[0].local).toBe('Salvador/BA')
  })

  it('recusa termo curto ou termos demais', async () => {
    expect((await fetch(`${base}/api/public/ramo?termos=ab`)).status).toBe(400)
    expect((await fetch(`${base}/api/public/ramo?termos=${encodeURIComponent('aaa,bbb,ccc,ddd,eee')}`)).status).toBe(400)
  })
})
