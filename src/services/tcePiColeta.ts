import { tcePiClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { NormalizedTender, SituacaoEnum } from '../types'
import { motivoCurto } from './infraeroVarredura'
import { decodificarHtml } from './sescRegional/tipos'
import {
  CAMINHO_DO_MURAL_TCE_PI,
  CamposDoFormulario,
  FormatoInesperadoDoTcePi,
  LinhaDoMuralTcePi,
  PublicacaoDoTcePi,
  RespostaParcial,
  assinaturaDaLinha,
  cadastradaHaPouco,
  caminhoDoDetalheTcePi,
  camposDaExportacao,
  camposDaPagina,
  camposDaPesquisa,
  camposDoPainel,
  formularioDoMural,
  lerRespostaParcial,
  linhaComSessaoFutura,
  linhasDaPlanilha,
  linhasDaTabela,
  parseDetalheTcePi,
  planilhaDaExportacao,
  publicacoesDoPainel,
  publicadoNoPncp,
  sessaoDaLinha,
  situacaoDoTcePi,
  tabelaDoMural,
  tenderDoTcePi,
} from './tcePiParser'

export const LINHAS_POR_PAGINA = 100
export const MAX_PAGINAS_POR_COLETA = 30
export const MAX_CONSULTAS_DE_PUBLICACAO = 40
export const MAX_SUMIDAS_POR_COLETA = 40
export const MAX_REQUISICOES_POR_COLETA = 160
export const TENTATIVAS_POR_REQUISICAO = 3
export const ESPERA_ENTRE_TENTATIVAS_MS = 5_000
export const FALHAS_SEGUIDAS_PARA_DESISTIR = 3
export const DIAS_DE_ESPERA_PELO_PNCP = 3
export const MOTIVO_PUBLICADA_NO_PNCP = 'PUBLICADA_NO_PNCP'

export interface RespostaDoTcePi {
  corpo: string
  cookies: string[]
}

export interface RedeDoTcePi {
  obter: (caminho: string, cookie: string | null) => Promise<RespostaDoTcePi>
  enviar: (caminho: string, campos: CamposDoFormulario, cookie: string | null) => Promise<RespostaDoTcePi>
  esperar: (ms: number) => Promise<void>
}

function cookiesDaResposta(cabecalho: unknown): string[] {
  if (Array.isArray(cabecalho)) return cabecalho.map(String)
  return typeof cabecalho === 'string' ? [cabecalho] : []
}

function comCookie(cookie: string | null): Record<string, string> {
  return cookie ? { Cookie: cookie } : {}
}

export const REDE_DO_TCE_PI: RedeDoTcePi = {
  obter: async (caminho, cookie) => {
    const resposta = await tcePiClient.get<ArrayBuffer>(caminho, { responseType: 'arraybuffer', headers: comCookie(cookie) })
    return { corpo: decodificarHtml(Buffer.from(resposta.data), String(resposta.headers['content-type'] ?? '')), cookies: cookiesDaResposta(resposta.headers['set-cookie']) }
  },
  enviar: async (caminho, campos, cookie) => {
    const resposta = await tcePiClient.post<ArrayBuffer>(caminho, new URLSearchParams(campos).toString(), {
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/xml, text/xml, */*; q=0.01',
        ...comCookie(cookie),
      },
    })
    return { corpo: decodificarHtml(Buffer.from(resposta.data), String(resposta.headers['content-type'] ?? '')), cookies: cookiesDaResposta(resposta.headers['set-cookie']) }
  },
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface LimitesDaColetaTcePi {
  maxPaginas: number
  maxConsultasDePublicacao: number
  maxSumidas: number
  maxRequisicoes: number
}

export const LIMITES_PADRAO_TCE_PI: LimitesDaColetaTcePi = {
  maxPaginas: MAX_PAGINAS_POR_COLETA,
  maxConsultasDePublicacao: MAX_CONSULTAS_DE_PUBLICACAO,
  maxSumidas: MAX_SUMIDAS_POR_COLETA,
  maxRequisicoes: MAX_REQUISICOES_POR_COLETA,
}

export class BloqueioDoTcePi extends Error {
  constructor(readonly status: number) {
    super(`TCE-PI recusou as requisições (HTTP ${status})`)
    this.name = 'BloqueioDoTcePi'
  }
}

export class LimiteDeRequisicoesDoTcePi extends Error {
  constructor(limite: number) {
    super(`TCE-PI: limite de ${limite} requisições da coleta atingido`)
    this.name = 'LimiteDeRequisicoesDoTcePi'
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

export async function lerComRetentativa<T>(ler: () => Promise<T>, tentativas: number, rede: Pick<RedeDoTcePi, 'esperar'>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await ler()
    } catch (err) {
      const status = statusHttp(err)
      if (status === 403 || status === 429) throw new BloqueioDoTcePi(status)
      if (tentativa >= tentativas || !erroTransitorio(err)) throw err
      await rede.esperar(ESPERA_ENTRE_TENTATIVAS_MS * 2 ** (tentativa - 1))
    }
  }
}

export interface SessaoDoTcePi {
  obter: (caminho: string) => Promise<string>
  enviar: (caminho: string, campos: CamposDoFormulario) => Promise<RespostaParcial>
  requisicoes: () => number
}

export function abrirSessaoDoTcePi(rede: RedeDoTcePi, maxRequisicoes: number): SessaoDoTcePi {
  let cookie: string | null = null
  let requisicoes = 0

  const pedir = (ler: () => Promise<RespostaDoTcePi>): Promise<string> =>
    lerComRetentativa(
      async () => {
        if (requisicoes >= maxRequisicoes) throw new LimiteDeRequisicoesDoTcePi(maxRequisicoes)
        requisicoes++
        const resposta = await ler()
        const sessao = resposta.cookies.map((c) => c.split(';')[0].trim()).find((c) => /^JSESSIONID=/i.test(c))
        if (sessao) cookie = sessao
        return resposta.corpo
      },
      TENTATIVAS_POR_REQUISICAO,
      rede
    )

  return {
    obter: (caminho) => pedir(() => rede.obter(caminho, cookie)),
    enviar: async (caminho, campos) => {
      const resposta = lerRespostaParcial(await pedir(() => rede.enviar(caminho, campos, cookie)))
      if (resposta.redirecionamento !== undefined || resposta.erro !== undefined) {
        throw new FormatoInesperadoDoTcePi(`o portal recusou o formulário (${resposta.erro?.split('.').pop() ?? 'sessão expirada'})`)
      }
      return resposta
    },
    requisicoes: () => requisicoes,
  }
}

export type OrigemDaLista = 'tabela' | 'planilha' | 'nenhuma'

export interface ResultadoDaListaTcePi {
  linhas: LinhaDoMuralTcePi[]
  total: number | null
  paginas: number
  origem: OrigemDaLista
  completa: boolean
  bloqueado: boolean
  falhas: string[]
}

function interrompe(err: unknown): boolean {
  return err instanceof BloqueioDoTcePi || err instanceof LimiteDeRequisicoesDoTcePi
}

export async function listarDivulgadasTcePi(sessao: SessaoDoTcePi, limites: LimitesDaColetaTcePi): Promise<ResultadoDaListaTcePi> {
  const porId = new Map<number, LinhaDoMuralTcePi>()
  const falhas: string[] = []
  let paginas = 0
  let total: number | null = null
  const resultado = (origem: OrigemDaLista, completa: boolean, bloqueado = false): ResultadoDaListaTcePi => ({
    linhas: [...porId.values()],
    total,
    paginas,
    origem,
    completa,
    bloqueado,
    falhas,
  })

  let formulario: ReturnType<typeof formularioDoMural>
  let cabecalho: string[]
  let viewState: string
  try {
    formulario = formularioDoMural(await sessao.obter(CAMINHO_DO_MURAL_TCE_PI))
    const pesquisa = await sessao.enviar(formulario.acao, camposDaPesquisa(formulario, formulario.viewState))
    viewState = pesquisa.viewState ?? formulario.viewState
    const html = pesquisa.atualizacoes.get(formulario.tabela)
    if (html === undefined) throw new FormatoInesperadoDoTcePi('pesquisa sem a tabela de resultados')
    const tabela = tabelaDoMural(html)
    cabecalho = tabela.cabecalho
    total = tabela.total
  } catch (err) {
    falhas.push(`pesquisa (${motivoCurto(err)})`)
    return resultado('nenhuma', false, err instanceof BloqueioDoTcePi)
  }

  let pelaTabela = total !== null
  const paginasNecessarias = total === null ? 0 : Math.ceil(total / LINHAS_POR_PAGINA)
  for (let pagina = 0; pelaTabela && pagina < paginasNecessarias; pagina++) {
    if (pagina >= limites.maxPaginas) {
      falhas.push(`limite de ${limites.maxPaginas} páginas`)
      pelaTabela = false
      break
    }
    try {
      const resposta = await sessao.enviar(formulario.acao, camposDaPagina(formulario, viewState, pagina * LINHAS_POR_PAGINA, LINHAS_POR_PAGINA))
      viewState = resposta.viewState ?? viewState
      const html = resposta.atualizacoes.get(formulario.tabela)
      if (html === undefined) throw new FormatoInesperadoDoTcePi(`página ${pagina + 1} sem a tabela`)
      const linhas = linhasDaTabela(html, cabecalho)
      paginas++
      for (const linha of linhas) if (!porId.has(linha.idNoMural)) porId.set(linha.idNoMural, linha)
      if (linhas.length === 0) break
    } catch (err) {
      falhas.push(`página ${pagina + 1} (${motivoCurto(err)})`)
      if (interrompe(err)) return resultado('tabela', false, err instanceof BloqueioDoTcePi)
      pelaTabela = false
    }
  }

  if (pelaTabela && total !== null && porId.size >= total) return resultado('tabela', true)

  try {
    const exportacao = await sessao.enviar(formulario.acao, camposDaExportacao(formulario, viewState))
    for (const linha of linhasDaPlanilha(planilhaDaExportacao(exportacao))) {
      const daTabela = porId.get(linha.idNoMural)
      porId.set(linha.idNoMural, daTabela ? { ...linha, processoAdministrativo: daTabela.processoAdministrativo } : linha)
    }
    return resultado('planilha', total === null || porId.size >= total)
  } catch (err) {
    falhas.push(`planilha (${motivoCurto(err)})`)
    return resultado(porId.size > 0 ? 'tabela' : 'nenhuma', false, err instanceof BloqueioDoTcePi)
  }
}

export async function publicacoesDaLicitacaoTcePi(sessao: SessaoDoTcePi, idNoMural: number): Promise<PublicacaoDoTcePi[]> {
  const detalhe = parseDetalheTcePi(await sessao.obter(caminhoDoDetalheTcePi(idNoMural)))
  if (!detalhe.painelDePublicacoes) throw new FormatoInesperadoDoTcePi('detalhe sem o painel de publicações')
  return publicacoesDoPainel(await sessao.enviar(detalhe.acao, camposDoPainel(detalhe, detalhe.painelDePublicacoes)), detalhe.painelDePublicacoes)
}

export async function statusNoDetalheTcePi(sessao: SessaoDoTcePi, idNoMural: number): Promise<string> {
  return parseDetalheTcePi(await sessao.obter(caminhoDoDetalheTcePi(idNoMural))).status
}

export interface RegistroDoTcePi {
  id: string
  idNoMural: number
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  assinaturaDaLista: string | null
  publicadoNoPncp: boolean | null
  oculta: boolean
}

export interface ContagemDoSalvamentoTcePi {
  totalNew: number
  totalDupes: number
  totalUpdated: number
}

export interface DependenciasDaColetaTcePi {
  rede: RedeDoTcePi
  registrosSalvos: () => Promise<RegistroDoTcePi[]>
  duplicataNoPncp: (tender: NormalizedTender, agora: Date) => Promise<string | null>
  gemeaPublicadaNoPncp: (tender: NormalizedTender, agora: Date) => Promise<string | null>
  salvarLote: (lote: NormalizedTender[]) => Promise<ContagemDoSalvamentoTcePi>
  guardarOcultas: (lote: NormalizedTender[], motivo: string) => Promise<void>
  atualizarSituacao: (registro: RegistroDoTcePi, situacao: SituacaoEnum, agora: Date) => Promise<void>
  registrarConferencia: (registroId: string, agora: Date, assinaturaDaLista: string | null) => Promise<void>
}

export interface ResumoDaColetaTcePi {
  requisicoes: number
  paginas: number
  origemDaLista: OrigemDaLista
  totalNoMural: number | null
  registrosNaLista: number
  listaCompleta: boolean
  comSessaoFutura: number
  municipios: number
  semMunicipio: number
  jaNoPncp: number
  jaNoPncpPeloMural: number
  novasForaDoPncp: number
  publicadasNoPncpSemGemea: number
  aguardandoPncp: number
  consultasDePublicacao: number
  revisitadas: number
  sumidas: number
  situacoesAlteradas: number
  ignoradas: number
  adiadasPeloLimite: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  bloqueado: boolean
  falhas: string[]
}

function horario(data: Date | null | undefined): number {
  return data?.getTime() ?? -Infinity
}

function comPublicacoes(tender: NormalizedTender, publicacoes: PublicacaoDoTcePi[] | null): NormalizedTender {
  return { ...tender, rawJson: { ...tender.rawJson, publicadoNoPncp: publicacoes ? publicadoNoPncp(publicacoes) : null, publicacoes: publicacoes ?? [] } }
}

function comPublicacaoConhecida(tender: NormalizedTender, registro: RegistroDoTcePi): NormalizedTender {
  return { ...tender, rawJson: { ...tender.rawJson, publicadoNoPncp: registro.publicadoNoPncp } }
}

export async function coletarTcePi(dep: DependenciasDaColetaTcePi, agora: Date, limites: LimitesDaColetaTcePi = LIMITES_PADRAO_TCE_PI): Promise<ResumoDaColetaTcePi> {
  const sessao = abrirSessaoDoTcePi(dep.rede, limites.maxRequisicoes)
  const lista = await listarDivulgadasTcePi(sessao, limites)
  const registros = await dep.registrosSalvos()
  const porId = new Map(registros.map((r) => [r.idNoMural, r]))
  const naLista = new Set(lista.linhas.map((l) => l.idNoMural))
  const hoje = inicioDoDiaEmBrasilia(agora)
  const futuras = lista.linhas.filter((l) => linhaComSessaoFutura(l, agora))
  const falhas = [...lista.falhas]

  const resumo: ResumoDaColetaTcePi = {
    requisicoes: 0,
    paginas: lista.paginas,
    origemDaLista: lista.origem,
    totalNoMural: lista.total,
    registrosNaLista: lista.linhas.length,
    listaCompleta: lista.completa,
    comSessaoFutura: futuras.length,
    municipios: 0,
    semMunicipio: 0,
    jaNoPncp: 0,
    jaNoPncpPeloMural: 0,
    novasForaDoPncp: 0,
    publicadasNoPncpSemGemea: 0,
    aguardandoPncp: 0,
    consultasDePublicacao: 0,
    revisitadas: 0,
    sumidas: 0,
    situacoesAlteradas: 0,
    ignoradas: 0,
    adiadasPeloLimite: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    bloqueado: lista.bloqueado,
    falhas,
  }

  const lote: NormalizedTender[] = []
  const ocultas: NormalizedTender[] = []
  const conferencias: { id: string; assinatura: string | null }[] = []
  const municipios = new Set<string>()

  const mudarSituacao = async (registro: RegistroDoTcePi, situacao: SituacaoEnum | undefined) => {
    if (!situacao || situacao === registro.situacao) return
    await dep.atualizarSituacao(registro, situacao, agora)
    resumo.situacoesAlteradas++
  }

  const candidatas: { linha: LinhaDoMuralTcePi; tender: NormalizedTender }[] = []
  for (const linha of futuras) {
    const leitura = tenderDoTcePi(linha)
    if (leitura.tipo === 'ignorado') {
      resumo.ignoradas++
      continue
    }
    const tender = leitura.tender
    if (tender.municipioIbge) municipios.add(tender.municipioIbge)
    else resumo.semMunicipio++

    const registro = porId.get(linha.idNoMural)
    if (registro) {
      const assinatura = assinaturaDaLinha(linha)
      if (registro.assinaturaDaLista !== assinatura) {
        resumo.revisitadas++
        lote.push(comPublicacaoConhecida(tender, registro))
      }
      await mudarSituacao(registro, tender.situacao)
      conferencias.push({ id: registro.id, assinatura })
      continue
    }

    if (tender.situacao !== 'ABERTA') {
      resumo.ignoradas++
      continue
    }
    try {
      if (await dep.duplicataNoPncp(tender, agora)) {
        resumo.jaNoPncp++
        continue
      }
    } catch (err) {
      falhas.push(`PNCP ${linha.idNoMural} (${motivoCurto(err)})`)
      continue
    }
    candidatas.push({ linha, tender })
  }
  resumo.municipios = municipios.size

  candidatas.sort((a, b) => horario(sessaoDaLinha(a.linha)) - horario(sessaoDaLinha(b.linha)))
  let falhasSeguidas = 0
  let consultar = true
  let tentativasDeConsulta = 0
  for (const { linha, tender } of candidatas) {
    if (!consultar || resumo.bloqueado || tentativasDeConsulta >= limites.maxConsultasDePublicacao) {
      resumo.adiadasPeloLimite++
      continue
    }
    tentativasDeConsulta++
    let publicacoes: PublicacaoDoTcePi[] | null = null
    try {
      publicacoes = await publicacoesDaLicitacaoTcePi(sessao, linha.idNoMural)
      resumo.consultasDePublicacao++
      falhasSeguidas = 0
    } catch (err) {
      falhas.push(`publicações ${linha.idNoMural} (${motivoCurto(err)})`)
      if (!(err instanceof FormatoInesperadoDoTcePi)) {
        resumo.adiadasPeloLimite++
        if (err instanceof BloqueioDoTcePi) resumo.bloqueado = true
        if (interrompe(err) || ++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) consultar = false
        continue
      }
    }

    if (publicacoes && publicadoNoPncp(publicacoes)) {
      try {
        if (await dep.gemeaPublicadaNoPncp(tender, agora)) {
          resumo.jaNoPncpPeloMural++
          ocultas.push(comPublicacoes(tender, publicacoes))
          continue
        }
      } catch (err) {
        falhas.push(`PNCP ${linha.idNoMural} (${motivoCurto(err)})`)
        continue
      }
      if (cadastradaHaPouco(linha, agora, DIAS_DE_ESPERA_PELO_PNCP)) {
        resumo.aguardandoPncp++
        continue
      }
      resumo.publicadasNoPncpSemGemea++
    }
    resumo.novasForaDoPncp++
    lote.push(comPublicacoes(tender, publicacoes))
  }

  const sumidas = lista.completa
    ? registros
        .filter((r) => !r.oculta && !naLista.has(r.idNoMural) && (r.situacao === 'ABERTA' || r.situacao === 'SUSPENSA') && horario(r.aberturaAt) >= hoje.getTime())
        .sort((a, b) => horario(a.conferidaEm) - horario(b.conferidaEm))
    : []
  falhasSeguidas = 0
  consultar = true
  for (const registro of sumidas) {
    if (!consultar || resumo.bloqueado || resumo.sumidas >= limites.maxSumidas) {
      resumo.adiadasPeloLimite++
      continue
    }
    try {
      const status = await statusNoDetalheTcePi(sessao, registro.idNoMural)
      resumo.sumidas++
      falhasSeguidas = 0
      await mudarSituacao(registro, situacaoDoTcePi(status))
      conferencias.push({ id: registro.id, assinatura: registro.assinaturaDaLista })
    } catch (err) {
      resumo.adiadasPeloLimite++
      falhas.push(`detalhe ${registro.idNoMural} (${motivoCurto(err)})`)
      if (err instanceof BloqueioDoTcePi) resumo.bloqueado = true
      if (interrompe(err) || ++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) consultar = false
    }
  }

  const salvos = await dep.salvarLote(lote)
  if (ocultas.length > 0) await dep.guardarOcultas(ocultas, MOTIVO_PUBLICADA_NO_PNCP)
  resumo.totalNew = salvos.totalNew
  resumo.totalDupes = salvos.totalDupes
  resumo.totalUpdated = salvos.totalUpdated
  for (const conferencia of conferencias) await dep.registrarConferencia(conferencia.id, agora, conferencia.assinatura)
  resumo.requisicoes = sessao.requisicoes()

  return resumo
}

export function linhaDoResumoTcePi(r: ResumoDaColetaTcePi): string {
  return (
    `requisições: ${r.requisicoes}, lista pela ${r.origemDaLista} (${r.paginas} página(s), ${r.registrosNaLista}${r.totalNoMural !== null ? `/${r.totalNoMural}` : ''} divulgadas` +
    `${r.listaCompleta ? '' : ', incompleta'}), com sessão futura: ${r.comSessaoFutura} em ${r.municipios} município(s)` +
    `${r.semMunicipio > 0 ? ` (+${r.semMunicipio} sem município)` : ''}, já no PNCP: ${r.jaNoPncp + r.jaNoPncpPeloMural} ` +
    `(regra estrita ${r.jaNoPncp}, publicação no PNCP informada ao TCE ${r.jaNoPncpPeloMural}), novas fora do PNCP: ${r.novasForaDoPncp}` +
    `${r.publicadasNoPncpSemGemea > 0 ? ` (${r.publicadasNoPncpSemGemea} informadas no PNCP sem par no banco)` : ''}, ` +
    `aguardando o PNCP: ${r.aguardandoPncp} (publicações consultadas: ${r.consultasDePublicacao}), novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
    `revisitadas: ${r.revisitadas}, sumidas da lista: ${r.sumidas}, situações alteradas: ${r.situacoesAlteradas}, ` +
    `ignoradas: ${r.ignoradas}, adiadas pelo limite: ${r.adiadasPeloLimite}${r.bloqueado ? ', BLOQUEADO pelo portal' : ''}` +
    `${r.falhas.length > 0 ? `, falhas: ${r.falhas.length}` : ''}`
  )
}
