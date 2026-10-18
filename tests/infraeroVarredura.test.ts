import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { decodificarHtml } from '../src/services/sescRegional/tipos'
import {
  ESPERA_ANTES_DA_SONDA_APOS_FALHAS_MS,
  ESPERA_ENTRE_TENTATIVAS_MS,
  INFRAERO_ID_INICIAL,
  LimitesDaVarredura,
  RECUO_DO_CURSOR,
  RedeDaInfraero,
  RegistroDaInfraero,
  SALTOS_DAS_SONDAS_APOS_FALHAS,
  TAMANHO_DO_TRECHO_DIAGNOSTICO,
  deveGravarNova,
  escolherRevisitas,
  inicioDaVarredura,
  lerDetalhe,
  motivoDaFalhaDaVarredura,
  statusDaColetaInfraero,
  varrerNovos,
} from '../src/services/infraeroVarredura'
import { infraeroClient } from '../src/lib/httpClient'
import { NormalizedTender } from '../src/types'

const PASTA = join(__dirname, 'fixtures', 'infraero')
const ENCONTRADA = decodificarHtml(readFileSync(join(PASTA, 'detalhe-178262.html')), 'text/html; charset=ISO-8859-1')
const NAO_ENCONTRADA = decodificarHtml(readFileSync(join(PASTA, 'detalhe-178200-nao-encontrado.html')), 'text/html; charset=ISO-8859-1')
const LIMITES: LimitesDaVarredura = { maxRequisicoes: 100, naoEncontradosParaParar: 3, saltoDaSonda: 10 }

function erroDeRede(status?: number) {
  return Object.assign(new Error(status ? `Request failed with status code ${status}` : 'socket hang up'), {
    isAxiosError: true,
    code: status ? 'ERR_BAD_RESPONSE' : 'ECONNRESET',
    ...(status ? { response: { status } } : {}),
  })
}

function redeFalsa(existentes: Iterable<number>, falhas: Map<number, unknown[]> = new Map()) {
  const ids = new Set(existentes)
  const pedidos: number[] = []
  const esperas: number[] = []
  let emAndamento = 0
  let maximoSimultaneo = 0
  const rede: RedeDaInfraero = {
    baixarDetalhe: async (id) => {
      pedidos.push(id)
      emAndamento++
      maximoSimultaneo = Math.max(maximoSimultaneo, emAndamento)
      await Promise.resolve()
      emAndamento--
      const fila = falhas.get(id)
      if (fila && fila.length > 0) throw fila.shift()
      return ids.has(id) ? ENCONTRADA : NAO_ENCONTRADA
    },
    esperar: async (ms) => {
      esperas.push(ms)
    },
  }
  return { rede, pedidos, esperas, simultaneos: () => maximoSimultaneo }
}

describe('cursor da varredura da Infraero', () => {
  it('sem nada coletado começa no id inicial', () => {
    expect(inicioDaVarredura(null)).toBe(INFRAERO_ID_INICIAL)
  })

  it('recua um pouco antes do maior id já gravado', () => {
    expect(inicioDaVarredura(178_300)).toBe(178_300 - RECUO_DO_CURSOR)
  })

  it('nunca volta para antes do id inicial', () => {
    expect(inicioDaVarredura(INFRAERO_ID_INICIAL + 3)).toBe(INFRAERO_ID_INICIAL)
  })
})

describe('varrerNovos', () => {
  it('avança id a id, pula buracos curtos e para depois de N não encontrados seguidos e da sonda', async () => {
    const { rede, pedidos, simultaneos } = redeFalsa([100, 101, 103, 105])
    const r = await varrerNovos(100, rede, LIMITES)
    expect(r.lidas.map((l) => l.idLicitacao)).toEqual([100, 101, 103, 105])
    expect(pedidos).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 119])
    expect(r.motivoDaParada).toBe('nao_encontrados')
    expect(r.naoEncontrados).toBe(6)
    expect(r.requisicoes).toBe(10)
    expect(r.ultimoIdVisitado).toBe(119)
    expect(simultaneos()).toBe(1)
  })

  it('atravessa um buraco longo quando a sonda acha licitação mais à frente', async () => {
    const { rede, pedidos } = redeFalsa([100, 110, 111, 114])
    const r = await varrerNovos(100, rede, LIMITES)
    expect(r.lidas.map((l) => l.idLicitacao).sort((a, b) => a - b)).toEqual([100, 110, 111, 114])
    expect(pedidos.filter((id) => id === 114)).toHaveLength(1)
    expect(pedidos.at(-1)).toBe(126)
    expect(pedidos.slice(0, 5)).toEqual([100, 101, 102, 103, 114])
    expect(r.motivoDaParada).toBe('nao_encontrados')
  })

  it('respeita o teto de requisições por coleta', async () => {
    const { rede, pedidos } = redeFalsa(Array.from({ length: 1000 }, (_, i) => 100 + i))
    const r = await varrerNovos(100, rede, { ...LIMITES, maxRequisicoes: 7 })
    expect(pedidos).toHaveLength(7)
    expect(r.motivoDaParada).toBe('limite')
    expect(r.ultimoIdVisitado).toBe(106)
  })

  it('tenta de novo com espera crescente quando a rede falha e segue adiante', async () => {
    const falhas = new Map<number, unknown[]>([[101, [erroDeRede(), erroDeRede(503)]]])
    const { rede, pedidos, esperas } = redeFalsa([100, 101, 102], falhas)
    const r = await varrerNovos(100, rede, LIMITES)
    expect(r.lidas.map((l) => l.idLicitacao)).toEqual([100, 101, 102])
    expect(esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS, ESPERA_ENTRE_TENTATIVAS_MS * 2])
    expect(pedidos.filter((id) => id === 101)).toHaveLength(3)
    expect(r.falhas).toEqual([])
  })

  it('não insiste em erro que não é passageiro e registra a falha', async () => {
    const falhas = new Map<number, unknown[]>([[101, [erroDeRede(404)]]])
    const { rede, esperas } = redeFalsa([100, 101, 102], falhas)
    const r = await varrerNovos(100, rede, LIMITES)
    expect(esperas).toEqual([])
    expect(r.falhas).toEqual(['101 (HTTP 404 ERR_BAD_RESPONSE)'])
    expect(r.lidas.map((l) => l.idLicitacao)).toEqual([100, 102])
  })

  it('desiste da coleta quando o portal cai de vez, mas só depois de sondar ids espalhados à frente com espera crescente', async () => {
    const pedidos: number[] = []
    const esperas: number[] = []
    const rede: RedeDaInfraero = {
      baixarDetalhe: async (id) => {
        pedidos.push(id)
        throw erroDeRede()
      },
      esperar: async (ms) => {
        esperas.push(ms)
      },
    }
    const r = await varrerNovos(100, rede, LIMITES)
    expect(r.motivoDaParada).toBe('falhas')
    const sondados = SALTOS_DAS_SONDAS_APOS_FALHAS.map((salto) => 102 + salto)
    expect([...new Set(pedidos)]).toEqual([100, 101, 102, ...sondados])
    expect(r.falhas).toHaveLength(3 + sondados.length)
    expect(esperas.filter((ms) => ms >= ESPERA_ANTES_DA_SONDA_APOS_FALHAS_MS)).toEqual(
      SALTOS_DAS_SONDAS_APOS_FALHAS.map((_, i) => ESPERA_ANTES_DA_SONDA_APOS_FALHAS_MS * 2 ** i)
    )
  })

  it('não desiste no primeiro id: se a sonda à frente responde, a varredura segue e não pede o mesmo id duas vezes', async () => {
    const sempre = () => Array.from({ length: 5 }, () => erroDeRede())
    const falhas = new Map<number, unknown[]>([[100, sempre()], [101, sempre()], [102, sempre()]])
    const sonda = 102 + SALTOS_DAS_SONDAS_APOS_FALHAS[0]
    const { rede, pedidos } = redeFalsa([104, sonda], falhas)
    const r = await varrerNovos(100, rede, { ...LIMITES, naoEncontradosParaParar: 40 })
    expect(r.lidas.map((l) => l.idLicitacao).sort((a, b) => a - b)).toEqual([104, sonda])
    expect(pedidos.filter((id) => id === sonda)).toHaveLength(1)
    expect(r.falhas).toHaveLength(3)
    expect(r.motivoDaParada).not.toBe('falhas')
  })

  it('página de bloqueio do portal conta como página inesperada, com diagnóstico, nunca como "não encontrado"', async () => {
    const bloqueio = `<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.<br><br>Your support ID is: 1234567890${' '.repeat(50)}${'x'.repeat(400)}</body></html>`
    const rede: RedeDaInfraero = {
      baixarDetalhe: async (id) => ({
        html: bloqueio,
        status: 200,
        urlFinal: `https://licitacao.infraero.gov.br/portal_licitacao/servlet/DetalheLicitacao;jsessionid=ABC123?idLicitacao=${id}&token=segredo`,
        tipoDeConteudo: 'text/html; charset=utf-8',
      }),
      esperar: async () => undefined,
    }
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = await varrerNovos(INFRAERO_ID_INICIAL, rede, LIMITES)
    const primeiroAviso = String(avisos.mock.calls[0]?.[0] ?? '')
    avisos.mockRestore()

    expect(r.motivoDaParada).toBe('falhas')
    expect(r.naoEncontrados).toBe(0)
    expect(r.lidas).toEqual([])
    expect(r.paginasInesperadas).toBe(r.falhas.length)
    expect(r.ultimaPaginaInesperada).toMatchObject({ status: 200, tipoDeConteudo: 'text/html; charset=utf-8', tamanho: bloqueio.length })
    expect(r.ultimaPaginaInesperada?.urlFinal).toMatch(/^https:\/\/licitacao\.infraero\.gov\.br\/portal_licitacao\/servlet\/DetalheLicitacao\?idLicitacao=\d+$/)
    expect(r.ultimaPaginaInesperada?.inicio).toContain('The requested URL was rejected')
    expect(r.ultimaPaginaInesperada?.inicio.length).toBe(TAMANHO_DO_TRECHO_DIAGNOSTICO)
    expect(r.falhas[0]).toBe(`${INFRAERO_ID_INICIAL} (página inesperada: HTTP 200, text/html; charset=utf-8, ${bloqueio.length} caracteres)`)
    expect(primeiroAviso).toContain(`id ${INFRAERO_ID_INICIAL}: HTTP 200, text/html; charset=utf-8, ${bloqueio.length} caracteres, URL final https://licitacao.infraero.gov.br/`)
    expect(primeiroAviso).not.toContain('segredo')
    expect(primeiroAviso).not.toContain('ABC123')

    const motivo = motivoDaFalhaDaVarredura(r)
    expect(motivo).toContain('Varredura da Infraero interrompida')
    expect(motivo).toContain('HTTP 200')
    expect(motivo).toContain('The requested URL was rejected')
    expect(statusDaColetaInfraero({ motivoDaParada: r.motivoDaParada, respostasValidas: 0, falhas: r.falhas, motivoDaFalha: motivo }, null)).toEqual({
      status: 'FAILED',
      errorMsg: motivo,
    })
  })

  it('status da coleta: falha parcial com respostas válidas é PARTIAL, erro geral é FAILED com motivo', () => {
    expect(statusDaColetaInfraero({ motivoDaParada: 'falhas', respostasValidas: 4, falhas: ['1 (x)'], motivoDaFalha: 'm' }, null)).toEqual({ status: 'PARTIAL', errorMsg: 'm' })
    expect(statusDaColetaInfraero({ motivoDaParada: 'nao_encontrados', respostasValidas: 9, falhas: [], motivoDaFalha: null }, null)).toEqual({ status: 'SUCCESS' })
    expect(statusDaColetaInfraero(null, 'ECONNRESET')).toEqual({ status: 'FAILED', errorMsg: 'Coleta da Infraero não terminou: ECONNRESET' })
  })

  it('página fora do formato é falha, não "não encontrado"', async () => {
    const rede: RedeDaInfraero = { baixarDetalhe: async () => '<html><body>manutenção</body></html>', esperar: async () => undefined }
    await expect(lerDetalhe(1, rede)).rejects.toThrow(/fora do formato/)
  })
})

describe('regras de gravação e revisita', () => {
  const agora = new Date('2026-10-17T15:00:00Z')
  const tender = (over: Partial<NormalizedTender>): NormalizedTender => ({
    fonte: 'INFRAERO',
    fonteId: 'INFRAERO-1',
    modalidade: 'CONCORRENCIA',
    objeto: 'x',
    rawJson: {},
    ...over,
  })

  it('grava a nova só se ainda vai ter sessão, ou se está suspensa', () => {
    expect(deveGravarNova(tender({ situacao: 'ABERTA', aberturaAt: new Date('2026-10-20T12:00:00Z') }), agora)).toBe(true)
    expect(deveGravarNova(tender({ situacao: 'ABERTA', aberturaAt: new Date('2026-10-17T12:00:00Z') }), agora)).toBe(true)
    expect(deveGravarNova(tender({ situacao: 'ABERTA', aberturaAt: new Date('2026-10-16T12:00:00Z') }), agora)).toBe(false)
    expect(deveGravarNova(tender({ situacao: 'SUSPENSA', aberturaAt: new Date('2026-10-08T12:00:00Z') }), agora)).toBe(true)
    expect(deveGravarNova(tender({ situacao: 'CANCELADA', aberturaAt: new Date('2026-10-30T12:00:00Z') }), agora)).toBe(false)
    expect(deveGravarNova(tender({ situacao: 'ABERTA' }), agora)).toBe(false)
  })

  it('revisita as abertas e suspensas, as menos conferidas primeiro, com teto', () => {
    const r = (idLicitacao: number, over: Partial<RegistroDaInfraero> = {}): RegistroDaInfraero => ({
      id: `t${idLicitacao}`,
      idLicitacao,
      situacao: 'ABERTA',
      aberturaAt: new Date('2026-10-30T12:00:00Z'),
      situacaoCheckedAt: null,
      ...over,
    })
    const registros = [
      r(1, { situacaoCheckedAt: new Date('2026-10-16T00:00:00Z') }),
      r(2),
      r(3, { situacao: 'HOMOLOGADA' }),
      r(4, { aberturaAt: new Date('2026-09-01T12:00:00Z') }),
      r(5, { situacao: 'SUSPENSA', aberturaAt: new Date('2026-09-01T12:00:00Z'), situacaoCheckedAt: new Date('2026-10-15T00:00:00Z') }),
      r(6),
      r(7, { aberturaAt: new Date('2026-10-12T12:00:00Z') }),
    ]
    expect(escolherRevisitas(registros, new Set([6]), agora).map((x) => x.idLicitacao)).toEqual([2, 7, 5, 1])
    expect(escolherRevisitas(registros, new Set(), agora, 2).map((x) => x.idLicitacao)).toEqual([2, 6])
  })
})

describe('cliente HTTP da Infraero', () => {
  it('vai por HTTPS ao host do portal, pedindo HTML e se identificando', () => {
    expect(infraeroClient.defaults.baseURL).toBe('https://licitacao.infraero.gov.br')
    expect(infraeroClient.defaults.timeout).toBe(30_000)
    const cabecalhos = infraeroClient.defaults.headers as unknown as Record<string, string>
    expect(cabecalhos['User-Agent']).toMatch(/^LicitacaoMonitor\//)
    expect(cabecalhos.Accept).toContain('text/html')
  })
})
