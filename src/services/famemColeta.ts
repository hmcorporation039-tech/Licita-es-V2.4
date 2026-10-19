import { DESLOCAMENTO_DE_BRASILIA_MS } from '../lib/dataDeBrasilia'
import { normalize } from '../lib/geoService'
import { NormalizedTender } from '../types'
import {
  MunicipioDaFamem,
  PublicacaoDaFamem,
  avaliarPublicacao,
  avisosDaPublicacao,
  lerListaDaFamem,
  lerPublicacaoDaFamem,
  municipioDaPublicacao,
} from './famemParser'
import { ClienteRedisDaMemoria, ContagemDoSalvamento, MemoriaDeDiarios, memoriaDeDiariosNoRedis } from './queridoDiarioColeta'
import { statusDaResposta } from './queridoDiarioService'

export const ESPACO_ENTRE_REQUISICOES_MS = 2_000
export const ESPERAS_APOS_ERRO_DO_SERVIDOR_MS = [10_000, 30_000]
export const FALHAS_SEGUIDAS_PARA_PARAR = 3
export const CHAVE_DAS_PUBLICACOES_LIDAS = 'famem:publicacoes-lidas'
export const DIAS_NA_MEMORIA = 40

const DIA_MS = 86_400_000
const CODIGOS_DE_ERRO_DE_REDE = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE'])

export interface LimitesDaColetaFamem {
  diasDaJanela: number
  maxRequisicoes: number
  maxPublicacoesLidas: number
  tempoMaximoMs: number
  maxItensNaLista: number
}

export const LIMITES_PADRAO_FAMEM: LimitesDaColetaFamem = {
  diasDaJanela: 30,
  maxRequisicoes: 80,
  maxPublicacoesLidas: 60,
  tempoMaximoMs: 20 * 60_000,
  maxItensNaLista: 5_000,
}

export interface RedeDaFamem {
  abrirSessao(): Promise<string>
  baixarLista(cookie: string): Promise<string>
  baixarPublicacao(id: string): Promise<string>
}

export interface DependenciasDaColetaFamem {
  rede: RedeDaFamem
  existeNoPncp(tender: NormalizedTender, agora: Date): Promise<boolean>
  existeNoQueridoDiario(tender: NormalizedTender): Promise<boolean>
  prepararRepublicacao(tender: NormalizedTender): Promise<NormalizedTender | null>
  salvarLote(lote: NormalizedTender[]): Promise<ContagemDoSalvamento>
  memoria: MemoriaDeDiarios
  esperar(ms: number): Promise<void>
  agora(): number
}

export type MotivoDaParadaFamem =
  | 'concluida'
  | 'tempo'
  | 'requisicoes'
  | 'publicacoes'
  | 'bloqueio'
  | 'falhas'
  | 'semSessao'
  | 'listaVazia'
  | 'listaIlegivel'

export interface ResultadoDaColetaFamem {
  janela: { dataInicio: string; dataFim: string }
  requisicoes: number
  publicacoesNaLista: number
  totalAnunciado: number
  naJanela: number
  outrosAtos: number
  contratacoesDiretasPeloTitulo: number
  semMunicipio: number
  jaLidasAntes: number
  candidatas: number
  lidas: number
  falhasDeLeitura: number
  pendentes: number
  avisos: number
  descartadosPorPncpNoTexto: number
  semDataDaSessao: number
  sessaoJaPassou: number
  contratacoesDiretasNoTexto: number
  comSessaoFutura: number
  duplicadosDoPncp: number
  duplicadosDoQueridoDiario: number
  totalFetched: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  municipiosEnviados: string[]
  houveFalhas: boolean
  motivoDaParada: MotivoDaParadaFamem
}

export class BloqueioDaFamem extends Error {
  constructor(readonly status: number | undefined) {
    super(`FAMEM recusou as requisições (HTTP ${status ?? '?'})`)
  }
}

class OrcamentoEsgotado extends Error {}

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function ehRecusaDaFamem(status: number | undefined): boolean {
  return status === 401 || status === 403 || status === 429 || (status !== undefined && status >= 300 && status < 400)
}

export function ehErroPassageiro(err: unknown): boolean {
  const status = statusDaResposta(err)
  if (status !== undefined) return status >= 500
  const codigo = (err as { code?: unknown } | null)?.code
  return typeof codigo === 'string' && CODIGOS_DE_ERRO_DE_REDE.has(codigo)
}

export function memoriaDaFamemNoRedis(redis: ClienteRedisDaMemoria, agora: () => number = Date.now): MemoriaDeDiarios {
  return memoriaDeDiariosNoRedis(redis, agora, { chave: CHAVE_DAS_PUBLICACOES_LIDAS, dias: DIAS_NA_MEMORIA, rotulo: 'FAMEM' })
}

function diaEmBrasilia(instante: number): string {
  return new Date(instante - DESLOCAMENTO_DE_BRASILIA_MS).toISOString().slice(0, 10)
}

export function janelaDaFamem(agora: Date, dias: number): { dataInicio: string; dataFim: string } {
  return {
    dataInicio: diaEmBrasilia(agora.getTime() - (Math.max(1, dias) - 1) * DIA_MS),
    dataFim: diaEmBrasilia(agora.getTime()),
  }
}

function mesmaEntidade(a: string, b: string): boolean {
  const chave = (t: string) => normalize(t).replace(/[^a-z0-9]/g, '')
  return chave(a) === chave(b)
}

function resultadoVazio(janela: { dataInicio: string; dataFim: string }): ResultadoDaColetaFamem {
  return {
    janela,
    requisicoes: 0,
    publicacoesNaLista: 0,
    totalAnunciado: 0,
    naJanela: 0,
    outrosAtos: 0,
    contratacoesDiretasPeloTitulo: 0,
    semMunicipio: 0,
    jaLidasAntes: 0,
    candidatas: 0,
    lidas: 0,
    falhasDeLeitura: 0,
    pendentes: 0,
    avisos: 0,
    descartadosPorPncpNoTexto: 0,
    semDataDaSessao: 0,
    sessaoJaPassou: 0,
    contratacoesDiretasNoTexto: 0,
    comSessaoFutura: 0,
    duplicadosDoPncp: 0,
    duplicadosDoQueridoDiario: 0,
    totalFetched: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    municipiosEnviados: [],
    houveFalhas: false,
    motivoDaParada: 'concluida',
  }
}

export async function coletarDaFamem(
  dep: DependenciasDaColetaFamem,
  limites: LimitesDaColetaFamem = LIMITES_PADRAO_FAMEM
): Promise<ResultadoDaColetaFamem> {
  const inicio = dep.agora()
  const agora = new Date(inicio)
  const janela = janelaDaFamem(agora, limites.diasDaJanela)
  const r = resultadoVazio(janela)
  const municipiosEnviados = new Set<string>()
  let falhasSeguidas = 0

  const parar = (motivo: MotivoDaParadaFamem) => {
    if (r.motivoDaParada === 'concluida') r.motivoDaParada = motivo
  }

  const orcamentoAcabou = (): boolean => {
    if (r.motivoDaParada !== 'concluida') return true
    if (dep.agora() - inicio >= limites.tempoMaximoMs) parar('tempo')
    else if (r.requisicoes >= limites.maxRequisicoes) parar('requisicoes')
    return r.motivoDaParada !== 'concluida'
  }

  const requisitar = async <T>(descricao: string, pedir: () => Promise<T>): Promise<T> => {
    for (let tentativa = 0; ; tentativa++) {
      if (orcamentoAcabou()) throw new OrcamentoEsgotado()
      if (r.requisicoes > 0) await dep.esperar(ESPACO_ENTRE_REQUISICOES_MS)
      r.requisicoes++
      try {
        return await pedir()
      } catch (err) {
        const status = statusDaResposta(err)
        if (ehRecusaDaFamem(status)) throw new BloqueioDaFamem(status)
        const espera = ESPERAS_APOS_ERRO_DO_SERVIDOR_MS[tentativa]
        if (!ehErroPassageiro(err) || espera === undefined) throw err
        console.warn(`[FAMEM] ${descricao} falhou (${mensagemDoErro(err)}) — nova tentativa em ${Math.round(espera / 1000)}s`)
        await dep.esperar(espera)
      }
    }
  }

  const tratarErro = (err: unknown, descricao: string, motivoSeFalhar: MotivoDaParadaFamem | null): void => {
    if (err instanceof OrcamentoEsgotado) return
    r.houveFalhas = true
    if (err instanceof BloqueioDaFamem) {
      parar('bloqueio')
      console.error(`[FAMEM] ${descricao} interrompida: ${err.message}`)
      return
    }
    console.error(`[FAMEM] ${descricao} falhou:`, mensagemDoErro(err))
    if (motivoSeFalhar) parar(motivoSeFalhar)
    else if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) parar('falhas')
  }

  const salvarAvisos = async (tenders: NormalizedTender[], descricao: string): Promise<boolean> => {
    let completo = true
    const lote: NormalizedTender[] = []
    for (const tender of tenders) {
      try {
        if (await dep.existeNoPncp(tender, agora)) {
          r.duplicadosDoPncp++
          continue
        }
        if (await dep.existeNoQueridoDiario(tender)) {
          r.duplicadosDoQueridoDiario++
          continue
        }
        const ajustado = await dep.prepararRepublicacao(tender)
        if (ajustado) lote.push(ajustado)
        else r.totalDupes++
      } catch (err) {
        completo = false
        r.houveFalhas = true
        console.error(`[FAMEM] Erro ao conferir ${tender.fonteId}:`, mensagemDoErro(err))
      }
    }
    if (lote.length === 0) return completo

    r.totalFetched += lote.length
    for (const tender of lote) if (tender.municipioIbge) municipiosEnviados.add(tender.municipioIbge)
    try {
      const salvos = await dep.salvarLote(lote)
      r.totalNew += salvos.totalNew
      r.totalDupes += salvos.totalDupes
      r.totalUpdated += salvos.totalUpdated
      return completo && salvos.totalNew + salvos.totalDupes + (salvos.totalDescartadas ?? 0) === lote.length
    } catch (err) {
      r.houveFalhas = true
      console.error(`[FAMEM] Erro ao salvar os avisos de ${descricao}:`, mensagemDoErro(err))
      return false
    }
  }

  const lerPublicacao = async (publicacao: PublicacaoDaFamem, municipio: MunicipioDaFamem): Promise<void> => {
    const descricao = `publicação ${publicacao.id} (${publicacao.entidade})`
    let html: string
    try {
      html = await requisitar(`Leitura da ${descricao}`, () => dep.rede.baixarPublicacao(publicacao.id))
    } catch (err) {
      if (!(err instanceof OrcamentoEsgotado)) r.falhasDeLeitura++
      tratarErro(err, `Leitura da ${descricao}`, null)
      return
    }

    const materia = lerPublicacaoDaFamem(html)
    if (!materia || !mesmaEntidade(materia.entidade, publicacao.entidade)) {
      r.falhasDeLeitura++
      tratarErro(new Error(materia ? `entidade "${materia.entidade}" diferente da lista` : 'página sem a publicação'), `Leitura da ${descricao}`, null)
      return
    }

    falhasSeguidas = 0
    r.lidas++
    const resultado = avisosDaPublicacao(materia, publicacao, municipio, agora)
    r.avisos += resultado.avisos
    r.descartadosPorPncpNoTexto += resultado.descartadosPorPncp
    r.semDataDaSessao += resultado.semDataDaSessao
    r.sessaoJaPassou += resultado.sessaoJaPassou
    r.contratacoesDiretasNoTexto += resultado.contratacoesDiretas
    r.comSessaoFutura += resultado.tenders.length

    if (await salvarAvisos(resultado.tenders, descricao)) await dep.memoria.marcarLido(publicacao.id)
  }

  let cookie: string
  try {
    cookie = await requisitar('Abertura da sessão', () => dep.rede.abrirSessao())
  } catch (err) {
    tratarErro(err, 'Abertura da sessão', 'semSessao')
    return r
  }

  let corpo: string
  try {
    corpo = await requisitar('Lista de publicações', () => dep.rede.baixarLista(cookie))
  } catch (err) {
    tratarErro(err, 'Lista de publicações', 'listaIlegivel')
    return r
  }

  let publicacoes: PublicacaoDaFamem[]
  try {
    const lista = lerListaDaFamem(corpo)
    publicacoes = lista.publicacoes
    r.totalAnunciado = lista.total
  } catch (err) {
    tratarErro(err, 'Leitura da lista', 'listaIlegivel')
    return r
  }

  r.publicacoesNaLista = publicacoes.length
  if (publicacoes.length === 0) {
    r.houveFalhas = true
    parar('listaVazia')
    console.error('[FAMEM] A lista de publicações veio vazia — a sessão do site não foi reconhecida ou o site mudou')
    return r
  }
  if (publicacoes.length > limites.maxItensNaLista) {
    console.warn(`[FAMEM] Lista com ${publicacoes.length} publicações — só as ${limites.maxItensNaLista} primeiras serão consideradas`)
    publicacoes = publicacoes.slice(0, limites.maxItensNaLista)
  }

  const naJanela = publicacoes.filter((p) => p.publicadaEm >= janela.dataInicio && p.publicadaEm <= janela.dataFim)
  r.naJanela = naJanela.length

  const candidatas: { publicacao: PublicacaoDaFamem; municipio: MunicipioDaFamem }[] = []
  const vistas = new Set<string>()
  for (const publicacao of naJanela) {
    if (vistas.has(publicacao.id)) continue
    vistas.add(publicacao.id)
    const avaliacao = avaliarPublicacao(publicacao)
    if (avaliacao === 'outroAto') {
      r.outrosAtos++
      continue
    }
    if (avaliacao === 'contratacaoDireta') {
      r.contratacoesDiretasPeloTitulo++
      continue
    }
    const municipio = municipioDaPublicacao(publicacao.entidade)
    if (!municipio) {
      r.semMunicipio++
      continue
    }
    candidatas.push({ publicacao, municipio })
  }

  const jaLidas = await dep.memoria.jaLidos(candidatas.map((c) => c.publicacao.id))
  const pendentes = candidatas
    .filter((c) => {
      if (!jaLidas.has(c.publicacao.id)) return true
      r.jaLidasAntes++
      return false
    })
    .sort((a, b) => Number(b.publicacao.id) - Number(a.publicacao.id))
  r.candidatas = pendentes.length

  for (const [indice, { publicacao, municipio }] of pendentes.entries()) {
    if (r.lidas + r.falhasDeLeitura >= limites.maxPublicacoesLidas) parar('publicacoes')
    if (orcamentoAcabou()) {
      r.pendentes = pendentes.length - indice
      break
    }
    await lerPublicacao(publicacao, municipio)
  }

  r.municipiosEnviados = [...municipiosEnviados].sort()
  if (r.falhasDeLeitura > 0) r.houveFalhas = true
  return r
}

const MOTIVOS_SEM_COLETA = new Set<MotivoDaParadaFamem>(['semSessao', 'listaVazia', 'listaIlegivel'])

export function statusDaColetaFamem(r: ResultadoDaColetaFamem): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (MOTIVOS_SEM_COLETA.has(r.motivoDaParada) || (r.motivoDaParada === 'bloqueio' && r.publicacoesNaLista === 0)) return 'FAILED'
  if (r.houveFalhas || r.motivoDaParada !== 'concluida') return 'PARTIAL'
  return 'SUCCESS'
}

export function resumoDaColetaFamem(r: ResultadoDaColetaFamem): string {
  return (
    `janela ${r.janela.dataInicio} a ${r.janela.dataFim}; requisições: ${r.requisicoes}; lista: ${r.publicacoesNaLista} publicações ` +
    `(${r.naJanela} na janela, ${r.outrosAtos} outros atos, ${r.contratacoesDiretasPeloTitulo} contratações diretas, ${r.semMunicipio} sem município, ` +
    `${r.jaLidasAntes} já lidas); lidas: ${r.lidas}, com falha: ${r.falhasDeLeitura}, pendentes: ${r.pendentes}; avisos: ${r.avisos}, ` +
    `com sessão de hoje em diante: ${r.comSessaoFutura}, sem data da sessão: ${r.semDataDaSessao}, sessão já passou: ${r.sessaoJaPassou}, ` +
    `dispensa/inexigibilidade no texto: ${r.contratacoesDiretasNoTexto}; já no PNCP: ${r.duplicadosDoPncp + r.descartadosPorPncpNoTexto}, ` +
    `já no Querido Diário: ${r.duplicadosDoQueridoDiario}; novas: ${r.totalNew}, atualizadas: ${r.totalUpdated}, ` +
    `inalteradas: ${r.totalDupes - r.totalUpdated}; municípios enviados: ${r.municipiosEnviados.length}`
  )
}

export function descricaoDaParadaFamem(r: ResultadoDaColetaFamem): string | null {
  const motivos: Record<Exclude<MotivoDaParadaFamem, 'concluida'>, string> = {
    tempo: 'tempo da coleta esgotado',
    requisicoes: 'teto de requisições atingido',
    publicacoes: 'teto de publicações por coleta atingido',
    bloqueio: 'a FAMEM recusou as requisições (403/429 ou redirecionamento)',
    falhas: `${FALHAS_SEGUIDAS_PARA_PARAR} falhas seguidas na FAMEM`,
    semSessao: 'a página de publicações não abriu a sessão',
    listaVazia: 'lista de publicações vazia',
    listaIlegivel: 'lista de publicações ilegível',
  }
  if (r.motivoDaParada === 'concluida') return null
  return `${motivos[r.motivoDaParada]}${r.pendentes > 0 ? ` — ${r.pendentes} publicação(ões) ficaram para a próxima coleta` : ''}`
}
