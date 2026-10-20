import { Prisma, SituacaoEnum } from '@prisma/client'
import { isAxiosError } from 'axios'
import { LimiteDeRequisicoesExcedido, pncpClient } from '../lib/httpClient'
import { assertIdentificadorCompraPncp, identificadorCompraPncpValido } from '../lib/pncpIdentificador'
import {
  ItemDaCompraPncp,
  ResultadoDoItemPncp,
  VencedorDoItem,
  avaliarFinalizacao,
  escolherVencedor,
  itemCancelado,
  situacaoDoItem,
} from '../lib/resultadoDoPncp'
import { prisma } from './tenderService'

export const BASE_DA_API_DE_COMPRAS_DO_PNCP = 'https://pncp.gov.br/api/pncp'
export const ITENS_POR_PAGINA = 50
export const TETO_PADRAO_DE_REQUISICOES = 600
export const JANELA_DO_RESULTADO_DIAS = 120
export const INTERVALO_ENTRE_CONFERENCIAS_MS = 12 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000
const SITUACOES_QUE_PASSAM_A_HOMOLOGADA: SituacaoEnum[] = ['ABERTA', 'ENCERRADA', 'SUSPENSA']

export function tetoDeRequisicoes(valor: string | undefined = process.env.RESULTADO_MAX_REQUISICOES): number {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : TETO_PADRAO_DE_REQUISICOES
}

export interface CompraDoPncp {
  cnpj: string
  ano: number | string
  sequencial: number | string
}

export type BuscarListaNoPncp = <T>(caminho: string, parametros?: Record<string, number>) => Promise<T[]>

export const buscarListaNoPncp: BuscarListaNoPncp = async <T>(caminho: string, parametros?: Record<string, number>) => {
  try {
    const resposta = await pncpClient.get<T[]>(caminho, { baseURL: BASE_DA_API_DE_COMPRAS_DO_PNCP, params: parametros })
    return Array.isArray(resposta.data) ? resposta.data : []
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return []
    throw err
  }
}

export class TetoDeRequisicoesAtingido extends Error {
  constructor(teto: number) {
    super(`Teto de ${teto} requisições ao PNCP atingido nesta execução`)
    this.name = 'TetoDeRequisicoesAtingido'
  }
}

export class OrcamentoDeRequisicoes {
  usadas = 0

  constructor(readonly teto: number) {}

  get esgotado(): boolean {
    return this.usadas >= this.teto
  }

  async gastar<T>(requisicao: () => Promise<T>): Promise<T> {
    if (this.esgotado) throw new TetoDeRequisicoesAtingido(this.teto)
    this.usadas++
    return requisicao()
  }
}

function caminhoDaCompra(compra: CompraDoPncp): string {
  assertIdentificadorCompraPncp(compra.cnpj, compra.ano, compra.sequencial)
  return `/v1/orgaos/${compra.cnpj}/compras/${compra.ano}/${compra.sequencial}`
}

export interface ItensLidos {
  itens: ItemDaCompraPncp[]
  completo: boolean
}

export async function lerItensDaCompra(
  compra: CompraDoPncp,
  orcamento: OrcamentoDeRequisicoes,
  buscar: BuscarListaNoPncp = buscarListaNoPncp
): Promise<ItensLidos> {
  const caminho = `${caminhoDaCompra(compra)}/itens`
  const porNumero = new Map<number, ItemDaCompraPncp>()
  for (let pagina = 1; ; pagina++) {
    if (orcamento.esgotado) return { itens: [...porNumero.values()], completo: false }
    const lote = await orcamento.gastar(() => buscar<ItemDaCompraPncp>(caminho, { pagina, tamanhoPagina: ITENS_POR_PAGINA }))
    let novos = 0
    for (const item of lote) {
      if (!item || !Number.isInteger(item.numeroItem) || porNumero.has(item.numeroItem)) continue
      porNumero.set(item.numeroItem, item)
      novos++
    }
    if (lote.length < ITENS_POR_PAGINA || novos === 0) return { itens: [...porNumero.values()], completo: true }
  }
}

export async function buscarVencedorDoItem(
  compra: CompraDoPncp,
  numeroItem: number,
  buscar: BuscarListaNoPncp = buscarListaNoPncp
): Promise<VencedorDoItem | null> {
  if (!Number.isInteger(numeroItem) || numeroItem <= 0) throw new Error('Número do item do PNCP inválido')
  const resultados = await buscar<ResultadoDoItemPncp>(`${caminhoDaCompra(compra)}/itens/${numeroItem}/resultados`)
  return escolherVencedor(resultados)
}

const SEM_VENCEDOR = {
  vencedorNi: null,
  vencedorNome: null,
  vencedorPorte: null,
  valorUnitarioHomologado: null,
  quantidadeHomologada: null,
  valorTotalHomologado: null,
  dataDoResultado: null,
  fornecedoresRegistrados: null,
} satisfies Prisma.TenderItemUpdateManyMutationInput

function dadosDoVencedor(vencedor: VencedorDoItem): Prisma.TenderItemUpdateManyMutationInput {
  return {
    vencedorNi: vencedor.ni,
    vencedorNome: vencedor.nome,
    vencedorPorte: vencedor.porte,
    valorUnitarioHomologado: vencedor.valorUnitarioHomologado,
    quantidadeHomologada: vencedor.quantidadeHomologada,
    valorTotalHomologado: vencedor.valorTotalHomologado,
    dataDoResultado: vencedor.dataDoResultado,
    fornecedoresRegistrados: vencedor.fornecedoresRegistrados,
  }
}

interface ItemGravado {
  situacaoDoResultado: string | null
  vencedorNi: string | null
  vencedorNome: string | null
  valorTotalHomologado: number | null
}

function temVencedor(item: ItemGravado): boolean {
  return item.vencedorNi !== null || item.vencedorNome !== null
}

export interface LicitacaoParaConferir {
  id: string
  situacao: SituacaoEnum
  valorHomologado: Prisma.Decimal | number | string | null
  compra: CompraDoPncp
}

export interface ConferenciaDaLicitacao {
  completa: boolean
  vencedores: number
  finalizada: boolean
}

export async function conferirResultadoDaLicitacao(
  licitacao: LicitacaoParaConferir,
  orcamento: OrcamentoDeRequisicoes,
  buscar: BuscarListaNoPncp = buscarListaNoPncp,
  agora: Date = new Date()
): Promise<ConferenciaDaLicitacao> {
  const { itens, completo } = await lerItensDaCompra(licitacao.compra, orcamento, buscar)

  const linhas = await prisma.tenderItem.findMany({
    where: { tenderId: licitacao.id, numeroItem: { in: itens.map((i) => i.numeroItem) } },
    select: { numeroItem: true, situacaoDoResultado: true, vencedorNi: true, vencedorNome: true, valorTotalHomologado: true },
  })
  const gravados = new Map<number, ItemGravado>()
  for (const linha of linhas) {
    if (linha.numeroItem === null || gravados.has(linha.numeroItem)) continue
    gravados.set(linha.numeroItem, {
      situacaoDoResultado: linha.situacaoDoResultado,
      vencedorNi: linha.vencedorNi,
      vencedorNome: linha.vencedorNome,
      valorTotalHomologado: linha.valorTotalHomologado === null ? null : Number(linha.valorTotalHomologado),
    })
  }

  for (const item of itens) {
    const gravado = gravados.get(item.numeroItem)
    if (!gravado) continue
    const situacao = situacaoDoItem(item)
    const tirarVencedor = itemCancelado(situacao) && temVencedor(gravado)
    if (situacao === gravado.situacaoDoResultado && !tirarVencedor) continue
    await prisma.tenderItem.updateMany({
      where: { tenderId: licitacao.id, numeroItem: item.numeroItem },
      data: { situacaoDoResultado: situacao, ...(tirarVencedor ? SEM_VENCEDOR : {}) },
    })
    gravado.situacaoDoResultado = situacao
    if (tirarVencedor) Object.assign(gravado, { vencedorNi: null, vencedorNome: null, valorTotalHomologado: null })
  }

  if (!completo) return { completa: false, vencedores: 0, finalizada: false }

  let vencedores = 0
  for (const item of itens) {
    const gravado = gravados.get(item.numeroItem)
    if (!gravado || item.temResultado !== true || temVencedor(gravado) || itemCancelado(situacaoDoItem(item))) continue
    if (orcamento.esgotado) return { completa: false, vencedores, finalizada: false }
    const vencedor = await orcamento.gastar(() => buscarVencedorDoItem(licitacao.compra, item.numeroItem, buscar))
    if (!vencedor) continue
    await prisma.tenderItem.updateMany({
      where: { tenderId: licitacao.id, numeroItem: item.numeroItem },
      data: dadosDoVencedor(vencedor),
    })
    Object.assign(gravado, { vencedorNi: vencedor.ni, vencedorNome: vencedor.nome ?? '', valorTotalHomologado: vencedor.valorTotalHomologado })
    vencedores++
  }

  const finalizacao = avaliarFinalizacao(
    itens.map((item) => {
      const gravado = gravados.get(item.numeroItem)
      return {
        situacao: situacaoDoItem(item),
        idDaSituacao: item.situacaoCompraItem,
        noBanco: gravado !== undefined,
        temVencedor: gravado ? temVencedor(gravado) : false,
        valorTotalHomologado: gravado?.valorTotalHomologado ?? null,
      }
    })
  )

  const homologada = finalizacao.final && finalizacao.homologados > 0
  await prisma.tender.update({
    where: { id: licitacao.id },
    data: {
      resultadoConferidoEm: agora,
      ...(finalizacao.final ? { resultadoFinal: true } : {}),
      ...(homologada && SITUACOES_QUE_PASSAM_A_HOMOLOGADA.includes(licitacao.situacao) ? { situacao: 'HOMOLOGADA' as const } : {}),
    },
  })
  if (homologada && licitacao.valorHomologado === null && finalizacao.somaHomologada !== null) {
    await prisma.tender.updateMany({
      where: { id: licitacao.id, valorHomologado: null },
      data: { valorHomologado: finalizacao.somaHomologada },
    })
  }

  return { completa: true, vencedores, finalizada: finalizacao.final }
}

interface LinhaCandidata {
  id: string
  situacao: SituacaoEnum
  valor_homologado: Prisma.Decimal | null
  cnpj: string | null
  ano: string | null
  sequencial: string | null
}

export async function licitacoesParaConferir(agora: Date, limite: number): Promise<LinhaCandidata[]> {
  const inicioDaJanela = new Date(agora.getTime() - JANELA_DO_RESULTADO_DIAS * DIA_MS)
  const conferidaAntesDe = new Date(agora.getTime() - INTERVALO_ENTRE_CONFERENCIAS_MS)
  return prisma.$queryRaw<LinhaCandidata[]>`
    SELECT t.id,
           t.situacao::text AS situacao,
           t.valor_homologado,
           COALESCE(t.orgao_cnpj, t.raw_json->'orgaoEntidade'->>'cnpj') AS cnpj,
           t.raw_json->>'anoCompra' AS ano,
           t.raw_json->>'sequencialCompra' AS sequencial
    FROM tenders t
    WHERE t.fonte = 'PNCP'
      AND t.resultado_final = false
      AND t.encerramento_at >= ${inicioDaJanela}
      AND t.encerramento_at <= ${agora}
      AND (t.resultado_conferido_em IS NULL OR t.resultado_conferido_em < ${conferidaAntesDe})
      AND (
        EXISTS (SELECT 1 FROM tender_matches m WHERE m.tender_id = t.id)
        OR EXISTS (SELECT 1 FROM tender_participation_plans p WHERE p.tender_id = t.id)
      )
    ORDER BY t.resultado_conferido_em ASC NULLS FIRST, t.encerramento_at ASC, t.id ASC
    LIMIT ${limite}
  `
}

export interface ResumoDosResultados {
  pulada: boolean
  conferidas: number
  vencedores: number
  finalizadas: number
  falhas: string[]
  requisicoes: number
  parouNoTeto: boolean
  parouPorBloqueio: boolean
}

export interface OpcoesDosResultados {
  agora?: Date
  teto?: number
  buscar?: BuscarListaNoPncp
}

function bloqueioDoPncp(err: unknown): boolean {
  return err instanceof LimiteDeRequisicoesExcedido || (isAxiosError(err) && err.response?.status === 429)
}

let conferenciaEmAndamento = false

export async function conferirResultadosDasLicitacoes(opcoes: OpcoesDosResultados = {}): Promise<ResumoDosResultados> {
  const resumo: ResumoDosResultados = {
    pulada: false,
    conferidas: 0,
    vencedores: 0,
    finalizadas: 0,
    falhas: [],
    requisicoes: 0,
    parouNoTeto: false,
    parouPorBloqueio: false,
  }
  if (conferenciaEmAndamento) return { ...resumo, pulada: true }
  conferenciaEmAndamento = true

  const agora = opcoes.agora ?? new Date()
  const orcamento = new OrcamentoDeRequisicoes(opcoes.teto ?? tetoDeRequisicoes())
  const buscar = opcoes.buscar ?? buscarListaNoPncp

  try {
    const candidatas = await licitacoesParaConferir(agora, orcamento.teto)
    for (const candidata of candidatas) {
      if (orcamento.esgotado) {
        resumo.parouNoTeto = true
        break
      }
      const marcarConferida = () =>
        prisma.tender.update({ where: { id: candidata.id }, data: { resultadoConferidoEm: agora } }).catch(() => undefined)

      if (!candidata.cnpj || !candidata.ano || !candidata.sequencial || !identificadorCompraPncpValido(candidata.cnpj, candidata.ano, candidata.sequencial)) {
        await marcarConferida()
        continue
      }

      try {
        const conferencia = await conferirResultadoDaLicitacao(
          {
            id: candidata.id,
            situacao: candidata.situacao,
            valorHomologado: candidata.valor_homologado,
            compra: { cnpj: candidata.cnpj, ano: candidata.ano, sequencial: candidata.sequencial },
          },
          orcamento,
          buscar,
          agora
        )
        resumo.vencedores += conferencia.vencedores
        if (!conferencia.completa) {
          resumo.parouNoTeto = true
          break
        }
        resumo.conferidas++
        if (conferencia.finalizada) resumo.finalizadas++
      } catch (err) {
        if (err instanceof TetoDeRequisicoesAtingido) {
          resumo.parouNoTeto = true
          break
        }
        const motivo = err instanceof Error ? err.message : String(err)
        resumo.falhas.push(`${candidata.id}: ${motivo}`)
        console.error(`[Resultado PNCP] Falha ao conferir a licitação ${candidata.id}: ${motivo}`)
        if (bloqueioDoPncp(err)) {
          resumo.parouPorBloqueio = true
          break
        }
        await marcarConferida()
      }
    }
    resumo.requisicoes = orcamento.usadas
    return resumo
  } finally {
    conferenciaEmAndamento = false
  }
}
