import { Readable, Transform, TransformCallback, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import { createInflateRaw } from 'node:zlib'
import { tceRsClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { anoEmBrasilia } from '../lib/anoDoProcesso'
import { NormalizedTender, SituacaoEnum } from '../types'
import { motivoCurto } from './infraeroVarredura'
import {
  ARQUIVO_DAS_LICITACOES,
  ARQUIVO_DOS_DOCUMENTOS,
  ARQUIVO_DOS_EVENTOS,
  COLUNAS_DA_LICITACAO,
  COLUNAS_DO_DOCUMENTO,
  COLUNAS_DO_EVENTO,
  DocumentoDoLicitaCon,
  EntradaDoZip,
  EventoDoLicitaCon,
  FormatoInesperadoDoTceRs,
  LeitorDeTabela,
  LicitacaoDoLicitaCon,
  TAMANHO_DO_CABECALHO_LOCAL,
  ValorDaColuna,
  anoDoFonteIdTceRs,
  caminhoDoArquivoDoAno,
  chaveDoFonteIdTceRs,
  documentoDaLinha,
  ehCandidataDoTceRs,
  entradasDoZip,
  eventoDaLinha,
  inicioDosDadosDaEntrada,
  licitacaoDaLinha,
  orgaoDoRs,
  prefeituraDaLinha,
  tenderDoTceRs,
} from './tceRsParser'

export const TAMANHO_DA_CAUDA = 64 * 1024
export const MAX_COMPRIMIDO_DAS_LICITACOES = 80 * 1024 * 1024
export const MAX_COMPRIMIDO_DOS_EVENTOS = 40 * 1024 * 1024
export const MAX_COMPRIMIDO_DOS_DOCUMENTOS = 160 * 1024 * 1024
export const MAX_ORIGINAL_POR_ARQUIVO = 800 * 1024 * 1024
export const TEMPO_MAXIMO_POR_ARQUIVO_MS = 10 * 60_000
// O servidor do TCE-RS chega a passar de 60 s antes do primeiro byte de um
// trecho do arquivo anual (~257 MB): em produção as 3 tentativas estouraram
// o timeout de 60 s do axios. A espera vale até o servidor começar a responder;
// depois disso quem manda é o silêncio máximo e o tempo máximo por arquivo.
export const ESPERA_PELO_PRIMEIRO_BYTE_MS = 3 * 60_000
export const MAX_SILENCIO_NO_DOWNLOAD_MS = 2 * 60_000
export const TENTATIVAS_POR_ARQUIVO = 3
export const ESPERA_ENTRE_TENTATIVAS_MS = 5_000
export const MESES_COM_O_ANO_ANTERIOR = 3
export const DIAS_DE_ESPERA_PELO_PNCP = 1

const DIA_MS = 86_400_000
const SITUACOES_ACOMPANHADAS: SituacaoEnum[] = ['ABERTA', 'SUSPENSA']
const FOLGA_DO_CABECALHO_LOCAL = 1024
const METODO_GUARDADO = 0
const METODO_DEFLATE = 8

export interface CaudaDoArquivo {
  status: number
  dados: Buffer
  tamanhoTotal: number | null
  atualizadoEm: string | null
}

export interface TrechoDoArquivo {
  status: number
  corpo: Readable
}

export interface RedeDoTceRs {
  baixarCauda: (caminho: string, bytes: number) => Promise<CaudaDoArquivo>
  baixarTrecho: (caminho: string, inicio: number, fim: number, sinal?: AbortSignal) => Promise<TrechoDoArquivo>
  esperar: (ms: number) => Promise<void>
}

function statusHttp(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

function totalDoContentRange(valor: unknown): number | null {
  const m = /\/(\d+)\s*$/.exec(String(valor ?? ''))
  return m ? Number(m[1]) : null
}

function aceitarQualquerStatus(): boolean {
  return true
}

// Timeout do axios ("timeout of Nms exceeded") vira download incompleto, que é
// repetido e aparece no log com o tempo que o servidor ficou sem responder.
export function semRespostaNoPrazo(err: unknown, prazoMs: number): unknown {
  const codigo = (err as { code?: unknown } | null)?.code
  if (codigo !== 'ECONNABORTED' && codigo !== 'ETIMEDOUT') return err
  return new DownloadIncompletoDoTceRs(`o servidor não começou a responder em ${Math.round(prazoMs / 1000)} s`)
}

export const REDE_DO_TCE_RS: RedeDoTceRs = {
  baixarCauda: async (caminho, bytes) => {
    const resposta = await tceRsClient
      .get<ArrayBuffer>(caminho, {
        responseType: 'arraybuffer',
        headers: { Range: `bytes=-${bytes}` },
        maxContentLength: bytes + 1024,
        timeout: ESPERA_PELO_PRIMEIRO_BYTE_MS,
        validateStatus: (s) => s === 206 || s === 404,
      })
      .catch((err) => Promise.reject(semRespostaNoPrazo(err, ESPERA_PELO_PRIMEIRO_BYTE_MS)))
    return {
      status: resposta.status,
      dados: Buffer.from(resposta.data),
      tamanhoTotal: totalDoContentRange(resposta.headers['content-range']),
      atualizadoEm: resposta.headers['last-modified'] ? String(resposta.headers['last-modified']) : null,
    }
  },
  baixarTrecho: async (caminho, inicio, fim, sinal) => {
    const resposta = await tceRsClient
      .get<Readable>(caminho, {
        responseType: 'stream',
        headers: { Range: `bytes=${inicio}-${fim}` },
        timeout: ESPERA_PELO_PRIMEIRO_BYTE_MS,
        signal: sinal,
        validateStatus: aceitarQualquerStatus,
      })
      .catch((err) => Promise.reject(semRespostaNoPrazo(err, ESPERA_PELO_PRIMEIRO_BYTE_MS)))
    if (resposta.status !== 206) resposta.data.destroy()
    return { status: resposta.status, corpo: resposta.data }
  },
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export class BloqueioDoTceRs extends Error {
  constructor(readonly status: number) {
    super(`TCE-RS recusou as requisições (HTTP ${status})`)
    this.name = 'BloqueioDoTceRs'
  }
}

export class ArquivoAusenteDoTceRs extends Error {
  constructor(readonly ano: number) {
    super(`TCE-RS: arquivo de ${ano} não encontrado`)
    this.name = 'ArquivoAusenteDoTceRs'
  }
}

export class LimiteDoTceRs extends Error {
  constructor(motivo: string) {
    super(`TCE-RS: ${motivo}`)
    this.name = 'LimiteDoTceRs'
  }
}

export class DownloadIncompletoDoTceRs extends Error {
  constructor(motivo: string) {
    super(`TCE-RS: download incompleto (${motivo})`)
    this.name = 'DownloadIncompletoDoTceRs'
  }
}

function erroTransitorio(err: unknown): boolean {
  if (err instanceof DownloadIncompletoDoTceRs) return true
  if (!(err as { isAxiosError?: boolean } | null)?.isAxiosError) return false
  const status = statusHttp(err)
  return status === undefined || status >= 500
}

function conferirStatus(status: number): void {
  if (status === 403 || status === 429) throw new BloqueioDoTceRs(status)
  if (status >= 500) throw new DownloadIncompletoDoTceRs(`HTTP ${status}`)
  if (status !== 206) throw new FormatoInesperadoDoTceRs(`o servidor não devolveu o trecho pedido (HTTP ${status})`)
}

export async function comRetentativa<T>(ler: () => Promise<T>, rede: RedeDoTceRs, tentativas = TENTATIVAS_POR_ARQUIVO): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await ler()
    } catch (err) {
      const status = statusHttp(err)
      if (status === 403 || status === 429) throw new BloqueioDoTceRs(status)
      if (tentativa >= tentativas || !erroTransitorio(err)) throw err
      await rede.esperar(ESPERA_ENTRE_TENTATIVAS_MS * 2 ** (tentativa - 1))
    }
  }
}

export interface DiretorioDoArquivo {
  entradas: EntradaDoZip[]
  tamanhoTotal: number
  atualizadoEm: string | null
}

export async function lerDiretorioDoZip(rede: RedeDoTceRs, ano: number): Promise<DiretorioDoArquivo> {
  const cauda = await comRetentativa(() => rede.baixarCauda(caminhoDoArquivoDoAno(ano), TAMANHO_DA_CAUDA), rede)
  if (cauda.status === 404) throw new ArquivoAusenteDoTceRs(ano)
  conferirStatus(cauda.status)
  const tamanhoTotal = cauda.tamanhoTotal ?? cauda.dados.length
  return { entradas: entradasDoZip(cauda.dados, tamanhoTotal - cauda.dados.length), tamanhoTotal, atualizadoEm: cauda.atualizadoEm }
}

// Depois do primeiro byte o axios não vigia mais a conexão: um trecho que
// para de chegar ficaria parado até o tempo máximo do arquivo.
class VigiaDeSilencio extends Transform {
  private relogio: NodeJS.Timeout | null = null

  constructor(private readonly maxSilencioMs: number) {
    super()
    this.rearmar()
  }

  private rearmar(): void {
    if (this.relogio) clearTimeout(this.relogio)
    this.relogio = setTimeout(
      () => this.destroy(new DownloadIncompletoDoTceRs(`sem dados do servidor por ${Math.round(this.maxSilencioMs / 1000)} s`)),
      this.maxSilencioMs
    )
  }

  _transform(pedaco: Buffer, _codificacao: BufferEncoding, pronto: TransformCallback): void {
    this.rearmar()
    pronto(null, pedaco)
  }

  _flush(pronto: TransformCallback): void {
    if (this.relogio) clearTimeout(this.relogio)
    pronto()
  }

  _destroy(erro: Error | null, pronto: (erro?: Error | null) => void): void {
    if (this.relogio) clearTimeout(this.relogio)
    pronto(erro)
  }
}

class RecorteDaEntrada extends Transform {
  private cabecalho = Buffer.alloc(0)
  private inicioDosDados: number | null = null
  private entregues = 0

  constructor(private readonly tamanhoComprimido: number) {
    super()
  }

  _transform(pedaco: Buffer, _codificacao: BufferEncoding, pronto: TransformCallback): void {
    try {
      let dados = pedaco
      if (this.inicioDosDados === null) {
        this.cabecalho = Buffer.concat([this.cabecalho, pedaco])
        if (this.cabecalho.length < TAMANHO_DO_CABECALHO_LOCAL) return pronto()
        const inicio = inicioDosDadosDaEntrada(this.cabecalho)
        if (this.cabecalho.length < inicio) return pronto()
        this.inicioDosDados = inicio
        dados = this.cabecalho.subarray(inicio)
        this.cabecalho = Buffer.alloc(0)
      }
      const faltam = this.tamanhoComprimido - this.entregues
      if (faltam > 0 && dados.length > 0) {
        const parte = dados.subarray(0, faltam)
        this.entregues += parte.length
        this.push(parte)
      }
      pronto()
    } catch (err) {
      pronto(err as Error)
    }
  }

  _flush(pronto: TransformCallback): void {
    if (this.entregues < this.tamanhoComprimido) {
      pronto(new DownloadIncompletoDoTceRs(`${this.entregues} de ${this.tamanhoComprimido} bytes`))
      return
    }
    pronto()
  }
}

class TextoDaEntrada extends Writable {
  private readonly decodificador = new StringDecoder('utf8')
  private bytes = 0

  constructor(
    private readonly maxOriginal: number,
    private readonly aoLerTexto: (pedaco: string) => void
  ) {
    super()
  }

  _write(pedaco: Buffer, _codificacao: BufferEncoding, pronto: (erro?: Error | null) => void): void {
    this.bytes += pedaco.length
    if (this.bytes > this.maxOriginal) {
      pronto(new LimiteDoTceRs(`arquivo descompactado passou de ${this.maxOriginal} bytes`))
      return
    }
    try {
      this.aoLerTexto(this.decodificador.write(pedaco))
      pronto()
    } catch (err) {
      pronto(err as Error)
    }
  }

  _final(pronto: (erro?: Error | null) => void): void {
    try {
      this.aoLerTexto(this.decodificador.end())
      pronto()
    } catch (err) {
      pronto(err as Error)
    }
  }
}

export interface LimitesDaColetaTceRs {
  maxComprimido: Record<string, number>
  maxOriginal: number
  tempoMaximoPorArquivoMs: number
  maxSilencioMs: number
}

export const LIMITES_PADRAO_TCE_RS: LimitesDaColetaTceRs = {
  maxComprimido: {
    [ARQUIVO_DAS_LICITACOES]: MAX_COMPRIMIDO_DAS_LICITACOES,
    [ARQUIVO_DOS_EVENTOS]: MAX_COMPRIMIDO_DOS_EVENTOS,
    [ARQUIVO_DOS_DOCUMENTOS]: MAX_COMPRIMIDO_DOS_DOCUMENTOS,
  },
  maxOriginal: MAX_ORIGINAL_POR_ARQUIVO,
  tempoMaximoPorArquivoMs: TEMPO_MAXIMO_POR_ARQUIVO_MS,
  maxSilencioMs: MAX_SILENCIO_NO_DOWNLOAD_MS,
}

export async function lerEntradaDoZip(
  rede: RedeDoTceRs,
  ano: number,
  diretorio: DiretorioDoArquivo,
  entrada: EntradaDoZip,
  limites: LimitesDaColetaTceRs,
  criarLeitor: () => { ler: (pedaco: string) => void; terminar: () => void }
): Promise<void> {
  if (entrada.metodo !== METODO_DEFLATE && entrada.metodo !== METODO_GUARDADO) {
    throw new FormatoInesperadoDoTceRs(`compressão ${entrada.metodo} não suportada em ${entrada.nome}`)
  }
  const teto = limites.maxComprimido[entrada.nome] ?? 0
  if (entrada.tamanhoComprimido > teto) throw new LimiteDoTceRs(`${entrada.nome} tem ${entrada.tamanhoComprimido} bytes, acima do teto de ${teto}`)
  if (entrada.tamanhoOriginal > limites.maxOriginal) throw new LimiteDoTceRs(`${entrada.nome} descompactado tem ${entrada.tamanhoOriginal} bytes, acima do teto`)

  const inicio = entrada.inicioDoCabecalho
  const fim = Math.min(
    diretorio.tamanhoTotal - 1,
    inicio + TAMANHO_DO_CABECALHO_LOCAL + Buffer.byteLength(entrada.nome) + FOLGA_DO_CABECALHO_LOCAL + entrada.tamanhoComprimido - 1
  )

  await comRetentativa(async () => {
    const leitor = criarLeitor()
    // O tempo máximo conta desde o pedido: a espera pelo primeiro byte entra nele.
    const tempoEsgotado = () => new DownloadIncompletoDoTceRs(`tempo esgotado (${Math.round(limites.tempoMaximoPorArquivoMs / 1000)} s)`)
    const cancelamento = new AbortController()
    let corpo: Readable | null = null
    const relogio = setTimeout(() => {
      cancelamento.abort()
      corpo?.destroy(tempoEsgotado())
    }, limites.tempoMaximoPorArquivoMs)
    try {
      const trecho = await rede.baixarTrecho(caminhoDoArquivoDoAno(ano), inicio, fim, cancelamento.signal).catch((err) => {
        throw cancelamento.signal.aborted ? tempoEsgotado() : err
      })
      corpo = trecho.corpo
      if (trecho.status !== 206) trecho.corpo.destroy()
      conferirStatus(trecho.status)
      if (cancelamento.signal.aborted) throw tempoEsgotado()
      const etapas: (Transform | Writable)[] = [new VigiaDeSilencio(limites.maxSilencioMs), new RecorteDaEntrada(entrada.tamanhoComprimido)]
      if (entrada.metodo === METODO_DEFLATE) etapas.push(createInflateRaw())
      etapas.push(new TextoDaEntrada(limites.maxOriginal, (pedaco) => leitor.ler(pedaco)))
      await pipeline([trecho.corpo, ...etapas])
      leitor.terminar()
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'ERR_STREAM_PREMATURE_CLOSE') throw new DownloadIncompletoDoTceRs('conexão encerrada')
      throw err
    } finally {
      clearTimeout(relogio)
    }
  }, rede)
}

export function anosParaLer(agora: Date): number[] {
  const ano = anoEmBrasilia(agora)
  const mes = new Date(agora.getTime() - 3 * 3_600_000).getUTCMonth() + 1
  return mes <= MESES_COM_O_ANO_ANTERIOR ? [ano, ano - 1] : [ano]
}

export interface RegistroDoTceRs {
  id: string
  fonteId: string
  situacao: SituacaoEnum
  aberturaAt: Date | null
  anexos: unknown
}

export type MotivoDaDuplicidadeTceRs = 'controle' | 'objeto' | 'numero' | 'sessao'

export interface ContagemDoSalvamentoTceRs {
  totalNew: number
  totalDupes: number
  totalUpdated: number
}

export interface DependenciasDaColetaTceRs {
  rede: RedeDoTceRs
  registrosSalvos: () => Promise<RegistroDoTceRs[]>
  duplicidadeNoPncp: (tender: NormalizedTender, agora: Date) => Promise<MotivoDaDuplicidadeTceRs | null>
  salvarLote: (lote: NormalizedTender[]) => Promise<ContagemDoSalvamentoTceRs>
  atualizarSituacao: (registro: RegistroDoTceRs, situacao: SituacaoEnum, agora: Date) => Promise<void>
}

export interface ResumoDaColetaTceRs {
  anos: number[]
  arquivosAtualizadosEm: string[]
  linhasLidas: number
  candidatas: number
  municipios: number
  aguardandoPncp: number
  naoAbertas: number
  novasForaDoPncp: number
  duplicadasPncpPorControle: number
  duplicadasPncpPorObjeto: number
  duplicadasPncpPorNumero: number
  duplicadasPncpPelaSessao: number
  declaradasNoPncpForaDoBanco: number
  semMunicipio: number
  revisitadas: number
  sumidas: number
  situacoesAlteradas: number
  ignoradas: number
  novasPorMunicipio: Record<string, number>
  totalNew: number
  totalDupes: number
  totalUpdated: number
  arquivosCompletos: boolean
  bloqueado: boolean
  falhas: string[]
}

interface LeituraDoAno {
  linhas: number
  candidatas: Map<string, LicitacaoDoLicitaCon>
  acompanhadas: Map<string, LicitacaoDoLicitaCon>
  prefeituras: Map<number, string>
  eventos: Map<string, EventoDoLicitaCon[]>
  documentos: Map<string, DocumentoDoLicitaCon[]>
}

function entradaObrigatoria(diretorio: DiretorioDoArquivo, nome: string): EntradaDoZip {
  const entrada = diretorio.entradas.find((e) => e.nome.toLowerCase() === nome)
  if (!entrada) throw new FormatoInesperadoDoTceRs(`${nome} ausente no ZIP`)
  return entrada
}

function agrupar<T extends { chave: string }>(destino: Map<string, T[]>, item: T | undefined, interessa: (chave: string) => boolean): void {
  if (!item || !interessa(item.chave)) return
  const lista = destino.get(item.chave)
  if (lista) lista.push(item)
  else destino.set(item.chave, [item])
}

async function lerLicitacoes(
  rede: RedeDoTceRs,
  ano: number,
  diretorio: DiretorioDoArquivo,
  limites: LimitesDaColetaTceRs,
  chavesSalvas: Set<string>,
  agora: Date
): Promise<LeituraDoAno> {
  const leitura: LeituraDoAno = { linhas: 0, candidatas: new Map(), acompanhadas: new Map(), prefeituras: new Map(), eventos: new Map(), documentos: new Map() }
  let leitor = new LeitorDeTabela(COLUNAS_DA_LICITACAO, () => undefined)
  await lerEntradaDoZip(rede, ano, diretorio, entradaObrigatoria(diretorio, ARQUIVO_DAS_LICITACOES), limites, () => {
    leitura.candidatas.clear()
    leitura.acompanhadas.clear()
    leitura.prefeituras.clear()
    leitor = new LeitorDeTabela(COLUNAS_DA_LICITACAO, (valor) => {
      const licitacao = licitacaoDaLinha(valor)
      if (!licitacao) return
      const prefeitura = prefeituraDaLinha(licitacao.cdOrgao, licitacao.nomeDoOrgao)
      if (prefeitura) leitura.prefeituras.set(prefeitura[0], prefeitura[1])
      if (ehCandidataDoTceRs(licitacao, agora)) leitura.candidatas.set(licitacao.chave, licitacao)
      if (chavesSalvas.has(licitacao.chave)) leitura.acompanhadas.set(licitacao.chave, licitacao)
    })
    return leitor
  })
  leitura.linhas = leitor.linhas
  return leitura
}

async function lerEventos(rede: RedeDoTceRs, ano: number, diretorio: DiretorioDoArquivo, limites: LimitesDaColetaTceRs, leitura: LeituraDoAno): Promise<void> {
  const interessa = (chave: string) => leitura.candidatas.has(chave) || leitura.acompanhadas.has(chave)
  await lerEntradaDoZip(rede, ano, diretorio, entradaObrigatoria(diretorio, ARQUIVO_DOS_EVENTOS), limites, () => {
    leitura.eventos.clear()
    return new LeitorDeTabela(COLUNAS_DO_EVENTO, (valor: ValorDaColuna) => agrupar(leitura.eventos, eventoDaLinha(valor), interessa))
  })
}

async function lerDocumentos(
  rede: RedeDoTceRs,
  ano: number,
  diretorio: DiretorioDoArquivo,
  limites: LimitesDaColetaTceRs,
  leitura: LeituraDoAno,
  chaves: Set<string>
): Promise<void> {
  await lerEntradaDoZip(rede, ano, diretorio, entradaObrigatoria(diretorio, ARQUIVO_DOS_DOCUMENTOS), limites, () => {
    leitura.documentos.clear()
    return new LeitorDeTabela(COLUNAS_DO_DOCUMENTO, (valor: ValorDaColuna) => agrupar(leitura.documentos, documentoDaLinha(valor), (chave) => chaves.has(chave)))
  })
}

function anexosSalvos(anexos: unknown): DocumentoDoLicitaCon[] {
  if (!Array.isArray(anexos)) return []
  return anexos.flatMap((a) => {
    const anexo = a as { uri?: unknown; titulo?: unknown; tipo?: unknown } | null
    if (typeof anexo?.uri !== 'string') return []
    return [{ chave: '', tipo: typeof anexo.tipo === 'string' ? anexo.tipo : 'OUT', nome: typeof anexo.titulo === 'string' ? anexo.titulo : '', fase: '', enviadoEm: '', url: anexo.uri }]
  })
}

function publicadaHaPouco(tender: NormalizedTender, agora: Date): boolean {
  const limite = inicioDoDiaEmBrasilia(agora).getTime() - DIAS_DE_ESPERA_PELO_PNCP * DIA_MS
  return !!tender.publicadoAt && tender.publicadoAt.getTime() >= limite
}

export function resumoVazio(anos: number[]): ResumoDaColetaTceRs {
  return {
    anos,
    arquivosAtualizadosEm: [],
    linhasLidas: 0,
    candidatas: 0,
    municipios: 0,
    aguardandoPncp: 0,
    naoAbertas: 0,
    novasForaDoPncp: 0,
    duplicadasPncpPorControle: 0,
    duplicadasPncpPorObjeto: 0,
    duplicadasPncpPorNumero: 0,
    duplicadasPncpPelaSessao: 0,
    declaradasNoPncpForaDoBanco: 0,
    semMunicipio: 0,
    revisitadas: 0,
    sumidas: 0,
    situacoesAlteradas: 0,
    ignoradas: 0,
    novasPorMunicipio: {},
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    arquivosCompletos: true,
    bloqueado: false,
    falhas: [],
  }
}

export async function coletarTceRs(dep: DependenciasDaColetaTceRs, agora: Date, limites: LimitesDaColetaTceRs = LIMITES_PADRAO_TCE_RS): Promise<ResumoDaColetaTceRs> {
  const anos = anosParaLer(agora)
  const resumo = resumoVazio(anos)
  const hoje = inicioDoDiaEmBrasilia(agora)
  const registros = await dep.registrosSalvos()
  const porChave = new Map(registros.flatMap((r) => {
    const chave = chaveDoFonteIdTceRs(r.fonteId)
    return chave ? [[chave, r] as const] : []
  }))
  const chavesSalvas = new Set(porChave.keys())
  const lote: NormalizedTender[] = []
  const municipios = new Set<string>()
  const duplicadas: Record<MotivoDaDuplicidadeTceRs, number> = { controle: 0, objeto: 0, numero: 0, sessao: 0 }

  for (const [indice, ano] of anos.entries()) {
    let diretorio: DiretorioDoArquivo
    let leitura: LeituraDoAno
    try {
      diretorio = await lerDiretorioDoZip(dep.rede, ano)
      if (diretorio.atualizadoEm) resumo.arquivosAtualizadosEm.push(`${ano}: ${diretorio.atualizadoEm}`)
      leitura = await lerLicitacoes(dep.rede, ano, diretorio, limites, chavesSalvas, agora)
      if (leitura.candidatas.size > 0 || leitura.acompanhadas.size > 0) await lerEventos(dep.rede, ano, diretorio, limites, leitura)
    } catch (err) {
      if (err instanceof ArquivoAusenteDoTceRs && indice > 0) continue
      resumo.arquivosCompletos = false
      resumo.falhas.push(`${ano} (${motivoCurto(err)})`)
      if (err instanceof BloqueioDoTceRs) {
        resumo.bloqueado = true
        break
      }
      continue
    }

    resumo.linhasLidas += leitura.linhas
    resumo.candidatas += leitura.candidatas.size
    const eventosDe = (chave: string) => leitura.eventos.get(chave) ?? []

    const paraGravar: NormalizedTender[] = []
    for (const [chave, licitacao] of leitura.candidatas) {
      if (porChave.has(chave)) continue
      const leituraDoTender = tenderDoTceRs(licitacao, eventosDe(chave), [], leitura.prefeituras)
      if (leituraDoTender.tipo === 'ignorado') {
        resumo.ignoradas++
        continue
      }
      const tender = leituraDoTender.tender
      if (tender.situacao !== 'ABERTA') {
        resumo.naoAbertas++
        continue
      }
      if (publicadaHaPouco(tender, agora)) {
        resumo.aguardandoPncp++
        continue
      }
      let motivo: MotivoDaDuplicidadeTceRs | null
      try {
        motivo = await dep.duplicidadeNoPncp(tender, agora)
      } catch (err) {
        resumo.falhas.push(`PNCP ${chave} (${motivoCurto(err)})`)
        continue
      }
      if (motivo) {
        duplicadas[motivo]++
        continue
      }
      if (tender.rawJson.controlePncp) resumo.declaradasNoPncpForaDoBanco++
      if (!tender.municipio) resumo.semMunicipio++
      paraGravar.push(tender)
    }

    for (const licitacao of leitura.candidatas.values()) {
      const { municipio } = orgaoDoRs(licitacao.cdOrgao, licitacao.nomeDoOrgao, leitura.prefeituras)
      if (municipio) municipios.add(municipio.codigoIbge)
    }

    if (paraGravar.length > 0) {
      const chaves = new Set(paraGravar.map((t) => String(t.rawJson.chave)))
      try {
        await lerDocumentos(dep.rede, ano, diretorio, limites, leitura, chaves)
      } catch (err) {
        resumo.arquivosCompletos = false
        resumo.falhas.push(`${ano} documentos (${motivoCurto(err)})`)
        if (err instanceof BloqueioDoTceRs) resumo.bloqueado = true
      }
      for (const tender of paraGravar) {
        const chave = String(tender.rawJson.chave)
        const licitacao = leitura.candidatas.get(chave)
        const completo = licitacao ? tenderDoTceRs(licitacao, eventosDe(chave), leitura.documentos.get(chave) ?? [], leitura.prefeituras) : null
        const final = completo?.tipo === 'licitacao' ? completo.tender : tender
        lote.push(final)
        resumo.novasForaDoPncp++
        const local = final.municipio ?? 'sem município'
        resumo.novasPorMunicipio[local] = (resumo.novasPorMunicipio[local] ?? 0) + 1
      }
    }

    for (const [chave, licitacao] of leitura.acompanhadas) {
      const registro = porChave.get(chave)
      if (!registro) continue
      const leituraDoTender = tenderDoTceRs(licitacao, eventosDe(chave), anexosSalvos(registro.anexos), leitura.prefeituras)
      if (leituraDoTender.tipo === 'ignorado') continue
      const tender = leituraDoTender.tender
      const mudou = !!tender.situacao && tender.situacao !== registro.situacao
      if (!mudou && !SITUACOES_ACOMPANHADAS.includes(registro.situacao)) continue
      resumo.revisitadas++
      if (mudou && tender.situacao) {
        await dep.atualizarSituacao(registro, tender.situacao, agora)
        resumo.situacoesAlteradas++
      }
      lote.push(tender)
    }

    for (const registro of registros) {
      const chave = chaveDoFonteIdTceRs(registro.fonteId)
      if (!chave || anoDoFonteIdTceRs(registro.fonteId) !== ano || leitura.acompanhadas.has(chave)) continue
      const aberta = SITUACOES_ACOMPANHADAS.includes(registro.situacao) && !!registro.aberturaAt && registro.aberturaAt.getTime() >= hoje.getTime()
      if (aberta) resumo.sumidas++
    }
  }

  resumo.municipios = municipios.size
  resumo.duplicadasPncpPorControle = duplicadas.controle
  resumo.duplicadasPncpPorObjeto = duplicadas.objeto
  resumo.duplicadasPncpPorNumero = duplicadas.numero
  resumo.duplicadasPncpPelaSessao = duplicadas.sessao
  const salvos = await dep.salvarLote(lote)
  resumo.totalNew = salvos.totalNew
  resumo.totalDupes = salvos.totalDupes
  resumo.totalUpdated = salvos.totalUpdated
  return resumo
}

export function duplicadasNoPncp(r: ResumoDaColetaTceRs): number {
  return r.duplicadasPncpPorControle + r.duplicadasPncpPorObjeto + r.duplicadasPncpPorNumero + r.duplicadasPncpPelaSessao
}

export function linhaDoResumo(r: ResumoDaColetaTceRs): string {
  const porMunicipio = Object.entries(r.novasPorMunicipio)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([municipio, total]) => `${municipio} ${total}`)
    .join(', ')
  return (
    `anos: ${r.anos.join(', ')}${r.arquivosAtualizadosEm.length > 0 ? ` (arquivo de ${r.arquivosAtualizadosEm.join('; ')})` : ''}, ` +
    `linhas lidas: ${r.linhasLidas}, com edital publicado e sessão de hoje em diante: ${r.candidatas} em ${r.municipios} município(s), ` +
    `novas fora do PNCP: ${r.novasForaDoPncp}, já no PNCP: ${duplicadasNoPncp(r)} ` +
    `(link ${r.duplicadasPncpPorControle}, objeto ${r.duplicadasPncpPorObjeto}, número ${r.duplicadasPncpPorNumero}, sessão ${r.duplicadasPncpPelaSessao}), ` +
    `declaradas no PNCP e ausentes no banco: ${r.declaradasNoPncpForaDoBanco}, publicadas há pouco (aguardando o PNCP): ${r.aguardandoPncp}, ` +
    `suspensas/revogadas/anuladas: ${r.naoAbertas}, sem município: ${r.semMunicipio}, novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
    `revisitadas: ${r.revisitadas}, situações alteradas: ${r.situacoesAlteradas}, sumidas do arquivo: ${r.sumidas}, ignoradas: ${r.ignoradas}` +
    `${porMunicipio ? `, novas por município: ${porMunicipio}` : ''}` +
    `${r.arquivosCompletos ? '' : ', arquivo INCOMPLETO'}${r.bloqueado ? ', BLOQUEADO pelo portal' : ''}` +
    `${r.falhas.length > 0 ? `, falhas: ${r.falhas.length}` : ''}`
  )
}
