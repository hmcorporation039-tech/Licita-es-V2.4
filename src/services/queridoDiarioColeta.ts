import { NormalizedTender } from '../types'
import { GazetaQueridoDiario, parseDiarioOficial } from './queridoDiarioParser'
import {
  CidadeDoQueridoDiario,
  JanelaDoQueridoDiario,
  PaginaDoQueridoDiario,
  TAMANHO_DA_PAGINA,
  ehBloqueioDoQueridoDiario,
  statusDaResposta,
} from './queridoDiarioService'

export const UFS_PRIORITARIAS = ['BA', 'TO', 'MA', 'AL', 'SE', 'PI', 'PB', 'SP']
export const MAXIMO_DE_TERRITORIOS_POR_BUSCA = 150
export const ESPACO_ENTRE_BUSCAS_MS = 3_000
export const ESPERA_ANTES_DE_REPETIR_MS = 5_000
export const ESPERA_APOS_BLOQUEIO_MS = 60_000
export const TENTATIVAS_APOS_BLOQUEIO = 2
export const BLOQUEIOS_SEGUIDOS_NOS_ARQUIVOS = 3
export const CHAVE_DOS_DIARIOS_LIDOS = 'querido-diario:diarios-lidos'

const DIAS_NA_MEMORIA = 40
const DIA_MS = 86_400_000
const ROTULO_SEM_UF = 'TODAS'

export interface OrcamentoDaColeta {
  tempoMs: number
  buscas: number
  downloads: number
}

export const ORCAMENTO_PADRAO: OrcamentoDaColeta = { tempoMs: 40 * 60_000, buscas: 120, downloads: 700 }

export type MotivoDaParada = 'concluida' | 'tempo' | 'buscas' | 'downloads' | 'bloqueio'

export interface LoteDeBusca {
  uf: string | null
  territorios: string[]
}

export interface MedicaoDaUf {
  uf: string
  diariosEncontrados: number
  diariosLidos: number
  jaLidosAntes: number
  falhasDeTexto: number
  avisos: number
  novos: number
  atualizados: number
  inalterados: number
  duplicadosDoPncp: number
}

export interface ResultadoDaColeta {
  porUf: MedicaoDaUf[]
  buscas: number
  downloads: number
  totalFetched: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  diariosLidos: number
  jaLidosAntes: number
  avisos: number
  descartadosPorPncp: number
  duplicadosDoPncp: number
  falhasDeTexto: number
  falhasDeBusca: number
  falhasAoGravar: number
  buscasComResposta: number
  houveFalhas: boolean
  motivoDaParada: MotivoDaParada
  ufsIncompletas: string[]
  ufsNaoVisitadas: string[]
}

export interface MemoriaDeDiarios {
  jaLidos(urls: string[]): Promise<Set<string>>
  marcarLido(url: string): Promise<void>
}

export interface ContagemDoSalvamento {
  totalNew: number
  totalDupes: number
  totalUpdated: number
  totalDescartadas?: number
}

export interface DependenciasDaColeta {
  buscarCidades(): Promise<CidadeDoQueridoDiario[]>
  buscarDiarios(janela: JanelaDoQueridoDiario, offset: number, territorios: string[]): Promise<PaginaDoQueridoDiario>
  baixarTexto(txtUrl: string): Promise<string>
  existeNoPncp(tender: NormalizedTender, agora: Date): Promise<boolean>
  prepararRepublicacao(tender: NormalizedTender): Promise<NormalizedTender | null>
  salvarLote(lote: NormalizedTender[]): Promise<ContagemDoSalvamento>
  memoria: MemoriaDeDiarios
  esperar(ms: number): Promise<void>
  agora(): number
}

export class BloqueioDoQueridoDiario extends Error {
  constructor(readonly status: number | undefined) {
    super(`Querido Diário recusou as requisições (HTTP ${status ?? '?'})`)
  }
}

export interface ClienteRedisDaMemoria {
  pipeline(): { zscore(chave: string, membro: string): unknown; exec(): Promise<[Error | null, unknown][] | null> }
  zadd(chave: string, pontuacao: number, membro: string): Promise<unknown>
  zremrangebyscore(chave: string, minimo: string | number, maximo: string | number): Promise<unknown>
}

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface OpcoesDaMemoria {
  chave: string
  dias: number
  rotulo: string
}

const MEMORIA_DO_QUERIDO_DIARIO: OpcoesDaMemoria = { chave: CHAVE_DOS_DIARIOS_LIDOS, dias: DIAS_NA_MEMORIA, rotulo: 'Querido Diário' }

export function memoriaDeDiariosNoRedis(
  redis: ClienteRedisDaMemoria,
  agora: () => number = Date.now,
  opcoes: OpcoesDaMemoria = MEMORIA_DO_QUERIDO_DIARIO
): MemoriaDeDiarios {
  const { chave, dias, rotulo } = opcoes
  let limpou = false
  return {
    async jaLidos(urls) {
      if (urls.length === 0) return new Set()
      try {
        if (!limpou) {
          limpou = true
          await redis.zremrangebyscore(chave, '-inf', agora() - dias * DIA_MS)
        }
        const pipeline = redis.pipeline()
        for (const url of urls) pipeline.zscore(chave, url)
        const respostas = (await pipeline.exec()) ?? []
        return new Set(urls.filter((_, i) => !respostas[i]?.[0] && respostas[i]?.[1] !== null && respostas[i]?.[1] !== undefined))
      } catch (err) {
        console.warn(`[${rotulo}] Memória de diários lidos indisponível:`, mensagemDoErro(err))
        return new Set()
      }
    },
    async marcarLido(url) {
      try {
        await redis.zadd(chave, agora(), url)
      } catch (err) {
        console.warn(`[${rotulo}] Não foi possível lembrar o diário lido:`, mensagemDoErro(err))
      }
    },
  }
}

function prioridadeDaUf(uf: string): number {
  const posicao = UFS_PRIORITARIAS.indexOf(uf)
  return posicao === -1 ? UFS_PRIORITARIAS.length : posicao
}

export function lotesPorUf(cidades: CidadeDoQueridoDiario[]): LoteDeBusca[] {
  const porUf = new Map<string, Set<string>>()
  for (const cidade of cidades) {
    if (!cidade.state_code || !/^\d{7}$/.test(cidade.territory_id ?? '')) continue
    const uf = cidade.state_code.toUpperCase()
    if (!porUf.has(uf)) porUf.set(uf, new Set())
    porUf.get(uf)!.add(cidade.territory_id)
  }

  const ufs = [...porUf.keys()].sort(
    (a, b) => prioridadeDaUf(a) - prioridadeDaUf(b) || porUf.get(b)!.size - porUf.get(a)!.size || a.localeCompare(b)
  )

  const lotes: LoteDeBusca[] = []
  for (const uf of ufs) {
    const territorios = [...porUf.get(uf)!].sort()
    for (let i = 0; i < territorios.length; i += MAXIMO_DE_TERRITORIOS_POR_BUSCA) {
      lotes.push({ uf, territorios: territorios.slice(i, i + MAXIMO_DE_TERRITORIOS_POR_BUSCA) })
    }
  }
  return lotes
}

function rotuloDoLote(lote: LoteDeBusca): string {
  return lote.uf ?? ROTULO_SEM_UF
}

function medicaoVazia(uf: string): MedicaoDaUf {
  return {
    uf,
    diariosEncontrados: 0,
    diariosLidos: 0,
    jaLidosAntes: 0,
    falhasDeTexto: 0,
    avisos: 0,
    novos: 0,
    atualizados: 0,
    inalterados: 0,
    duplicadosDoPncp: 0,
  }
}

function adicionarSemRepetir(lista: string[], valor: string): void {
  if (!lista.includes(valor)) lista.push(valor)
}

export async function coletarQueridoDiario(
  dep: DependenciasDaColeta,
  janela: JanelaDoQueridoDiario,
  orcamento: OrcamentoDaColeta = ORCAMENTO_PADRAO
): Promise<ResultadoDaColeta> {
  const inicio = dep.agora()
  const dataDaColeta = new Date(inicio)
  const medicoes = new Map<string, MedicaoDaUf>()
  const textosVistos = new Set<string>()
  const r: ResultadoDaColeta = {
    porUf: [],
    buscas: 0,
    downloads: 0,
    totalFetched: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    diariosLidos: 0,
    jaLidosAntes: 0,
    avisos: 0,
    descartadosPorPncp: 0,
    duplicadosDoPncp: 0,
    falhasDeTexto: 0,
    falhasDeBusca: 0,
    falhasAoGravar: 0,
    buscasComResposta: 0,
    houveFalhas: false,
    motivoDaParada: 'concluida',
    ufsIncompletas: [],
    ufsNaoVisitadas: [],
  }
  let bloqueiosSeguidosNosArquivos = 0

  const medicaoDa = (uf: string): MedicaoDaUf => {
    if (!medicoes.has(uf)) medicoes.set(uf, medicaoVazia(uf))
    return medicoes.get(uf)!
  }

  const tempoEsgotado = () => dep.agora() - inicio >= orcamento.tempoMs

  const pararSeOrcamentoDaBuscaAcabou = (): boolean => {
    if (tempoEsgotado()) r.motivoDaParada = 'tempo'
    else if (r.buscas >= orcamento.buscas) r.motivoDaParada = 'buscas'
    else if (r.downloads >= orcamento.downloads) r.motivoDaParada = 'downloads'
    return r.motivoDaParada !== 'concluida'
  }

  const pararSeOrcamentoDoDownloadAcabou = (): boolean => {
    if (tempoEsgotado()) r.motivoDaParada = 'tempo'
    else if (r.downloads >= orcamento.downloads) r.motivoDaParada = 'downloads'
    return r.motivoDaParada !== 'concluida'
  }

  const buscarComEspera = async (lote: LoteDeBusca, offset: number): Promise<PaginaDoQueridoDiario> => {
    for (let tentativa = 0; ; tentativa++) {
      if (r.buscas > 0) await dep.esperar(ESPACO_ENTRE_BUSCAS_MS)
      r.buscas++
      try {
        const pagina = await dep.buscarDiarios(janela, offset, lote.territorios)
        r.buscasComResposta++
        return pagina
      } catch (err) {
        const bloqueio = ehBloqueioDoQueridoDiario(err)
        const semNovaTentativa =
          tentativa >= (bloqueio ? TENTATIVAS_APOS_BLOQUEIO : 1) || tempoEsgotado() || r.buscas >= orcamento.buscas
        if (semNovaTentativa) throw bloqueio ? new BloqueioDoQueridoDiario(statusDaResposta(err)) : err
        const espera = bloqueio ? ESPERA_APOS_BLOQUEIO_MS * 2 ** tentativa : ESPERA_ANTES_DE_REPETIR_MS
        console.warn(
          `[Querido Diário] Busca ${rotuloDoLote(lote)} (offset ${offset}) falhou (${mensagemDoErro(err)}) — nova tentativa em ${Math.round(espera / 1000)}s`
        )
        await dep.esperar(espera)
      }
    }
  }

  const processarDiario = async (gazeta: GazetaQueridoDiario, texto: string, medicao: MedicaoDaUf): Promise<boolean> => {
    const resultado = parseDiarioOficial(gazeta, texto, dataDaColeta)
    const avisos = resultado.tenders.length + resultado.descartadosPorPncp
    medicao.avisos += avisos
    medicao.duplicadosDoPncp += resultado.descartadosPorPncp
    r.avisos += avisos
    r.descartadosPorPncp += resultado.descartadosPorPncp

    let completo = true
    const lote: NormalizedTender[] = []
    for (const tender of resultado.tenders) {
      try {
        if (await dep.existeNoPncp(tender, dataDaColeta)) {
          medicao.duplicadosDoPncp++
          r.duplicadosDoPncp++
          continue
        }
        const ajustado = await dep.prepararRepublicacao(tender)
        if (ajustado) lote.push(ajustado)
        else {
          medicao.inalterados++
          r.totalDupes++
        }
      } catch (err) {
        completo = false
        r.houveFalhas = true
        r.falhasAoGravar++
        console.error(`[Querido Diário] Erro ao conferir ${tender.fonteId}:`, mensagemDoErro(err))
      }
    }

    if (lote.length === 0) return completo
    r.totalFetched += lote.length
    try {
      const salvos = await dep.salvarLote(lote)
      r.totalNew += salvos.totalNew
      r.totalDupes += salvos.totalDupes
      r.totalUpdated += salvos.totalUpdated
      medicao.novos += salvos.totalNew
      medicao.atualizados += salvos.totalUpdated
      medicao.inalterados += salvos.totalDupes - salvos.totalUpdated
      return completo && salvos.totalNew + salvos.totalDupes + (salvos.totalDescartadas ?? 0) === lote.length
    } catch (err) {
      r.houveFalhas = true
      r.falhasAoGravar += lote.length
      console.error(`[Querido Diário] Erro ao salvar avisos de ${gazeta.territory_name}/${gazeta.state_code}:`, mensagemDoErro(err))
      return false
    }
  }

  const lerPagina = async (pagina: PaginaDoQueridoDiario): Promise<void> => {
    const novas = (pagina.gazettes ?? []).filter((g) => g.txt_url && !textosVistos.has(g.txt_url))
    for (const gazeta of novas) textosVistos.add(gazeta.txt_url!)
    const jaLidos = await dep.memoria.jaLidos(novas.map((g) => g.txt_url!))

    for (const gazeta of novas) {
      const medicao = medicaoDa(gazeta.state_code || ROTULO_SEM_UF)
      medicao.diariosEncontrados++
      if (jaLidos.has(gazeta.txt_url!)) {
        medicao.jaLidosAntes++
        r.jaLidosAntes++
        continue
      }
      if (pararSeOrcamentoDoDownloadAcabou()) return

      let texto: string
      r.downloads++
      try {
        texto = await dep.baixarTexto(gazeta.txt_url!)
        bloqueiosSeguidosNosArquivos = 0
      } catch (err) {
        medicao.falhasDeTexto++
        r.falhasDeTexto++
        console.warn(
          `[Querido Diário] Texto indisponível (${gazeta.territory_name}/${gazeta.state_code} ${gazeta.date}):`,
          mensagemDoErro(err)
        )
        if (!ehBloqueioDoQueridoDiario(err)) continue
        bloqueiosSeguidosNosArquivos++
        if (bloqueiosSeguidosNosArquivos >= BLOQUEIOS_SEGUIDOS_NOS_ARQUIVOS) {
          r.motivoDaParada = 'bloqueio'
          return
        }
        await dep.esperar(ESPERA_APOS_BLOQUEIO_MS * bloqueiosSeguidosNosArquivos)
        continue
      }

      medicao.diariosLidos++
      r.diariosLidos++
      if (await processarDiario(gazeta, texto, medicao)) await dep.memoria.marcarLido(gazeta.txt_url!)
    }
  }

  let lotes: LoteDeBusca[]
  try {
    lotes = lotesPorUf(await dep.buscarCidades())
  } catch (err) {
    console.warn('[Querido Diário] Lista de municípios indisponível — buscando sem divisão por UF:', mensagemDoErro(err))
    lotes = []
  }
  if (lotes.length === 0) lotes = [{ uf: null, territorios: [] }]

  const ufsVisitadas = new Set<string>()
  for (const lote of lotes) {
    const rotulo = rotuloDoLote(lote)
    if (r.motivoDaParada !== 'concluida' || pararSeOrcamentoDaBuscaAcabou()) {
      adicionarSemRepetir(ufsVisitadas.has(rotulo) ? r.ufsIncompletas : r.ufsNaoVisitadas, rotulo)
      continue
    }

    ufsVisitadas.add(rotulo)
    let offset = 0
    let completo = false
    for (;;) {
      let pagina: PaginaDoQueridoDiario
      try {
        pagina = await buscarComEspera(lote, offset)
      } catch (err) {
        if (err instanceof BloqueioDoQueridoDiario) r.motivoDaParada = 'bloqueio'
        else {
          r.falhasDeBusca++
          r.houveFalhas = true
        }
        console.error(`[Querido Diário] Busca ${rotulo} (offset ${offset}) interrompida:`, mensagemDoErro(err))
        break
      }

      await lerPagina(pagina)
      if (r.motivoDaParada !== 'concluida') break

      const recebidos = (pagina.gazettes ?? []).length
      offset += TAMANHO_DA_PAGINA
      if (recebidos < TAMANHO_DA_PAGINA || offset >= (pagina.total_gazettes ?? 0)) {
        completo = true
        break
      }
      if (pararSeOrcamentoDaBuscaAcabou()) break
    }
    if (!completo) adicionarSemRepetir(r.ufsIncompletas, rotulo)
  }

  if (r.falhasDeTexto > 0 || r.motivoDaParada === 'bloqueio') r.houveFalhas = true
  r.porUf = [...medicoes.values()].sort((a, b) => prioridadeDaUf(a.uf) - prioridadeDaUf(b.uf) || a.uf.localeCompare(b.uf))
  return r
}

export function resumoDaUf(m: MedicaoDaUf): string {
  return (
    `${m.uf} — diários: ${m.diariosEncontrados} encontrados, ${m.diariosLidos} lidos, ${m.jaLidosAntes} já lidos antes, ` +
    `${m.falhasDeTexto} sem texto; avisos: ${m.avisos}; novos: ${m.novos}; atualizados: ${m.atualizados}; ` +
    `inalterados: ${m.inalterados}; já no PNCP: ${m.duplicadosDoPncp}`
  )
}

export function descricaoDaParada(r: ResultadoDaColeta): string | null {
  if (r.motivoDaParada === 'concluida') return null
  const motivo =
    r.motivoDaParada === 'bloqueio' ? 'Querido Diário bloqueou as requisições (403/429)' : `orçamento de ${r.motivoDaParada} esgotado`
  const pendentes = [...r.ufsIncompletas, ...r.ufsNaoVisitadas]
  return `${motivo}${pendentes.length > 0 ? ` — ficaram para a próxima coleta: ${pendentes.join(', ')}` : ''}`
}

export interface DesfechoDaColeta {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  mensagem?: string
}

export function desfechoDaColeta(r: ResultadoDaColeta): DesfechoDaColeta {
  if (!r.houveFalhas) return { status: 'SUCCESS' }

  const causas: string[] = []
  if (r.falhasDeBusca > 0) causas.push(`${r.falhasDeBusca} busca(s) com falha`)
  if (r.falhasDeTexto > 0) causas.push(`${r.falhasDeTexto} diário(s) sem texto`)
  if (r.falhasAoGravar > 0) causas.push(`${r.falhasAoGravar} aviso(s) que não deu para conferir ou gravar`)
  const parada = descricaoDaParada(r)
  if (parada) causas.push(parada)
  if (causas.length === 0) causas.push('falha sem detalhe')

  const nadaLido = r.diariosLidos === 0 && r.jaLidosAntes === 0
  const semResposta = r.buscasComResposta === 0 || r.falhasDeTexto > 0
  if (nadaLido && semResposta) return { status: 'FAILED', mensagem: `Nenhum diário lido: ${causas.join('; ')} — ver logs do worker` }
  return { status: 'PARTIAL', mensagem: `Coleta parcial (${r.diariosLidos} diário(s) lido(s)): ${causas.join('; ')} — ver logs do worker` }
}
