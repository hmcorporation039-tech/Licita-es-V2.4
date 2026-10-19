import { describe, expect, it } from 'vitest'
import {
  DependenciasDaColetaTceRs,
  ESPERA_ENTRE_TENTATIVAS_MS,
  LIMITES_PADRAO_TCE_RS,
  LimitesDaColetaTceRs,
  MotivoDaDuplicidadeTceRs,
  RedeDoTceRs,
  RegistroDoTceRs,
  anosParaLer,
  coletarTceRs,
  linhaDoResumo,
  semRespostaNoPrazo,
} from '../src/services/tceRsColeta'
import { statusDaColetaTceRs } from '../src/workers/coletorTceRs'
import { NormalizedTender, SituacaoEnum } from '../src/types'
import { caminhoDoAno, redeFalsaDoTceRs, zipDoTceRs } from './helpers/tceRs'

const AGORA = new Date('2026-10-18T12:00:00Z')
const ZIP = zipDoTceRs()
const ARQUIVOS = { [caminhoDoAno(2026)]: ZIP }

interface DepsFalsas extends DependenciasDaColetaTceRs {
  salvos: NormalizedTender[]
  situacoes: { fonteId: string; situacao: SituacaoEnum }[]
  consultas: string[]
}

function depsFalsas(rede: RedeDoTceRs, registros: RegistroDoTceRs[] = [], duplicadas: Record<string, MotivoDaDuplicidadeTceRs> = {}): DepsFalsas {
  const deps: DepsFalsas = {
    salvos: [],
    situacoes: [],
    consultas: [],
    rede,
    registrosSalvos: async () => registros,
    duplicidadeNoPncp: async (tender) => {
      deps.consultas.push(tender.fonteId)
      return duplicadas[tender.fonteId] ?? null
    },
    salvarLote: async (lote) => {
      deps.salvos.push(...lote)
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    },
    atualizarSituacao: async (registro, situacao) => {
      deps.situacoes.push({ fonteId: registro.fonteId, situacao })
    },
  }
  return deps
}

function registro(chave: string, situacao: SituacaoEnum, aberturaAt: string | null, anexos: unknown = []): RegistroDoTceRs {
  return { id: `id-${chave}`, fonteId: `TCE-RS-${chave}`, situacao, aberturaAt: aberturaAt ? new Date(aberturaAt) : null, anexos }
}

function comTeto(nome: string, teto: number): LimitesDaColetaTceRs {
  return { ...LIMITES_PADRAO_TCE_RS, maxComprimido: { ...LIMITES_PADRAO_TCE_RS.maxComprimido, [nome]: teto } }
}

describe('TCE-RS — coleta pelo arquivo anual', () => {
  it('lê só a cauda e as três entradas do ZIP; grava as abertas fora do PNCP com os anexos', async () => {
    const rede = redeFalsaDoTceRs(ARQUIVOS)
    const deps = depsFalsas(rede, [], { 'TCE-RS-47700-2026-PCE-26': 'controle', 'TCE-RS-88004-2026-PCE-558': 'numero' })
    const resumo = await coletarTceRs(deps, AGORA)

    expect(rede.pedidos.map((p) => p.tipo)).toEqual(['cauda', 'trecho', 'trecho', 'trecho'])
    expect(rede.pedidos.every((p) => p.caminho === caminhoDoAno(2026))).toBe(true)
    const trechos = rede.pedidos.filter((p) => p.tipo === 'trecho')
    expect(trechos.reduce((total, p) => total + (p.fim! - p.inicio! + 1), 0)).toBeLessThan(ZIP.length + 3 * 1100)

    expect(resumo).toMatchObject({
      anos: [2026],
      linhasLidas: 25,
      candidatas: 15,
      municipios: 12,
      naoAbertas: 2,
      duplicadasPncpPorControle: 1,
      duplicadasPncpPorNumero: 1,
      arquivosCompletos: true,
      bloqueado: false,
      falhas: [],
    })
    expect(resumo).toMatchObject({ aguardandoPncp: 0, novasForaDoPncp: 11 })
    expect(resumo.novasForaDoPncp).toBe(deps.salvos.length)
    expect(resumo.semMunicipio).toBe(1)
    expect(deps.salvos.every((t) => t.situacao === 'ABERTA' && t.fonte === 'TCE_RS')).toBe(true)
    expect(deps.salvos.map((t) => t.fonteId)).not.toContain('TCE-RS-54400-2026-PCE-28')
    expect(deps.salvos.every((t) => Array.isArray(t.rawJson.anexos) && (t.rawJson.anexos as unknown[]).length > 0)).toBe(true)
    expect(deps.consultas).not.toContain('TCE-RS-54400-2026-PCE-28')
    expect(statusDaColetaTceRs(resumo, null)).toBe('SUCCESS')
    expect(linhaDoResumo(resumo)).toContain('com edital publicado e sessão de hoje em diante: 15 em 12 município(s)')
  })

  it('a publicada ontem espera a coleta seguinte, para o PNCP chegar antes', async () => {
    const capitao = ['TCE-RS-74500-2026-PDE-16', 'TCE-RS-74501-2026-PDE-1']
    const noDiaSeguinte = depsFalsas(redeFalsaDoTceRs(ARQUIVOS))
    const espera = await coletarTceRs(noDiaSeguinte, new Date('2026-10-17T12:00:00Z'))
    expect(espera.aguardandoPncp).toBe(2)
    expect(noDiaSeguinte.salvos.map((t) => t.fonteId)).not.toEqual(expect.arrayContaining([capitao[0]]))
    expect(noDiaSeguinte.consultas).not.toEqual(expect.arrayContaining(capitao))

    const doisDiasDepois = depsFalsas(redeFalsaDoTceRs(ARQUIVOS))
    const gravou = await coletarTceRs(doisDiasDepois, AGORA)
    expect(gravou.aguardandoPncp).toBe(0)
    expect(doisDiasDepois.salvos.map((t) => t.fonteId)).toEqual(expect.arrayContaining(capitao))
  })

  it('sem nenhuma nova fora do PNCP, o arquivo de documentos (o maior) não é baixado', async () => {
    const rede = redeFalsaDoTceRs(ARQUIVOS)
    const todas = new Proxy({}, { get: () => 'objeto' }) as Record<string, MotivoDaDuplicidadeTceRs>
    const resumo = await coletarTceRs(depsFalsas(rede, [], todas), AGORA)
    expect(rede.pedidos.map((p) => p.tipo)).toEqual(['cauda', 'trecho', 'trecho'])
    expect(resumo.novasForaDoPncp).toBe(0)
  })

  it('registro que saiu do edital publicado tem a situação atualizada; o ainda aberto é revisitado com os anexos que já tinha', async () => {
    const anexos = [{ uri: 'https://portal.tce.rs.gov.br/app/silicon-download/documento_licitacao/1', titulo: 'Edital.pdf', tipo: 'EDI' }]
    const registros = [
      registro('85300-2026-PCE-2', 'ABERTA', '2026-02-19T03:00:00Z'),
      registro('51800-2026-PCE-10', 'ABERTA', '2026-04-30T03:00:00Z'),
      registro('54400-2026-PCE-28', 'ABERTA', '2026-10-27T03:00:00Z'),
      registro('54800-2026-CCE-11', 'ABERTA', '2026-10-19T03:00:00Z', anexos),
      registro('63001-2026-PCE-9', 'REVOGADA', '2027-07-08T03:00:00Z'),
      registro('99999-2026-PCE-1', 'ABERTA', '2026-11-30T03:00:00Z'),
    ]
    const deps = depsFalsas(redeFalsaDoTceRs(ARQUIVOS), registros)
    const resumo = await coletarTceRs(deps, AGORA)

    expect(deps.situacoes).toEqual([
      { fonteId: 'TCE-RS-54800-2026-CCE-11', situacao: 'ABERTA' },
      { fonteId: 'TCE-RS-54400-2026-PCE-28', situacao: 'SUSPENSA' },
      { fonteId: 'TCE-RS-85300-2026-PCE-2', situacao: 'ENCERRADA' },
      { fonteId: 'TCE-RS-51800-2026-PCE-10', situacao: 'HOMOLOGADA' },
    ].filter((s) => s.situacao !== 'ABERTA'))
    expect(resumo).toMatchObject({ revisitadas: 4, situacoesAlteradas: 3, sumidas: 1 })
    expect(deps.consultas).not.toContain('TCE-RS-54800-2026-CCE-11')
    const portao = deps.salvos.find((t) => t.fonteId === 'TCE-RS-54800-2026-CCE-11')
    expect(portao?.rawJson.anexos).toEqual(anexos)
    expect(deps.salvos.map((t) => t.fonteId)).not.toContain('TCE-RS-63001-2026-PCE-9')
  })

  it('entrada acima do teto não é baixada e a coleta fica parcial', async () => {
    const rede = redeFalsaDoTceRs(ARQUIVOS)
    const resumo = await coletarTceRs(depsFalsas(rede), AGORA, comTeto('licitacao.csv', 1000))
    expect(rede.pedidos.map((p) => p.tipo)).toEqual(['cauda'])
    expect(resumo.arquivosCompletos).toBe(false)
    expect(resumo.falhas[0]).toMatch(/^2026 \(.*acima do teto/)
    expect(statusDaColetaTceRs(resumo, null)).toBe('FAILED')
  })

  it('arquivo descompactado acima do teto é interrompido no meio da leitura', async () => {
    const resumo = await coletarTceRs(depsFalsas(redeFalsaDoTceRs(ARQUIVOS)), AGORA, { ...LIMITES_PADRAO_TCE_RS, maxOriginal: 5000 })
    expect(resumo.falhas.join(' ')).toMatch(/acima do teto|passou de 5000 bytes/)
    expect(resumo.linhasLidas).toBe(0)
  })

  it('download cortado no meio é repetido; se continuar cortado, a coleta registra a falha', async () => {
    const umaVez = redeFalsaDoTceRs(ARQUIVOS, { cortarTrecho: (vez) => (vez === 0 ? 500 : null) })
    const recuperada = await coletarTceRs(depsFalsas(umaVez), AGORA)
    expect(umaVez.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS])
    expect(recuperada).toMatchObject({ linhasLidas: 25, arquivosCompletos: true })

    const sempre = redeFalsaDoTceRs(ARQUIVOS, { cortarTrecho: () => 500 })
    const falhou = await coletarTceRs(depsFalsas(sempre), AGORA)
    expect(sempre.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS, ESPERA_ENTRE_TENTATIVAS_MS * 2])
    expect(sempre.pedidos.filter((p) => p.tipo === 'trecho')).toHaveLength(3)
    expect(falhou.falhas[0]).toMatch(/download incompleto/)
    expect(falhou.arquivosCompletos).toBe(false)
  })

  it('servidor que demora a começar a responder é cancelado no tempo máximo e repetido', async () => {
    const limites = { ...LIMITES_PADRAO_TCE_RS, tempoMaximoPorArquivoMs: 40 }
    const umaVez = redeFalsaDoTceRs(ARQUIVOS, { pendurarTrecho: (vez) => vez === 0 })
    const recuperada = await coletarTceRs(depsFalsas(umaVez), AGORA, limites)
    expect(umaVez.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS])
    expect(recuperada).toMatchObject({ linhasLidas: 25, arquivosCompletos: true })

    const sempre = redeFalsaDoTceRs(ARQUIVOS, { pendurarTrecho: () => true })
    const falhou = await coletarTceRs(depsFalsas(sempre), AGORA, limites)
    expect(sempre.pedidos.filter((p) => p.tipo === 'trecho')).toHaveLength(3)
    expect(falhou.falhas[0]).toMatch(/download incompleto \(tempo esgotado/)
    expect(falhou.arquivosCompletos).toBe(false)
  })

  it('download que para de chegar no meio é derrubado pelo silêncio e repetido', async () => {
    const limites = { ...LIMITES_PADRAO_TCE_RS, maxSilencioMs: 40 }
    const umaVez = redeFalsaDoTceRs(ARQUIVOS, { silenciarTrecho: (vez) => vez === 0 })
    const recuperada = await coletarTceRs(depsFalsas(umaVez), AGORA, limites)
    expect(umaVez.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS])
    expect(recuperada).toMatchObject({ linhasLidas: 25, arquivosCompletos: true })

    const sempre = redeFalsaDoTceRs(ARQUIVOS, { silenciarTrecho: () => true })
    const falhou = await coletarTceRs(depsFalsas(sempre), AGORA, limites)
    expect(falhou.falhas[0]).toMatch(/sem dados do servidor por 0 s/)
    expect(falhou.arquivosCompletos).toBe(false)
  })

  it('timeout do axios vira download incompleto (repetível) com o prazo no texto', () => {
    const timeout = Object.assign(new Error('timeout of 180000ms exceeded'), { code: 'ECONNABORTED', isAxiosError: true })
    expect(String(semRespostaNoPrazo(timeout, 180_000))).toMatch(/download incompleto \(o servidor não começou a responder em 180 s\)/)
    const outro = new Error('outro')
    expect(semRespostaNoPrazo(outro, 180_000)).toBe(outro)
  })

  it('403 ou 429 param tudo na hora, sem repetir', async () => {
    const naCauda = redeFalsaDoTceRs(ARQUIVOS, { statusDaCauda: () => 403 })
    const resumo = await coletarTceRs(depsFalsas(naCauda), new Date('2026-01-10T12:00:00Z'))
    expect(naCauda.pedidos).toHaveLength(1)
    expect(resumo).toMatchObject({ bloqueado: true, arquivosCompletos: false })
    expect(statusDaColetaTceRs(resumo, null)).toBe('FAILED')

    const noTrecho = redeFalsaDoTceRs(ARQUIVOS, { statusDoTrecho: (vez) => (vez === 1 ? 429 : 206) })
    const parcial = await coletarTceRs(depsFalsas(noTrecho), AGORA)
    expect(noTrecho.pedidos.map((p) => p.tipo)).toEqual(['cauda', 'trecho', 'trecho'])
    expect(noTrecho.esperas).toEqual([])
    expect(parcial).toMatchObject({ bloqueado: true, linhasLidas: 0 })
    expect(linhaDoResumo(parcial)).toContain('BLOQUEADO')
  })

  it('servidor que ignora o pedido de trecho (HTTP 200) não tem o arquivo inteiro baixado', async () => {
    const rede = redeFalsaDoTceRs(ARQUIVOS, { statusDoTrecho: () => 200 })
    const resumo = await coletarTceRs(depsFalsas(rede), AGORA)
    expect(rede.pedidos.filter((p) => p.tipo === 'trecho')).toHaveLength(1)
    expect(rede.corposDestruidos).toBeGreaterThanOrEqual(1)
    expect(resumo.falhas[0]).toMatch(/não devolveu o trecho pedido \(HTTP 200\)/)
  })

  it('no primeiro trimestre lê também o ano anterior; arquivo do ano anterior ausente não é falha', async () => {
    expect(anosParaLer(new Date('2026-02-10T12:00:00Z'))).toEqual([2026, 2025])
    expect(anosParaLer(new Date('2026-04-01T12:00:00Z'))).toEqual([2026])
    expect(anosParaLer(new Date('2027-01-01T02:00:00Z'))).toEqual([2026])

    const rede = redeFalsaDoTceRs({ [caminhoDoAno(2026)]: ZIP })
    const resumo = await coletarTceRs(depsFalsas(rede), new Date('2026-03-31T12:00:00Z'))
    expect(rede.pedidos.filter((p) => p.tipo === 'cauda').map((p) => p.caminho)).toEqual([caminhoDoAno(2026), caminhoDoAno(2025)])
    expect(resumo.falhas).toEqual([])

    const semOAtual = await coletarTceRs(depsFalsas(redeFalsaDoTceRs({})), AGORA)
    expect(semOAtual.falhas[0]).toMatch(/arquivo de 2026 não encontrado/)
  })

  it('ZIP sem compressão também é lido', async () => {
    const guardado = zipDoTceRs({}, 0)
    const resumo = await coletarTceRs(depsFalsas(redeFalsaDoTceRs({ [caminhoDoAno(2026)]: guardado })), AGORA)
    expect(resumo).toMatchObject({ linhasLidas: 25, candidatas: 15, arquivosCompletos: true })
  })
})
