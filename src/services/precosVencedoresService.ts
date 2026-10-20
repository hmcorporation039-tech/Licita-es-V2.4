import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import {
  CasoVencedor,
  MAXIMO_POR_CODIGO,
  MAXIMO_POR_DESCRICAO,
  PrecosVencedoresDoItem,
  SIMILARIDADE_MINIMA,
  descricaoParaComparar,
  escolherCriterio,
  inicioDoHistorico,
  precisaBuscarPorDescricao,
  precosVencedoresDoItem,
} from '../lib/precosVencedores'

export interface ItemParaComparar {
  id: string
  descricao: string
  descricaoNorm: string | null
  unidade: string | null
  catmatCode: string | null
  catserCode: string | null
}

export interface LicitacaoEstudada {
  id: string
  duplicataDe: string | null
}

interface LinhaDoCaso {
  chave: string
  orgao: string | null
  municipio: string | null
  uf: string | null
  data_do_resultado: Date | null
  descricao: string
  unidade_medida: string | null
  quantidade: Prisma.Decimal | null
  quantidade_homologada: Prisma.Decimal | null
  valor_unitario_homologado: Prisma.Decimal
  valor_unitario: Prisma.Decimal | null
  valor_total: Prisma.Decimal | null
  vencedor_ni: string | null
  vencedor_nome: string | null
  vencedor_porte: string | null
}

const COLUNAS = Prisma.sql`
  t.orgao, t.municipio, t.uf, ti.data_do_resultado, ti.descricao, ti.unidade_medida, ti.quantidade, ti.quantidade_homologada,
  ti.valor_unitario_homologado, ti.valor_unitario, ti.valor_total, ti.vencedor_ni, ti.vencedor_nome, ti.vencedor_porte`

function filtroComum(licitacao: LicitacaoEstudada, desde: string): Prisma.Sql {
  return Prisma.sql`
    ti.valor_unitario_homologado IS NOT NULL
    AND ti.vencedor_ni IS NOT NULL
    AND ti.valor_unitario_homologado > 0
    AND ti.data_do_resultado >= ${desde}::date
    AND ti.tender_id <> ${licitacao.id}
    AND ti.tender_id <> ${licitacao.duplicataDe ?? ''}
    AND (t.duplicata_de IS NULL OR t.duplicata_de <> ${licitacao.id})`
}

function numero(valor: Prisma.Decimal | null): number | null {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function positivo(valor: Prisma.Decimal | null): number | null {
  const n = numero(valor)
  return n !== null && n > 0 ? n : null
}

function paraCaso(linha: LinhaDoCaso): CasoVencedor {
  const unitarioEstimado = positivo(linha.valor_unitario)
  const totalEstimado = positivo(linha.valor_total)
  const quantidade = positivo(linha.quantidade)
  return {
    orgao: linha.orgao,
    municipio: linha.municipio,
    uf: linha.uf,
    dataDoResultado: linha.data_do_resultado ? linha.data_do_resultado.toISOString().slice(0, 10) : null,
    descricao: linha.descricao,
    unidade: linha.unidade_medida,
    quantidade: positivo(linha.quantidade_homologada) ?? quantidade,
    precoUnitario: numero(linha.valor_unitario_homologado) ?? 0,
    precoEstimado: unitarioEstimado ?? (totalEstimado !== null && quantidade !== null ? totalEstimado / quantidade : null),
    vencedorNi: linha.vencedor_ni,
    vencedorNome: linha.vencedor_nome,
    vencedorPorte: linha.vencedor_porte,
  }
}

function agrupar(linhas: LinhaDoCaso[]): Map<string, CasoVencedor[]> {
  const grupos = new Map<string, CasoVencedor[]>()
  for (const linha of linhas) {
    const lista = grupos.get(linha.chave)
    const caso = paraCaso(linha)
    if (lista) lista.push(caso)
    else grupos.set(linha.chave, [caso])
  }
  return grupos
}

function chaveDoCodigo(item: Pick<ItemParaComparar, 'catmatCode' | 'catserCode'>): string | null {
  if (item.catmatCode) return `M:${item.catmatCode}`
  if (item.catserCode) return `S:${item.catserCode}`
  return null
}

type Consulta = Prisma.TransactionClient

async function buscarPorCodigo(db: Consulta, licitacao: LicitacaoEstudada, itens: ItemParaComparar[], desde: string): Promise<Map<string, CasoVencedor[]>> {
  const catmats = [...new Set(itens.map((i) => i.catmatCode).filter((c): c is string => !!c))]
  const catsers = [...new Set(itens.filter((i) => !i.catmatCode).map((i) => i.catserCode).filter((c): c is string => !!c))]
  if (catmats.length === 0 && catsers.length === 0) return new Map()
  const filtro = filtroComum(licitacao, desde)
  const linhas = await db.$queryRaw<LinhaDoCaso[]>`
    SELECT * FROM (
      SELECT 'M:' || ti.catmat_code AS chave, ${COLUNAS},
             ROW_NUMBER() OVER (PARTITION BY ti.catmat_code ORDER BY ti.data_do_resultado DESC, ti.id) AS ordem
      FROM tender_items ti JOIN tenders t ON t.id = ti.tender_id
      WHERE ${filtro} AND ti.catmat_code = ANY(${catmats}::text[])
      UNION ALL
      SELECT 'S:' || ti.catser_code AS chave, ${COLUNAS},
             ROW_NUMBER() OVER (PARTITION BY ti.catser_code ORDER BY ti.data_do_resultado DESC, ti.id) AS ordem
      FROM tender_items ti JOIN tenders t ON t.id = ti.tender_id
      WHERE ${filtro} AND ti.catser_code = ANY(${catsers}::text[])
    ) casos
    WHERE casos.ordem <= ${MAXIMO_POR_CODIGO}`
  return agrupar(linhas)
}

async function buscarPorDescricao(db: Consulta, licitacao: LicitacaoEstudada, itens: ItemParaComparar[], desde: string): Promise<Map<string, CasoVencedor[]>> {
  const pedidos = itens.map((i) => ({ chave: i.id, descricao: descricaoParaComparar(i) })).filter((p): p is { chave: string; descricao: string } => p.descricao !== null)
  if (pedidos.length === 0) return new Map()
  const chaves = pedidos.map((p) => p.chave)
  const descricoes = pedidos.map((p) => p.descricao)
  const filtro = filtroComum(licitacao, desde)
  const linhas = await db.$queryRaw<LinhaDoCaso[]>`
      SELECT pedido.chave, casos.*
      FROM unnest(${chaves}::text[], ${descricoes}::text[]) AS pedido(chave, descricao)
      CROSS JOIN LATERAL (
        SELECT ${COLUNAS}, similarity(ti.descricao_norm, pedido.descricao) AS semelhanca
        FROM tender_items ti JOIN tenders t ON t.id = ti.tender_id
        WHERE ${filtro}
          AND ti.descricao_norm % pedido.descricao
        ORDER BY semelhanca DESC, ti.data_do_resultado DESC, ti.id
        LIMIT ${MAXIMO_POR_DESCRICAO}
      ) casos`
  return agrupar(linhas)
}

export async function precosVencedoresDaLicitacao(
  licitacao: LicitacaoEstudada,
  itens: ItemParaComparar[],
  opcoes: { agora?: Date } = {}
): Promise<PrecosVencedoresDoItem[]> {
  if (itens.length === 0) return []
  const desde = inicioDoHistorico(opcoes.agora ?? new Date())
  const casosDoCodigo = (porCodigo: Map<string, CasoVencedor[]>, item: ItemParaComparar) => {
    const chave = chaveDoCodigo(item)
    return chave ? (porCodigo.get(chave) ?? []) : []
  }
  const { porCodigo, porDescricao, semCasosSuficientes } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('plan_cache_mode', 'force_custom_plan', true), set_config('pg_trgm.similarity_threshold', ${String(SIMILARIDADE_MINIMA)}, true)`
    const doCodigo = await buscarPorCodigo(tx, licitacao, itens, desde)
    const faltando = itens.filter((i) => precisaBuscarPorDescricao(chaveDoCodigo(i) !== null, casosDoCodigo(doCodigo, i).length))
    const daDescricao = faltando.length > 0 ? await buscarPorDescricao(tx, licitacao, faltando, desde) : new Map<string, CasoVencedor[]>()
    return { porCodigo: doCodigo, porDescricao: daDescricao, semCasosSuficientes: faltando }
  })
  const consultados = new Set(semCasosSuficientes.map((i) => i.id))

  return itens.map((item) => {
    const escolha = escolherCriterio({
      temCodigo: chaveDoCodigo(item) !== null,
      porCodigo: casosDoCodigo(porCodigo, item),
      porDescricao: consultados.has(item.id) ? (porDescricao.get(item.id) ?? []) : null,
    })
    return precosVencedoresDoItem(item.id, item.unidade, escolha)
  })
}
