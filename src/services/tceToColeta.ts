import { createHash } from 'node:crypto'
import { tceToClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { modalidadeIncerta } from '../lib/repeticaoDoPncp'
import { NormalizedTender, SituacaoEnum } from '../types'
import { motivoCurto } from './infraeroVarredura'
import { ClienteRedisDaMemoria, MemoriaDeDiarios, memoriaDeDiariosNoRedis } from './queridoDiarioColeta'
import { MotivoDaDuplicidade } from './tceCeDuplicidade'
import {
  DetalheDoTceTo,
  LinhaDaListaTceTo,
  assinaturaDaLinhaTceTo,
  caminhoDaListaTceTo,
  caminhoDoDetalheTceTo,
  diaDoTceTo,
  linhaComSessaoFutura,
  linhaMunicipal,
  parseDetalheTceTo,
  parseListaTceTo,
  situacaoDoTceTo,
  tenderDoTceTo,
} from './tceToParser'

export const POR_PAGINA = 200
export const MAX_PAGINAS_POR_COLETA = 20
export const MAX_DETALHES_POR_COLETA = 300
export const ORCAMENTO_DA_COLETA_MS = 30 * 60_000
export const DIAS_A_FRENTE = 400
export const TENTATIVAS_POR_PAGINA = 3
export const TENTATIVAS_POR_DETALHE = 2
export const ESPERA_ENTRE_TENTATIVAS_MS = 5_000
export const FALHAS_SEGUIDAS_PARA_DESISTIR = 3
export const DIAS_PARA_RECONFERIR = 3
export const CHAVE_DOS_DETALHES_LIDOS = 'tce-to:detalhes-lidos'
export const DIAS_NA_MEMORIA = 20

const DIA_MS = 86_400_000

export interface RedeDoTceTo {
  baixarLista: (pagina: number, limite: number, inicio: Date, fim: Date) => Promise<string>
  baixarDetalhe: (idProcedimento: number) => Promise<string>
  esperar: (ms: number) => Promise<void>
}

async function baixarJson(caminho: string): Promise<string> {
  const resposta = await tceToClient.get<string>(caminho, { responseType: 'text', transformResponse: (dado) => dado })
  return String(resposta.data ?? '')
}

export const REDE_DO_TCE_TO: RedeDoTceTo = {
  baixarLista: (pagina, limite, inicio, fim) => baixarJson(caminhoDaListaTceTo(pagina, limite, inicio, fim)),
  baixarDetalhe: (idProcedimento) => baixarJson(caminhoDoDetalheTceTo(idProcedimento)),
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export function memoriaDoTceToNoRedis(redis: ClienteRedisDaMemoria, agora: () => number = Date.now): MemoriaDeDiarios {
  return memoriaDeDiariosNoRedis(redis, agora, { chave: CHAVE_DOS_DETALHES_LIDOS, dias: DIAS_NA_MEMORIA, rotulo: 'TCE-TO' })
}

export interface LimitesDaColetaTceTo {
  porPagina: number
  maxPaginas: number
  maxDetalhes: number
  orcamentoMs: number
}

export const LIMITES_PADRAO_TCE_TO: LimitesDaColetaTceTo = {
  porPagina: POR_PAGINA,
  maxPaginas: MAX_PAGINAS_POR_COLETA,
  maxDetalhes: MAX_DETALHES_POR_COLETA,
  orcamentoMs: ORCAMENTO_DA_COLETA_MS,
}

export class BloqueioDoTceTo extends Error {
  constructor(readonly status: number) {
    super(`TCE-TO recusou as requisições (HTTP ${status})`)
    this.name = 'BloqueioDoTceTo'
  }
}

function statusHttp(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

function erroTransitorio(err: unknown): boolean {
  if (!(err as { isAxiosError?: boolean } | null)?.isAxiosError) return false
  const status = statusHttp(err)
  return status === undefined || status >= 500
}

export async function lerComRetentativaTceTo<T>(ler: () => Promise<T>, tentativas: number, rede: RedeDoTceTo): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await ler()
    } catch (err) {
      const status = statusHttp(err)
      if (status === 403 || status === 429) throw new BloqueioDoTceTo(status)
      if (tentativa >= tentativas || !erroTransitorio(err)) throw err
      await rede.esperar(ESPERA_ENTRE_TENTATIVAS_MS * 2 ** (tentativa - 1))
    }
  }
}

export type MotivoDaParadaDaListaTceTo = 'fim' | 'limite' | 'falhas' | 'bloqueio'

export interface ResultadoDaListaTceTo {
  linhas: LinhaDaListaTceTo[]
  paginasLidas: number
  totalAnunciado: number | null
  motivoDaParada: MotivoDaParadaDaListaTceTo
  completa: boolean
  falhas: string[]
}

export async function varrerListaTceTo(rede: RedeDoTceTo, agora: Date, limites: LimitesDaColetaTceTo = LIMITES_PADRAO_TCE_TO): Promise<ResultadoDaListaTceTo> {
  const inicio = inicioDoDiaEmBrasilia(agora)
  const fim = new Date(inicio.getTime() + DIAS_A_FRENTE * DIA_MS)
  const porId = new Map<number, LinhaDaListaTceTo>()
  const falhas: string[] = []
  let paginasLidas = 0
  let totalAnunciado: number | null = null
  let falhasSeguidas = 0
  let recebidas = 0

  const fimDaLista = (motivoDaParada: MotivoDaParadaDaListaTceTo): ResultadoDaListaTceTo => ({
    linhas: [...porId.values()],
    paginasLidas,
    totalAnunciado,
    motivoDaParada,
    completa: motivoDaParada === 'fim' && falhas.length === 0,
    falhas,
  })

  for (let pagina = 1; ; pagina++) {
    if (pagina > limites.maxPaginas) return fimDaLista('limite')
    let leitura: ReturnType<typeof parseListaTceTo>
    try {
      leitura = parseListaTceTo(await lerComRetentativaTceTo(() => rede.baixarLista(pagina, limites.porPagina, inicio, fim), TENTATIVAS_POR_PAGINA, rede))
      falhasSeguidas = 0
    } catch (err) {
      if (err instanceof BloqueioDoTceTo) {
        falhas.push(`página ${pagina} (${err.message})`)
        return fimDaLista('bloqueio')
      }
      falhas.push(`página ${pagina} (${motivoCurto(err)})`)
      if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) return fimDaLista('falhas')
      continue
    }
    paginasLidas++
    if (leitura.total !== null) totalAnunciado = leitura.total
    recebidas += leitura.linhas.length
    for (const linha of leitura.linhas) if (!porId.has(linha.idProcedimento)) porId.set(linha.idProcedimento, linha)
    const acabou = leitura.linhas.length < limites.porPagina || (totalAnunciado !== null && recebidas >= totalAnunciado)
    if (acabou) return fimDaLista('fim')
  }
}

export interface RegistroDoTceTo {
  id: string
  idProcedimento: number
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  assinaturaDaLista: string | null
}

export interface ContagemDoSalvamentoTceTo {
  totalNew: number
  totalDupes: number
  totalUpdated: number
}

export interface DependenciasDaColetaTceTo {
  rede: RedeDoTceTo
  memoria: MemoriaDeDiarios
  registrosSalvos: () => Promise<RegistroDoTceTo[]>
  duplicidadeNoPncp: (tender: NormalizedTender, agora: Date, modalidadeConhecida: boolean) => Promise<MotivoDaDuplicidade | null>
  salvarLote: (lote: NormalizedTender[]) => Promise<ContagemDoSalvamentoTceTo>
  atualizarSituacao: (registro: RegistroDoTceTo, situacao: SituacaoEnum, agora: Date) => Promise<void>
  registrarConferencia: (registroId: string, agora: Date, assinaturaDaLista: string | null) => Promise<void>
  relogio: () => number
}

export interface ResumoDaColetaTceTo {
  paginas: number
  totalAnunciado: number | null
  motivoDaParada: MotivoDaParadaDaListaTceTo
  listaCompleta: boolean
  registrosNaLista: number
  municipais: number
  comSessaoFutura: number
  municipios: number
  aguardandoPncp: number
  jaLidasAntes: number
  detalhesLidos: number
  semDetalhe: number
  adiadasPeloLimite: number
  novasForaDoPncp: number
  municipiosDasNovas: number
  duplicadasPncpPorObjeto: number
  duplicadasPncpPorNumero: number
  revisitadas: number
  sumidas: number
  ignoradas: number
  situacoesAlteradas: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  bloqueado: boolean
  falhas: string[]
}

type Tarefa =
  | { tipo: 'nova'; linha: LinhaDaListaTceTo; tender: NormalizedTender }
  | { tipo: 'revisao'; linha: LinhaDaListaTceTo; registro: RegistroDoTceTo }
  | { tipo: 'sumida'; registro: RegistroDoTceTo }

function horario(data: Date | null | undefined): number {
  return data?.getTime() ?? -Infinity
}

function cadastradaHoje(linha: LinhaDaListaTceTo, hoje: Date): boolean {
  const cadastro = diaDoTceTo(linha.cadastradoEm)
  return !!cadastro && cadastro.getTime() >= hoje.getTime()
}

export function chaveDaMemoriaTceTo(linha: LinhaDaListaTceTo): string {
  return `${linha.idProcedimento}:${createHash('sha1').update(assinaturaDaLinhaTceTo(linha)).digest('hex').slice(0, 16)}`
}

function chaveDaSumida(registro: RegistroDoTceTo, hoje: Date): string {
  return `sumida:${registro.idProcedimento}:${hoje.toISOString().slice(0, 10)}`
}

interface Plano {
  novas: LinhaDaListaTceTo[]
  revisoes: { linha: LinhaDaListaTceTo; registro: RegistroDoTceTo }[]
  sumidas: RegistroDoTceTo[]
  aguardandoPncp: number
  comSessaoFutura: LinhaDaListaTceTo[]
  municipais: number
}

function planejar(lista: ResultadoDaListaTceTo, registros: RegistroDoTceTo[], agora: Date): Plano {
  const hoje = inicioDoDiaEmBrasilia(agora)
  const porId = new Map(registros.map((r) => [r.idProcedimento, r]))
  const naLista = new Set(lista.linhas.map((l) => l.idProcedimento))
  const municipais = lista.linhas.filter(linhaMunicipal)
  const comSessaoFutura = municipais.filter((l) => linhaComSessaoFutura(l, agora))
  const limiteDaConferencia = agora.getTime() - DIAS_PARA_RECONFERIR * DIA_MS
  const novas: LinhaDaListaTceTo[] = []
  const revisoes: { linha: LinhaDaListaTceTo; registro: RegistroDoTceTo; mudou: boolean }[] = []
  let aguardandoPncp = 0

  for (const linha of comSessaoFutura) {
    const registro = porId.get(linha.idProcedimento)
    if (!registro) {
      if (cadastradaHoje(linha, hoje)) aguardandoPncp++
      else novas.push(linha)
      continue
    }
    const mudou = registro.assinaturaDaLista !== assinaturaDaLinhaTceTo(linha)
    if (mudou || horario(registro.conferidaEm) < limiteDaConferencia) revisoes.push({ linha, registro, mudou })
  }

  novas.sort((a, b) => horario(diaDoTceTo(a.aberturaEm)) - horario(diaDoTceTo(b.aberturaEm)) || a.idProcedimento - b.idProcedimento)
  revisoes.sort((a, b) => Number(b.mudou) - Number(a.mudou) || horario(a.registro.conferidaEm) - horario(b.registro.conferidaEm))

  const sumidas = lista.completa
    ? registros
        .filter((r) => !naLista.has(r.idProcedimento))
        .filter((r) => (r.situacao === 'ABERTA' || r.situacao === 'SUSPENSA') && !!r.aberturaAt && r.aberturaAt.getTime() >= hoje.getTime())
        .sort((a, b) => horario(a.conferidaEm) - horario(b.conferidaEm))
    : []

  return { novas, revisoes, sumidas, aguardandoPncp, comSessaoFutura, municipais: municipais.length }
}

function situacaoDoDetalhe(detalhe: DetalheDoTceTo): SituacaoEnum | undefined {
  if (!detalhe.ativo) return 'CANCELADA'
  return situacaoDoTceTo(detalhe.situacaoDaSegundaFase || detalhe.situacao)
}

export async function coletarTceTo(dep: DependenciasDaColetaTceTo, agora: Date, limites: LimitesDaColetaTceTo = LIMITES_PADRAO_TCE_TO): Promise<ResumoDaColetaTceTo> {
  const inicioDaColeta = dep.relogio()
  const lista = await varrerListaTceTo(dep.rede, agora, limites)
  const registros = await dep.registrosSalvos()
  const hoje = inicioDoDiaEmBrasilia(agora)
  const plano = planejar(lista, registros, agora)
  const falhas = [...lista.falhas]
  const duplicadas: Record<MotivoDaDuplicidade, number> = { objeto: 0, numero: 0 }

  const resumo: ResumoDaColetaTceTo = {
    paginas: lista.paginasLidas,
    totalAnunciado: lista.totalAnunciado,
    motivoDaParada: lista.motivoDaParada,
    listaCompleta: lista.completa,
    registrosNaLista: lista.linhas.length,
    municipais: plano.municipais,
    comSessaoFutura: plano.comSessaoFutura.length,
    municipios: new Set(plano.comSessaoFutura.map((l) => l.codigoIbge)).size,
    aguardandoPncp: plano.aguardandoPncp,
    jaLidasAntes: 0,
    detalhesLidos: 0,
    semDetalhe: 0,
    adiadasPeloLimite: 0,
    novasForaDoPncp: 0,
    municipiosDasNovas: 0,
    duplicadasPncpPorObjeto: 0,
    duplicadasPncpPorNumero: 0,
    revisitadas: 0,
    sumidas: 0,
    ignoradas: 0,
    situacoesAlteradas: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    bloqueado: lista.motivoDaParada === 'bloqueio',
    falhas,
  }

  const tarefas: Tarefa[] = []
  const lidasAntes = await dep.memoria.jaLidos(plano.novas.map(chaveDaMemoriaTceTo))
  for (const linha of plano.novas) {
    const leitura = tenderDoTceTo(linha)
    if (leitura.tipo === 'ignorado' || leitura.tender.situacao !== 'ABERTA') {
      resumo.ignoradas++
      continue
    }
    if (lidasAntes.has(chaveDaMemoriaTceTo(linha))) {
      resumo.jaLidasAntes++
      continue
    }
    try {
      const motivo = await dep.duplicidadeNoPncp(leitura.tender, agora, !modalidadeIncerta(leitura.tender))
      if (motivo) {
        duplicadas[motivo]++
        continue
      }
    } catch (err) {
      falhas.push(`PNCP ${linha.idProcedimento} (${motivoCurto(err)})`)
      continue
    }
    tarefas.push({ tipo: 'nova', linha, tender: leitura.tender })
  }
  for (const revisao of plano.revisoes) tarefas.push({ tipo: 'revisao', ...revisao })
  const sumidasJaVistas = await dep.memoria.jaLidos(plano.sumidas.map((r) => chaveDaSumida(r, hoje)))
  for (const registro of plano.sumidas) if (!sumidasJaVistas.has(chaveDaSumida(registro, hoje))) tarefas.push({ tipo: 'sumida', registro })

  const lote: NormalizedTender[] = []
  const conferencias: { id: string; assinatura: string | null }[] = []
  const marcarDepois: string[] = []
  const municipiosDasNovas = new Set<string>()
  let detalhesPedidos = 0
  let falhasSeguidas = 0

  const mudarSituacao = async (registro: RegistroDoTceTo, situacao: SituacaoEnum | undefined) => {
    if (!situacao || situacao === registro.situacao) return
    await dep.atualizarSituacao(registro, situacao, agora)
    resumo.situacoesAlteradas++
  }

  const podeLerDetalhe = () =>
    !resumo.bloqueado && falhasSeguidas < FALHAS_SEGUIDAS_PARA_DESISTIR && detalhesPedidos < limites.maxDetalhes && dep.relogio() - inicioDaColeta < limites.orcamentoMs

  const lerDetalhe = async (idProcedimento: number): Promise<DetalheDoTceTo | undefined> => {
    detalhesPedidos++
    try {
      const detalhe = parseDetalheTceTo(await lerComRetentativaTceTo(() => dep.rede.baixarDetalhe(idProcedimento), TENTATIVAS_POR_DETALHE, dep.rede))
      resumo.detalhesLidos++
      falhasSeguidas = 0
      return detalhe
    } catch (err) {
      if (err instanceof BloqueioDoTceTo) resumo.bloqueado = true
      else falhasSeguidas++
      falhas.push(`detalhe ${idProcedimento} (${err instanceof BloqueioDoTceTo ? err.message : motivoCurto(err)})`)
      return undefined
    }
  }

  for (const tarefa of tarefas) {
    if (tarefa.tipo === 'nova') {
      const detalhe = podeLerDetalhe() ? await lerDetalhe(tarefa.linha.idProcedimento) : undefined
      const leitura = detalhe ? tenderDoTceTo(tarefa.linha, detalhe) : { tipo: 'licitacao' as const, tender: tarefa.tender }
      if (!detalhe) resumo.semDetalhe++
      if (leitura.tipo === 'ignorado' || leitura.tender.situacao !== 'ABERTA' || !leitura.tender.aberturaAt || leitura.tender.aberturaAt.getTime() < hoje.getTime()) {
        resumo.ignoradas++
        marcarDepois.push(chaveDaMemoriaTceTo(tarefa.linha))
        continue
      }
      resumo.novasForaDoPncp++
      if (leitura.tender.municipioIbge) municipiosDasNovas.add(leitura.tender.municipioIbge)
      lote.push(leitura.tender)
      continue
    }

    if (!podeLerDetalhe()) {
      resumo.adiadasPeloLimite++
      continue
    }

    if (tarefa.tipo === 'sumida') {
      const detalhe = await lerDetalhe(tarefa.registro.idProcedimento)
      if (!detalhe) continue
      resumo.sumidas++
      await mudarSituacao(tarefa.registro, situacaoDoDetalhe(detalhe))
      conferencias.push({ id: tarefa.registro.id, assinatura: tarefa.registro.assinaturaDaLista })
      marcarDepois.push(chaveDaSumida(tarefa.registro, hoje))
      continue
    }

    const detalhe = await lerDetalhe(tarefa.linha.idProcedimento)
    if (!detalhe) continue
    const leitura = tenderDoTceTo(tarefa.linha, detalhe)
    if (leitura.tipo === 'ignorado') {
      resumo.ignoradas++
      conferencias.push({ id: tarefa.registro.id, assinatura: assinaturaDaLinhaTceTo(tarefa.linha) })
      continue
    }
    resumo.revisitadas++
    lote.push(leitura.tender)
    await mudarSituacao(tarefa.registro, leitura.tender.situacao)
    conferencias.push({ id: tarefa.registro.id, assinatura: assinaturaDaLinhaTceTo(tarefa.linha) })
  }

  resumo.duplicadasPncpPorObjeto = duplicadas.objeto
  resumo.duplicadasPncpPorNumero = duplicadas.numero
  resumo.municipiosDasNovas = municipiosDasNovas.size

  const salvos = await dep.salvarLote(lote)
  resumo.totalNew = salvos.totalNew
  resumo.totalDupes = salvos.totalDupes
  resumo.totalUpdated = salvos.totalUpdated

  for (const conferencia of conferencias) await dep.registrarConferencia(conferencia.id, agora, conferencia.assinatura)
  for (const chave of marcarDepois) await dep.memoria.marcarLido(chave)

  return resumo
}

export function linhaDoResumoTceTo(r: ResumoDaColetaTceTo): string {
  return (
    `páginas: ${r.paginas} (parada: ${r.motivoDaParada}${r.listaCompleta ? '' : ', incompleta'}), ` +
    `na lista: ${r.registrosNaLista}${r.totalAnunciado !== null ? `/${r.totalAnunciado}` : ''}, municipais: ${r.municipais}, ` +
    `com sessão futura: ${r.comSessaoFutura} em ${r.municipios} município(s), ` +
    `já no PNCP: ${r.duplicadasPncpPorObjeto + r.duplicadasPncpPorNumero} (objeto ${r.duplicadasPncpPorObjeto}, número ${r.duplicadasPncpPorNumero}), ` +
    `novas fora do PNCP: ${r.novasForaDoPncp} em ${r.municipiosDasNovas} município(s), ` +
    `cadastradas hoje (aguardando o PNCP): ${r.aguardandoPncp}, já lidas antes: ${r.jaLidasAntes}, ` +
    `detalhes lidos: ${r.detalhesLidos}, sem detalhe: ${r.semDetalhe}, novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
    `revisitadas: ${r.revisitadas}, sumidas da lista: ${r.sumidas}, situações alteradas: ${r.situacoesAlteradas}, ` +
    `ignoradas: ${r.ignoradas}, adiadas pelo limite: ${r.adiadasPeloLimite}${r.bloqueado ? ', BLOQUEADO pelo portal' : ''}` +
    `${r.falhas.length > 0 ? `, falhas: ${r.falhas.length}` : ''}`
  )
}
