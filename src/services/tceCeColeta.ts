import { tceCeClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { NormalizedTender, SituacaoEnum } from '../types'
import { motivoCurto } from './infraeroVarredura'
import { decodificarHtml } from './sescRegional/tipos'
import { MotivoDaDuplicidade } from './tceCeDuplicidade'
import {
  IdsDaLicitacaoTceCe,
  LinhaDaListaTceCe,
  assinaturaDaLinha,
  caminhoDaListaTceCe,
  caminhoDoDetalheTceCe,
  diaDeBrasilia,
  linhaComSessaoFutura,
  parseDetalheTceCe,
  parseListaTceCe,
  sessaoDaLinha,
  situacaoDoTceCe,
  tenderDoTceCe,
  tenderProvisorioDaLinha,
} from './tceCeParser'

export const MAX_PAGINAS_POR_COLETA = 200
export const MAX_DETALHES_POR_COLETA = 400
export const PAGINAS_SEM_CANDIDATA_PARA_PARAR = 80
export const TENTATIVAS_POR_PAGINA = 3
export const TENTATIVAS_POR_DETALHE = 2
export const ESPERA_ENTRE_TENTATIVAS_MS = 5_000
export const FALHAS_SEGUIDAS_PARA_DESISTIR = 3
export const DIAS_PARA_RECONFERIR = 3

const DIA_MS = 86_400_000

export interface RedeDoTceCe {
  baixarLista: (pagina: number) => Promise<string>
  baixarDetalhe: (ids: IdsDaLicitacaoTceCe) => Promise<string>
  esperar: (ms: number) => Promise<void>
}

async function baixarHtml(caminho: string): Promise<string> {
  const resposta = await tceCeClient.get<ArrayBuffer>(caminho, { responseType: 'arraybuffer' })
  return decodificarHtml(Buffer.from(resposta.data), String(resposta.headers['content-type'] ?? ''))
}

export const REDE_DO_TCE_CE: RedeDoTceCe = {
  baixarLista: (pagina) => baixarHtml(caminhoDaListaTceCe(pagina)),
  baixarDetalhe: (ids) => baixarHtml(caminhoDoDetalheTceCe(ids)),
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface LimitesDaColetaTceCe {
  maxPaginas: number
  maxDetalhes: number
  paginasSemCandidataParaParar: number
}

export const LIMITES_PADRAO_TCE_CE: LimitesDaColetaTceCe = {
  maxPaginas: MAX_PAGINAS_POR_COLETA,
  maxDetalhes: MAX_DETALHES_POR_COLETA,
  paginasSemCandidataParaParar: PAGINAS_SEM_CANDIDATA_PARA_PARAR,
}

export class BloqueioDoTceCe extends Error {
  constructor(readonly status: number) {
    super(`TCE-CE recusou as requisições (HTTP ${status})`)
    this.name = 'BloqueioDoTceCe'
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

export async function lerComRetentativa<T>(ler: () => Promise<T>, tentativas: number, rede: RedeDoTceCe): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await ler()
    } catch (err) {
      const status = statusHttp(err)
      if (status === 403 || status === 429) throw new BloqueioDoTceCe(status)
      if (tentativa >= tentativas || !erroTransitorio(err)) throw err
      await rede.esperar(ESPERA_ENTRE_TENTATIVAS_MS * 2 ** (tentativa - 1))
    }
  }
}

export type MotivoDaParadaDaLista = 'fim' | 'sem_candidatas' | 'limite' | 'falhas' | 'bloqueio'

export interface ResultadoDaLista {
  linhas: LinhaDaListaTceCe[]
  paginasLidas: number
  ultimaPagina: number | null
  motivoDaParada: MotivoDaParadaDaLista
  completa: boolean
  falhas: string[]
}

export async function varrerListaTceCe(rede: RedeDoTceCe, agora: Date, limites: LimitesDaColetaTceCe = LIMITES_PADRAO_TCE_CE): Promise<ResultadoDaLista> {
  const porId = new Map<number, LinhaDaListaTceCe>()
  const falhas: string[] = []
  let paginasLidas = 0
  let ultimaPagina: number | null = null
  let semCandidata = 0
  let falhasSeguidas = 0

  const fim = (motivoDaParada: MotivoDaParadaDaLista): ResultadoDaLista => ({
    linhas: [...porId.values()],
    paginasLidas,
    ultimaPagina,
    motivoDaParada,
    completa: (motivoDaParada === 'fim' || motivoDaParada === 'sem_candidatas') && falhas.length === 0,
    falhas,
  })

  for (let pagina = 1; ; pagina++) {
    if (ultimaPagina !== null && pagina > ultimaPagina) return fim('fim')
    if (pagina > limites.maxPaginas) return fim('limite')

    let linhas: LinhaDaListaTceCe[]
    try {
      const leitura = parseListaTceCe(await lerComRetentativa(() => rede.baixarLista(pagina), TENTATIVAS_POR_PAGINA, rede))
      linhas = leitura.linhas
      if (leitura.ultimaPagina !== null) ultimaPagina = Math.max(ultimaPagina ?? 0, leitura.ultimaPagina)
      falhasSeguidas = 0
    } catch (err) {
      if (err instanceof BloqueioDoTceCe) {
        falhas.push(`página ${pagina} (${err.message})`)
        return fim('bloqueio')
      }
      falhas.push(`página ${pagina} (${motivoCurto(err)})`)
      if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) return fim('falhas')
      continue
    }

    paginasLidas++
    if (linhas.length === 0) return fim('fim')
    for (const linha of linhas) if (!porId.has(linha.idLicitacao)) porId.set(linha.idLicitacao, linha)
    semCandidata = linhas.some((l) => linhaComSessaoFutura(l, agora)) ? 0 : semCandidata + 1
    if (semCandidata >= limites.paginasSemCandidataParaParar) return fim('sem_candidatas')
  }
}

export interface RegistroDoTceCe {
  id: string
  idLicitacao: number
  idProcesso: number | null
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  assinaturaDaLista: string | null
}

export interface ContagemDoSalvamentoTceCe {
  totalNew: number
  totalDupes: number
  totalUpdated: number
}

export interface DependenciasDaColetaTceCe {
  rede: RedeDoTceCe
  registrosSalvos: () => Promise<RegistroDoTceCe[]>
  duplicidadeNoPncp: (tender: NormalizedTender, agora: Date, modalidadeConhecida: boolean) => Promise<MotivoDaDuplicidade | null>
  salvarLote: (lote: NormalizedTender[]) => Promise<ContagemDoSalvamentoTceCe>
  atualizarSituacao: (registro: RegistroDoTceCe, situacao: SituacaoEnum, agora: Date) => Promise<void>
  registrarConferencia: (registroId: string, agora: Date, assinaturaDaLista: string | null) => Promise<void>
}

export interface ResumoDaColetaTceCe {
  paginas: number
  ultimaPagina: number | null
  motivoDaParada: MotivoDaParadaDaLista
  listaCompleta: boolean
  registrosNaLista: number
  comSessaoFutura: number
  municipios: number
  aguardandoPncp: number
  detalhesLidos: number
  adiadasPeloLimite: number
  novasForaDoPncp: number
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
  | { tipo: 'nova'; linha: LinhaDaListaTceCe }
  | { tipo: 'revisao'; linha: LinhaDaListaTceCe; registro: RegistroDoTceCe }
  | { tipo: 'sumida'; registro: RegistroDoTceCe & { idProcesso: number } }

function idsDaTarefa(tarefa: Tarefa): IdsDaLicitacaoTceCe {
  return tarefa.tipo === 'sumida' ? { idProcesso: tarefa.registro.idProcesso, idLicitacao: tarefa.registro.idLicitacao } : tarefa.linha
}

function horario(data: Date | null | undefined): number {
  return data?.getTime() ?? -Infinity
}

function publicadaHoje(linha: LinhaDaListaTceCe, hoje: Date): boolean {
  const publicacao = diaDeBrasilia(linha.publicadoEm)
  return !!publicacao && publicacao.getTime() >= hoje.getTime()
}

function planejarTarefas(lista: ResultadoDaLista, registros: RegistroDoTceCe[], agora: Date): { tarefas: Tarefa[]; aguardandoPncp: number; comSessaoFutura: LinhaDaListaTceCe[] } {
  const hoje = inicioDoDiaEmBrasilia(agora)
  const porId = new Map(registros.map((r) => [r.idLicitacao, r]))
  const naLista = new Set(lista.linhas.map((l) => l.idLicitacao))
  const comSessaoFutura = lista.linhas.filter((l) => linhaComSessaoFutura(l, agora))
  const limiteDaConferencia = agora.getTime() - DIAS_PARA_RECONFERIR * DIA_MS

  const novas: LinhaDaListaTceCe[] = []
  let aguardandoPncp = 0
  const revisoes: { tarefa: Tarefa; mudou: boolean; conferidaEm: number }[] = []

  for (const linha of comSessaoFutura) {
    const registro = porId.get(linha.idLicitacao)
    if (!registro) {
      if (publicadaHoje(linha, hoje)) aguardandoPncp++
      else novas.push(linha)
      continue
    }
    const mudou = registro.assinaturaDaLista !== assinaturaDaLinha(linha)
    if (mudou || horario(registro.conferidaEm) < limiteDaConferencia) {
      revisoes.push({ tarefa: { tipo: 'revisao', linha, registro }, mudou, conferidaEm: horario(registro.conferidaEm) })
    }
  }

  novas.sort((a, b) => horario(sessaoDaLinha(a)) - horario(sessaoDaLinha(b)))
  revisoes.sort((a, b) => Number(b.mudou) - Number(a.mudou) || a.conferidaEm - b.conferidaEm)

  const sumidas: Tarefa[] = lista.completa
    ? registros
        .filter((r): r is RegistroDoTceCe & { idProcesso: number } => r.idProcesso !== null && !naLista.has(r.idLicitacao))
        .filter((r) => (r.situacao === 'ABERTA' || r.situacao === 'SUSPENSA') && !!r.aberturaAt && r.aberturaAt.getTime() >= hoje.getTime())
        .sort((a, b) => horario(a.conferidaEm) - horario(b.conferidaEm))
        .map((registro) => ({ tipo: 'sumida' as const, registro }))
    : []

  const tarefasNovas: Tarefa[] = novas.map((linha) => ({ tipo: 'nova', linha }))
  return { tarefas: [...tarefasNovas, ...revisoes.map((r) => r.tarefa), ...sumidas], aguardandoPncp, comSessaoFutura }
}

export async function coletarTceCe(dep: DependenciasDaColetaTceCe, agora: Date, limites: LimitesDaColetaTceCe = LIMITES_PADRAO_TCE_CE): Promise<ResumoDaColetaTceCe> {
  const lista = await varrerListaTceCe(dep.rede, agora, limites)
  const registros = await dep.registrosSalvos()
  const hoje = inicioDoDiaEmBrasilia(agora)
  const plano = planejarTarefas(lista, registros, agora)
  const falhas = [...lista.falhas]
  const duplicadas: Record<MotivoDaDuplicidade, number> = { objeto: 0, numero: 0 }

  const foraDoPncp = async (tender: NormalizedTender, modalidadeConhecida: boolean, idLicitacao: number): Promise<boolean> => {
    try {
      const motivo = await dep.duplicidadeNoPncp(tender, agora, modalidadeConhecida)
      if (!motivo) return true
      duplicadas[motivo]++
      return false
    } catch (err) {
      falhas.push(`PNCP ${idLicitacao} (${motivoCurto(err)})`)
      return false
    }
  }

  const tarefas: Tarefa[] = []
  for (const tarefa of plano.tarefas) {
    if (tarefa.tipo !== 'nova' || (await foraDoPncp(tenderProvisorioDaLinha(tarefa.linha), false, tarefa.linha.idLicitacao))) tarefas.push(tarefa)
  }
  const executar = tarefas.slice(0, limites.maxDetalhes)

  const resumo: ResumoDaColetaTceCe = {
    paginas: lista.paginasLidas,
    ultimaPagina: lista.ultimaPagina,
    motivoDaParada: lista.motivoDaParada,
    listaCompleta: lista.completa,
    registrosNaLista: lista.linhas.length,
    comSessaoFutura: plano.comSessaoFutura.length,
    municipios: new Set(plano.comSessaoFutura.map((l) => l.municipio)).size,
    aguardandoPncp: plano.aguardandoPncp,
    detalhesLidos: 0,
    adiadasPeloLimite: tarefas.length - executar.length,
    novasForaDoPncp: 0,
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

  const lote: NormalizedTender[] = []
  const conferencias: { id: string; assinatura: string | null }[] = []
  let falhasSeguidas = 0

  const mudarSituacao = async (registro: RegistroDoTceCe, situacao: SituacaoEnum | undefined) => {
    if (!situacao || situacao === registro.situacao) return
    await dep.atualizarSituacao(registro, situacao, agora)
    resumo.situacoesAlteradas++
  }

  for (const tarefa of resumo.bloqueado ? [] : executar) {
    const ids = idsDaTarefa(tarefa)
    let detalhe: ReturnType<typeof parseDetalheTceCe>
    try {
      detalhe = parseDetalheTceCe(await lerComRetentativa(() => dep.rede.baixarDetalhe(ids), TENTATIVAS_POR_DETALHE, dep.rede))
      resumo.detalhesLidos++
      falhasSeguidas = 0
    } catch (err) {
      if (err instanceof BloqueioDoTceCe) {
        resumo.bloqueado = true
        falhas.push(`detalhe ${ids.idLicitacao} (${err.message})`)
        break
      }
      falhas.push(`detalhe ${ids.idLicitacao} (${motivoCurto(err)})`)
      if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) break
      continue
    }

    if (tarefa.tipo === 'sumida') {
      resumo.sumidas++
      await mudarSituacao(tarefa.registro, situacaoDoTceCe(detalhe.situacao))
      conferencias.push({ id: tarefa.registro.id, assinatura: tarefa.registro.assinaturaDaLista })
      continue
    }

    const leitura = tenderDoTceCe(tarefa.linha, detalhe)
    if (leitura.tipo === 'ignorado') {
      resumo.ignoradas++
      if (tarefa.tipo === 'revisao') conferencias.push({ id: tarefa.registro.id, assinatura: assinaturaDaLinha(tarefa.linha) })
      continue
    }
    const tender = leitura.tender

    if (tarefa.tipo === 'revisao') {
      resumo.revisitadas++
      lote.push(tender)
      await mudarSituacao(tarefa.registro, tender.situacao)
      conferencias.push({ id: tarefa.registro.id, assinatura: assinaturaDaLinha(tarefa.linha) })
      continue
    }

    if (tender.situacao !== 'ABERTA' || !tender.aberturaAt || tender.aberturaAt.getTime() < hoje.getTime()) {
      resumo.ignoradas++
      continue
    }

    if (await foraDoPncp(tender, true, ids.idLicitacao)) {
      resumo.novasForaDoPncp++
      lote.push(tender)
    }
  }

  resumo.duplicadasPncpPorObjeto = duplicadas.objeto
  resumo.duplicadasPncpPorNumero = duplicadas.numero
  const salvos = await dep.salvarLote(lote)
  resumo.totalNew = salvos.totalNew
  resumo.totalDupes = salvos.totalDupes
  resumo.totalUpdated = salvos.totalUpdated

  for (const conferencia of conferencias) await dep.registrarConferencia(conferencia.id, agora, conferencia.assinatura)

  return resumo
}

export function linhaDoResumo(r: ResumoDaColetaTceCe): string {
  return (
    `páginas: ${r.paginas}${r.ultimaPagina ? `/${r.ultimaPagina}` : ''} (parada: ${r.motivoDaParada}${r.listaCompleta ? '' : ', incompleta'}), ` +
    `registros na lista: ${r.registrosNaLista}, com sessão futura: ${r.comSessaoFutura} em ${r.municipios} município(s), ` +
    `detalhes lidos: ${r.detalhesLidos}, novas fora do PNCP: ${r.novasForaDoPncp}, ` +
    `já no PNCP: ${r.duplicadasPncpPorObjeto + r.duplicadasPncpPorNumero} (objeto ${r.duplicadasPncpPorObjeto}, número ${r.duplicadasPncpPorNumero}), ` +
    `publicadas hoje (aguardando o PNCP): ${r.aguardandoPncp}, novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
    `revisitadas: ${r.revisitadas}, sumidas da lista: ${r.sumidas}, situações alteradas: ${r.situacoesAlteradas}, ` +
    `ignoradas: ${r.ignoradas}, adiadas pelo limite: ${r.adiadasPeloLimite}${r.bloqueado ? ', BLOQUEADO pelo portal' : ''}` +
    `${r.falhas.length > 0 ? `, falhas: ${r.falhas.length}` : ''}`
  )
}
