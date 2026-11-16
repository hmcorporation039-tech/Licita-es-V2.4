// Coleta do DOM/SC: baixa os arquivos dos últimos dias no portal de dados abertos do
// CIGA, lê os avisos de licitação e salva o que ainda não está no PNCP nem no Querido
// Diário. Cada arquivo lido por inteiro vai para a memória (Redis) e não é baixado de novo.

import { DESLOCAMENTO_DE_BRASILIA_MS } from '../lib/dataDeBrasilia'
import { NormalizedTender } from '../types'
import { ArquivoDoDomSc } from './domScService'
import { PublicacaoDoDomSc, avaliarPublicacaoDoDomSc, avisosDaPublicacaoDoDomSc, lerZipDoDomSc } from './domScParser'
import { ClienteRedisDaMemoria, ContagemDoSalvamento, MemoriaDeDiarios, memoriaDeDiariosNoRedis } from './queridoDiarioColeta'

export const DIAS_DA_JANELA_DOM_SC = 4
export const MAXIMO_DE_ARQUIVOS_POR_COLETA = 16
export const CHAVE_DOS_ARQUIVOS_LIDOS = 'dom-sc:arquivos-lidos'
const DIA_MS = 86_400_000

export interface DependenciasDaColetaDomSc {
  listarArquivosDoMes(dia: string): Promise<ArquivoDoDomSc[]>
  baixarArquivo(arquivo: ArquivoDoDomSc): Promise<Uint8Array>
  existeNoPncp(tender: NormalizedTender, agora: Date): Promise<boolean>
  existeNoQueridoDiario(tender: NormalizedTender): Promise<boolean>
  prepararRepublicacao(tender: NormalizedTender): Promise<NormalizedTender | null>
  salvarLote(lote: NormalizedTender[]): Promise<ContagemDoSalvamento>
  memoria: MemoriaDeDiarios
  agora(): number
}

export interface ResultadoDaColetaDomSc {
  dias: string[]
  arquivosNaJanela: number
  jaLidosAntes: number
  arquivosLidos: number
  falhasDeArquivo: number
  pendentes: number
  publicacoes: number
  outrasCategorias: number
  outrosAtos: number
  candidatas: number
  semMunicipio: number
  textoIlegivel: number
  avisos: number
  descartadosPorPncpNoTexto: number
  duplicadosDoPncp: number
  duplicadosDoQueridoDiario: number
  totalFetched: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  houveFalhas: boolean
}

export function memoriaDoDomScNoRedis(redis: ClienteRedisDaMemoria, agora: () => number = Date.now): MemoriaDeDiarios {
  return memoriaDeDiariosNoRedis(redis, agora, { chave: CHAVE_DOS_ARQUIVOS_LIDOS, dias: 40, rotulo: 'DOM/SC' })
}

/** Dias da janela (AAAA-MM-DD, horário de Brasília), do mais antigo ao de hoje. */
export function diasDaJanelaDomSc(agora: Date, dias: number = DIAS_DA_JANELA_DOM_SC): string[] {
  const hoje = agora.getTime() - DESLOCAMENTO_DE_BRASILIA_MS
  return Array.from({ length: dias }, (_, i) => new Date(hoje - (dias - 1 - i) * DIA_MS).toISOString().slice(0, 10))
}

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function coletarDomSc(
  dep: DependenciasDaColetaDomSc,
  opcoes: { dias?: number; maximoDeArquivos?: number } = {}
): Promise<ResultadoDaColetaDomSc> {
  const agora = new Date(dep.agora())
  const dias = diasDaJanelaDomSc(agora, opcoes.dias)
  const r: ResultadoDaColetaDomSc = {
    dias,
    arquivosNaJanela: 0,
    jaLidosAntes: 0,
    arquivosLidos: 0,
    falhasDeArquivo: 0,
    pendentes: 0,
    publicacoes: 0,
    outrasCategorias: 0,
    outrosAtos: 0,
    candidatas: 0,
    semMunicipio: 0,
    textoIlegivel: 0,
    avisos: 0,
    descartadosPorPncpNoTexto: 0,
    duplicadosDoPncp: 0,
    duplicadosDoQueridoDiario: 0,
    totalFetched: 0,
    totalNew: 0,
    totalDupes: 0,
    totalUpdated: 0,
    houveFalhas: false,
  }

  // Um conjunto de dados por mês; na virada do mês a janela pega os dois.
  const arquivos: ArquivoDoDomSc[] = []
  for (const mes of [...new Set(dias.map((d) => d.slice(0, 7)))]) {
    try {
      const doMes = await dep.listarArquivosDoMes(`${mes}-01`)
      arquivos.push(...doMes.filter((a) => dias.includes(a.dia)))
    } catch (err) {
      r.houveFalhas = true
      console.error(`[DOM/SC] Lista de arquivos de ${mes} falhou:`, mensagem(err))
    }
  }
  r.arquivosNaJanela = arquivos.length

  const jaLidos = await dep.memoria.jaLidos(arquivos.map((a) => a.id))
  const pendentes = arquivos.filter((a) => !jaLidos.has(a.id)).sort((a, b) => a.nome.localeCompare(b.nome))
  r.jaLidosAntes = arquivos.length - pendentes.length
  const maximo = opcoes.maximoDeArquivos ?? MAXIMO_DE_ARQUIVOS_POR_COLETA
  r.pendentes = Math.max(0, pendentes.length - maximo)

  for (const arquivo of pendentes.slice(0, maximo)) {
    let publicacoes: PublicacaoDoDomSc[]
    try {
      publicacoes = lerZipDoDomSc(await dep.baixarArquivo(arquivo))
    } catch (err) {
      r.falhasDeArquivo++
      r.houveFalhas = true
      console.error(`[DOM/SC] Arquivo "${arquivo.nome}" falhou:`, mensagem(err))
      continue
    }
    if (await lerArquivo(publicacoes, arquivo, agora, dep, r)) await dep.memoria.marcarLido(arquivo.id)
    r.arquivosLidos++
  }
  return r
}

async function lerArquivo(
  publicacoes: PublicacaoDoDomSc[],
  arquivo: ArquivoDoDomSc,
  agora: Date,
  dep: DependenciasDaColetaDomSc,
  r: ResultadoDaColetaDomSc
): Promise<boolean> {
  r.publicacoes += publicacoes.length
  const lote: NormalizedTender[] = []
  let completo = true
  for (const p of publicacoes) {
    const avaliacao = avaliarPublicacaoDoDomSc(p)
    if (avaliacao === 'outraCategoria') {
      r.outrasCategorias++
      continue
    }
    if (avaliacao === 'outroAto') {
      r.outrosAtos++
      continue
    }
    r.candidatas++
    const resultado = avisosDaPublicacaoDoDomSc(p, agora)
    if (resultado.semMunicipio) r.semMunicipio++
    if (resultado.textoIlegivel) r.textoIlegivel++
    r.avisos += resultado.avisos
    r.descartadosPorPncpNoTexto += resultado.descartadosPorPncp
    for (const tender of resultado.tenders) {
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
        console.error(`[DOM/SC] Erro ao conferir ${tender.fonteId}:`, mensagem(err))
      }
    }
  }
  if (lote.length === 0) return completo

  r.totalFetched += lote.length
  try {
    const salvos = await dep.salvarLote(lote)
    r.totalNew += salvos.totalNew
    r.totalDupes += salvos.totalDupes
    r.totalUpdated += salvos.totalUpdated
    return completo && salvos.totalNew + salvos.totalDupes + (salvos.totalDescartadas ?? 0) === lote.length
  } catch (err) {
    r.houveFalhas = true
    console.error(`[DOM/SC] Erro ao salvar os avisos de "${arquivo.nome}":`, mensagem(err))
    return false
  }
}

export function statusDaColetaDomSc(r: ResultadoDaColetaDomSc): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (r.houveFalhas && r.arquivosLidos === 0 && r.jaLidosAntes === 0) return 'FAILED'
  return r.houveFalhas ? 'PARTIAL' : 'SUCCESS'
}

export function resumoDaColetaDomSc(r: ResultadoDaColetaDomSc): string {
  return (
    `dias ${r.dias[0]} a ${r.dias[r.dias.length - 1]}; arquivos: ${r.arquivosNaJanela} (${r.jaLidosAntes} já lidos, ${r.arquivosLidos} lidos agora, ` +
    `${r.falhasDeArquivo} com falha, ${r.pendentes} para a próxima); publicações: ${r.publicacoes} (${r.outrasCategorias} de outras categorias, ` +
    `${r.outrosAtos} outros atos, ${r.candidatas} candidatas, ${r.semMunicipio} sem município, ${r.textoIlegivel} com texto ilegível); ` +
    `avisos: ${r.avisos}; já no PNCP: ${r.duplicadosDoPncp + r.descartadosPorPncpNoTexto}, já no Querido Diário: ${r.duplicadosDoQueridoDiario}; ` +
    `novas: ${r.totalNew}, atualizadas: ${r.totalUpdated}, inalteradas: ${r.totalDupes - r.totalUpdated}`
  )
}
