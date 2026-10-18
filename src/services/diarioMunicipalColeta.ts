import { NormalizedTender } from '../types'
import {
  ASSOCIACOES_SIGPUB,
  AssociacaoSigpub,
  CartaoDeMateria,
  PaginaDeBusca,
  avisosDaMateria,
  chaveDaMateria,
  lerMateria,
  tituloDeAviso,
} from './diarioMunicipalParser'
import { JanelaDoDiarioMunicipal, TERMOS_DE_BUSCA_SIGPUB } from './diarioMunicipalService'
import { ClienteRedisDaMemoria, ContagemDoSalvamento, MemoriaDeDiarios, memoriaDeDiariosNoRedis } from './queridoDiarioColeta'
import { statusDaResposta } from './queridoDiarioService'

export const ESPACO_ENTRE_REQUISICOES_MS = 2_000
export const ESPERA_ANTES_DE_REPETIR_MS = 5_000
export const ESPERA_APOS_BLOQUEIO_MS = 60_000
export const TENTATIVAS_APOS_BLOQUEIO = 1
export const FALHAS_SEGUIDAS_PARA_PARAR = 5
export const MAXIMO_DE_PAGINAS_POR_BUSCA = 20
export const CHAVE_DAS_MATERIAS_LIDAS = 'diario-municipal:materias-lidas'
export const DIAS_NA_MEMORIA = 20

export interface OrcamentoDaColeta {
  tempoMs: number
  requisicoes: number
}

export const ORCAMENTO_PADRAO: OrcamentoDaColeta = { tempoMs: 45 * 60_000, requisicoes: 900 }

export type MotivoDaParada = 'concluida' | 'tempo' | 'requisicoes' | 'bloqueio' | 'falhas'

export interface MedicaoDaAssociacao {
  associacao: string
  uf: string
  buscas: number
  materiasEncontradas: number
  descartadasPeloTitulo: number
  jaLidasAntes: number
  materiasLidas: number
  falhasDeLeitura: number
  semMunicipio: number
  avisos: number
  novos: number
  atualizados: number
  inalterados: number
  duplicadosDoPncp: number
  duplicadosDoQueridoDiario: number
  buscasIncompletas: number
  semPublicacoesNaJanela: boolean
}

export interface ResultadoDaColeta {
  porAssociacao: MedicaoDaAssociacao[]
  requisicoes: number
  buscas: number
  downloads: number
  totalFetched: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  materiasLidas: number
  jaLidasAntes: number
  avisos: number
  descartadosPorPncp: number
  duplicadosDoPncp: number
  duplicadosDoQueridoDiario: number
  falhasDeLeitura: number
  falhasDeBusca: number
  houveFalhas: boolean
  motivoDaParada: MotivoDaParada
  associacoesIncompletas: string[]
  associacoesNaoVisitadas: string[]
}

export interface DependenciasDaColeta {
  buscar(associacao: AssociacaoSigpub, termo: string, janela: JanelaDoDiarioMunicipal, pagina: number): Promise<PaginaDeBusca>
  baixarMateria(associacao: AssociacaoSigpub, codigo: string): Promise<string>
  existeNoPncp(tender: NormalizedTender, agora: Date): Promise<boolean>
  existeNoQueridoDiario(tender: NormalizedTender): Promise<boolean>
  prepararRepublicacao(tender: NormalizedTender): Promise<NormalizedTender | null>
  salvarLote(lote: NormalizedTender[]): Promise<ContagemDoSalvamento>
  memoria: MemoriaDeDiarios
  esperar(ms: number): Promise<void>
  agora(): number
}

export interface OpcoesDaColeta {
  associacoes?: AssociacaoSigpub[]
  termos?: string[]
  orcamento?: OrcamentoDaColeta
}

export class BloqueioDoDiarioMunicipal extends Error {
  constructor(readonly status: number | undefined) {
    super(`SIGPub recusou as requisições (HTTP ${status ?? '?'})`)
  }
}

class OrcamentoEsgotado extends Error {}

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function ehBloqueioDoSigpub(err: unknown): boolean {
  const status = statusDaResposta(err)
  return status === 403 || status === 429
}

export function memoriaDeMateriasNoRedis(redis: ClienteRedisDaMemoria, agora: () => number = Date.now): MemoriaDeDiarios {
  return memoriaDeDiariosNoRedis(redis, agora, { chave: CHAVE_DAS_MATERIAS_LIDAS, dias: DIAS_NA_MEMORIA, rotulo: 'Diário Municipal' })
}

function medicaoVazia(associacao: AssociacaoSigpub): MedicaoDaAssociacao {
  return {
    associacao: associacao.slug,
    uf: associacao.uf,
    buscas: 0,
    materiasEncontradas: 0,
    descartadasPeloTitulo: 0,
    jaLidasAntes: 0,
    materiasLidas: 0,
    falhasDeLeitura: 0,
    semMunicipio: 0,
    avisos: 0,
    novos: 0,
    atualizados: 0,
    inalterados: 0,
    duplicadosDoPncp: 0,
    duplicadosDoQueridoDiario: 0,
    buscasIncompletas: 0,
    semPublicacoesNaJanela: false,
  }
}

function adicionarSemRepetir(lista: string[], valor: string): void {
  if (!lista.includes(valor)) lista.push(valor)
}

export async function coletarDiarioMunicipal(
  dep: DependenciasDaColeta,
  janela: JanelaDoDiarioMunicipal,
  opcoes: OpcoesDaColeta = {}
): Promise<ResultadoDaColeta> {
  const associacoes = opcoes.associacoes ?? ASSOCIACOES_SIGPUB
  const termos = opcoes.termos ?? TERMOS_DE_BUSCA_SIGPUB
  const orcamento = opcoes.orcamento ?? ORCAMENTO_PADRAO
  const inicio = dep.agora()
  const dataDaColeta = new Date(inicio)
  const r: ResultadoDaColeta = {
    porAssociacao: [],
    requisicoes: 0,
    buscas: 0,
    downloads: 0,
    totalFetched: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    materiasLidas: 0,
    jaLidasAntes: 0,
    avisos: 0,
    descartadosPorPncp: 0,
    duplicadosDoPncp: 0,
    duplicadosDoQueridoDiario: 0,
    falhasDeLeitura: 0,
    falhasDeBusca: 0,
    houveFalhas: false,
    motivoDaParada: 'concluida',
    associacoesIncompletas: [],
    associacoesNaoVisitadas: [],
  }
  let falhasSeguidas = 0

  const orcamentoAcabou = (): boolean => {
    if (r.motivoDaParada !== 'concluida') return true
    if (dep.agora() - inicio >= orcamento.tempoMs) r.motivoDaParada = 'tempo'
    else if (r.requisicoes >= orcamento.requisicoes) r.motivoDaParada = 'requisicoes'
    return r.motivoDaParada !== 'concluida'
  }

  const registrarFalha = () => {
    falhasSeguidas++
    r.houveFalhas = true
    if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR && r.motivoDaParada === 'concluida') r.motivoDaParada = 'falhas'
  }

  const requisitar = async <T>(descricao: string, pedir: () => Promise<T>): Promise<T> => {
    for (let tentativa = 0; ; tentativa++) {
      if (orcamentoAcabou()) throw new OrcamentoEsgotado()
      if (r.requisicoes > 0) await dep.esperar(ESPACO_ENTRE_REQUISICOES_MS)
      r.requisicoes++
      try {
        const resposta = await pedir()
        falhasSeguidas = 0
        return resposta
      } catch (err) {
        const bloqueio = ehBloqueioDoSigpub(err)
        if (tentativa >= (bloqueio ? TENTATIVAS_APOS_BLOQUEIO : 1) || orcamentoAcabou()) {
          throw bloqueio ? new BloqueioDoDiarioMunicipal(statusDaResposta(err)) : err
        }
        const espera = bloqueio ? ESPERA_APOS_BLOQUEIO_MS * 2 ** tentativa : ESPERA_ANTES_DE_REPETIR_MS
        console.warn(`[Diário Municipal] ${descricao} falhou (${mensagemDoErro(err)}) — nova tentativa em ${Math.round(espera / 1000)}s`)
        await dep.esperar(espera)
      }
    }
  }

  const tratarErro = (err: unknown, descricao: string): void => {
    if (err instanceof OrcamentoEsgotado) return
    if (err instanceof BloqueioDoDiarioMunicipal) {
      r.motivoDaParada = 'bloqueio'
      r.houveFalhas = true
      console.error(`[Diário Municipal] ${descricao} interrompida: ${err.message}`)
      return
    }
    registrarFalha()
    console.error(`[Diário Municipal] ${descricao} falhou:`, mensagemDoErro(err))
  }

  const salvarAvisos = async (tenders: NormalizedTender[], medicao: MedicaoDaAssociacao, descricao: string): Promise<boolean> => {
    let completo = true
    const lote: NormalizedTender[] = []
    for (const tender of tenders) {
      try {
        if (await dep.existeNoPncp(tender, dataDaColeta)) {
          medicao.duplicadosDoPncp++
          r.duplicadosDoPncp++
          continue
        }
        if (await dep.existeNoQueridoDiario(tender)) {
          medicao.duplicadosDoQueridoDiario++
          r.duplicadosDoQueridoDiario++
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
        console.error(`[Diário Municipal] Erro ao conferir ${tender.fonteId}:`, mensagemDoErro(err))
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
      return completo && salvos.totalNew + salvos.totalDupes === lote.length
    } catch (err) {
      r.houveFalhas = true
      console.error(`[Diário Municipal] Erro ao salvar avisos de ${descricao}:`, mensagemDoErro(err))
      return false
    }
  }

  const lerCartao = async (associacao: AssociacaoSigpub, cartao: CartaoDeMateria, medicao: MedicaoDaAssociacao): Promise<void> => {
    const descricao = `matéria ${associacao.slug}/${cartao.codigo}`
    let html: string
    try {
      html = await requisitar(`Leitura da ${descricao}`, () => dep.baixarMateria(associacao, cartao.codigo))
      r.downloads++
    } catch (err) {
      if (!(err instanceof OrcamentoEsgotado)) {
        medicao.falhasDeLeitura++
        r.falhasDeLeitura++
      }
      tratarErro(err, `Leitura da ${descricao}`)
      return
    }

    const materia = lerMateria(html, cartao.codigo)
    if (!materia) {
      medicao.falhasDeLeitura++
      r.falhasDeLeitura++
      r.houveFalhas = true
      console.warn(`[Diário Municipal] ${descricao} sem corpo reconhecível`)
      return
    }

    medicao.materiasLidas++
    r.materiasLidas++
    const resultado = avisosDaMateria(materia, cartao, associacao, dataDaColeta)
    if (resultado.semMunicipio) {
      medicao.semMunicipio++
      await dep.memoria.marcarLido(chaveDaMateria(associacao, cartao.codigo))
      return
    }

    const avisos = resultado.tenders.length + resultado.descartadosPorPncp
    medicao.avisos += avisos
    medicao.duplicadosDoPncp += resultado.descartadosPorPncp
    r.avisos += avisos
    r.descartadosPorPncp += resultado.descartadosPorPncp

    if (await salvarAvisos(resultado.tenders, medicao, `${cartao.entidade}/${associacao.uf}`)) {
      await dep.memoria.marcarLido(chaveDaMateria(associacao, cartao.codigo))
    }
  }

  const lerPagina = async (
    associacao: AssociacaoSigpub,
    pagina: PaginaDeBusca,
    vistas: Set<string>,
    medicao: MedicaoDaAssociacao
  ): Promise<void> => {
    const novos = pagina.cartoes.filter((c) => !vistas.has(c.codigo))
    for (const cartao of novos) vistas.add(cartao.codigo)
    medicao.materiasEncontradas += novos.length

    const candidatos = novos.filter((c) => tituloDeAviso(c.titulo))
    medicao.descartadasPeloTitulo += novos.length - candidatos.length
    if (candidatos.length === 0) return

    const jaLidas = await dep.memoria.jaLidos(candidatos.map((c) => chaveDaMateria(associacao, c.codigo)))
    for (const cartao of candidatos) {
      if (jaLidas.has(chaveDaMateria(associacao, cartao.codigo))) {
        medicao.jaLidasAntes++
        r.jaLidasAntes++
        continue
      }
      if (orcamentoAcabou()) return
      await lerCartao(associacao, cartao, medicao)
      if (r.motivoDaParada !== 'concluida') return
    }
  }

  const medicoes: MedicaoDaAssociacao[] = []
  for (const associacao of associacoes) {
    if (orcamentoAcabou()) {
      adicionarSemRepetir(r.associacoesNaoVisitadas, associacao.slug)
      continue
    }

    const medicao = medicaoVazia(associacao)
    medicoes.push(medicao)
    const vistas = new Set<string>()
    let completa = true

    for (const [indiceDoTermo, termo] of termos.entries()) {
      if (orcamentoAcabou()) {
        completa = false
        break
      }
      if (medicao.semPublicacoesNaJanela) break
      for (let numero = 1; ; numero++) {
        const descricao = `Busca ${associacao.slug} "${termo}" (página ${numero})`
        let pagina: PaginaDeBusca
        try {
          pagina = await requisitar(descricao, () => dep.buscar(associacao, termo, janela, numero))
          medicao.buscas++
          r.buscas++
        } catch (err) {
          if (!(err instanceof OrcamentoEsgotado)) {
            r.falhasDeBusca++
            medicao.buscasIncompletas++
          }
          tratarErro(err, descricao)
          completa = false
          break
        }

        if (indiceDoTermo === 0 && numero === 1 && pagina.total === 0 && pagina.cartoes.length === 0) {
          medicao.semPublicacoesNaJanela = true
          console.warn(`[Diário Municipal] ${associacao.slug} sem nenhuma matéria para "${termo}" na janela — demais termos pulados`)
          break
        }
        await lerPagina(associacao, pagina, vistas, medicao)
        if (r.motivoDaParada !== 'concluida') {
          completa = false
          break
        }
        if (!pagina.temProxima || pagina.cartoes.length === 0) break
        if (numero >= MAXIMO_DE_PAGINAS_POR_BUSCA) {
          medicao.buscasIncompletas++
          console.warn(`[Diário Municipal] ${descricao}: limite de ${MAXIMO_DE_PAGINAS_POR_BUSCA} páginas atingido (${pagina.total} matérias)`)
          break
        }
      }
      if (r.motivoDaParada === 'bloqueio' || r.motivoDaParada === 'falhas') break
    }

    if (!completa) adicionarSemRepetir(r.associacoesIncompletas, associacao.slug)
  }

  if (r.falhasDeLeitura > 0 || r.falhasDeBusca > 0) r.houveFalhas = true
  r.porAssociacao = medicoes
  return r
}

export function resumoDaAssociacao(m: MedicaoDaAssociacao): string {
  return (
    `${m.associacao} (${m.uf}) — buscas: ${m.buscas}; matérias: ${m.materiasEncontradas} encontradas, ` +
    `${m.descartadasPeloTitulo} descartadas pelo título, ${m.jaLidasAntes} já lidas antes, ${m.materiasLidas} lidas, ` +
    `${m.falhasDeLeitura} com falha, ${m.semMunicipio} sem município; avisos: ${m.avisos}; novos: ${m.novos}; ` +
    `atualizados: ${m.atualizados}; inalterados: ${m.inalterados}; já no PNCP: ${m.duplicadosDoPncp}; ` +
    `já no Querido Diário: ${m.duplicadosDoQueridoDiario}${m.semPublicacoesNaJanela ? ' (sem publicações na janela)' : ''}`
  )
}

export function resumoPorUf(r: ResultadoDaColeta): string {
  return r.porAssociacao
    .map((m) => `${m.uf}: ${m.materiasLidas} lidas, ${m.avisos} avisos, ${m.novos} novos, ${m.duplicadosDoPncp} já no PNCP`)
    .join(' | ')
}

export function descricaoDaParada(r: ResultadoDaColeta): string | null {
  if (r.motivoDaParada === 'concluida') return null
  const motivos: Record<Exclude<MotivoDaParada, 'concluida'>, string> = {
    tempo: 'orçamento de tempo esgotado',
    requisicoes: 'orçamento de requisições esgotado',
    bloqueio: 'SIGPub bloqueou as requisições (403/429)',
    falhas: `${FALHAS_SEGUIDAS_PARA_PARAR} falhas seguidas no SIGPub`,
  }
  const pendentes = [...r.associacoesIncompletas, ...r.associacoesNaoVisitadas]
  return `${motivos[r.motivoDaParada]}${pendentes.length > 0 ? ` — ficaram para a próxima coleta: ${pendentes.join(', ')}` : ''}`
}
