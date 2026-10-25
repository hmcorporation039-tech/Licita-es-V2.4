// ============================================================
// services/baseDePrecos.ts — Base de preços privada da empresa (Agente de
// Orçamento). CRUD, importar/exportar planilha e a normalização da descrição
// usada depois para casar com os itens do edital (ver estudoDeCustos). Isola
// tudo por companyId. Quem expõe por HTTP é routes/baseDePrecos.ts.
// ============================================================

import { Prisma, TipoDeCusto, FonteDePreco } from '@prisma/client'
import { prisma } from './tenderService'
import { ColunaDaPlanilha, ValorDaCelula, gerarPlanilhaXlsx } from '../lib/planilhaXlsx'
import { extrairTextoDeOffice, extrairGradeDeXlsx } from './leitorDeOffice'
import { unzipSync } from 'fflate'

export const PRECO_DESATUALIZADO_DIAS = 90

export const TIPOS_DE_CUSTO = ['MATERIAL', 'MAO_DE_OBRA', 'SERVICO'] as const satisfies readonly TipoDeCusto[]
export const FONTES_DE_PRECO = ['PROPRIA', 'REFERENCIA'] as const satisfies readonly FonteDePreco[]

const ROTULO_DO_TIPO: Record<TipoDeCusto, string> = {
  MATERIAL: 'Material',
  MAO_DE_OBRA: 'Mão de obra',
  SERVICO: 'Serviço',
}
const ROTULO_DA_FONTE: Record<FonteDePreco, string> = {
  PROPRIA: 'Própria',
  REFERENCIA: 'Referência',
}

export function normalizarDescricao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface DadosDoPreco {
  descricao: string
  unidade: string | null
  tipo: TipoDeCusto
  custoUnitario: number
  fonte: FonteDePreco
  observacao: string | null
  dataDoPreco: Date
}

export interface PrecoNaTela {
  id: string
  descricao: string
  unidade: string | null
  tipo: TipoDeCusto
  custoUnitario: string
  fonte: FonteDePreco
  observacao: string | null
  dataDoPreco: string
  desatualizado: boolean
  atualizadoEm: string
}

function estaDesatualizado(dataDoPreco: Date, agora = new Date()): boolean {
  return agora.getTime() - dataDoPreco.getTime() > PRECO_DESATUALIZADO_DIAS * 86_400_000
}

type PrecoDoBanco = {
  id: string
  descricao: string
  unidade: string | null
  tipo: TipoDeCusto
  custoUnitario: Prisma.Decimal
  fonte: FonteDePreco
  observacao: string | null
  dataDoPreco: Date
  updatedAt: Date
}

function paraTela(p: PrecoDoBanco): PrecoNaTela {
  return {
    id: p.id,
    descricao: p.descricao,
    unidade: p.unidade,
    tipo: p.tipo,
    custoUnitario: p.custoUnitario.toFixed(2),
    fonte: p.fonte,
    observacao: p.observacao,
    dataDoPreco: p.dataDoPreco.toISOString(),
    desatualizado: estaDesatualizado(p.dataDoPreco),
    atualizadoEm: p.updatedAt.toISOString(),
  }
}

const SELECAO = {
  id: true,
  descricao: true,
  unidade: true,
  tipo: true,
  custoUnitario: true,
  fonte: true,
  observacao: true,
  dataDoPreco: true,
  updatedAt: true,
} satisfies Prisma.PrecoBaseSelect

export async function listarPrecos(companyId: string, busca?: string): Promise<PrecoNaTela[]> {
  // Busca por palavras: todas precisam aparecer na descrição (em qualquer
  // ordem), para "cimento cp" achar "Cimento CP-II".
  const palavras = busca ? normalizarDescricao(busca).split(' ').filter(Boolean) : []
  const precos = await prisma.precoBase.findMany({
    where: { companyId, ...(palavras.length ? { AND: palavras.map((p) => ({ descricaoNorm: { contains: p } })) } : {}) },
    orderBy: { descricao: 'asc' },
    select: SELECAO,
  })
  return precos.map(paraTela)
}

export async function criarPreco(companyId: string, userId: string, dados: DadosDoPreco): Promise<PrecoNaTela> {
  const criado = await prisma.precoBase.create({
    data: {
      companyId,
      userId,
      descricao: dados.descricao,
      descricaoNorm: normalizarDescricao(dados.descricao),
      unidade: dados.unidade,
      tipo: dados.tipo,
      custoUnitario: new Prisma.Decimal(dados.custoUnitario),
      fonte: dados.fonte,
      observacao: dados.observacao,
      dataDoPreco: dados.dataDoPreco,
    },
    select: SELECAO,
  })
  return paraTela(criado)
}

export async function atualizarPreco(companyId: string, id: string, dados: DadosDoPreco): Promise<PrecoNaTela | null> {
  const { count } = await prisma.precoBase.updateMany({
    where: { id, companyId },
    data: {
      descricao: dados.descricao,
      descricaoNorm: normalizarDescricao(dados.descricao),
      unidade: dados.unidade,
      tipo: dados.tipo,
      custoUnitario: new Prisma.Decimal(dados.custoUnitario),
      fonte: dados.fonte,
      observacao: dados.observacao,
      dataDoPreco: dados.dataDoPreco,
    },
  })
  if (count === 0) return null
  const atualizado = await prisma.precoBase.findFirst({ where: { id, companyId }, select: SELECAO })
  return atualizado ? paraTela(atualizado) : null
}

export async function removerPreco(companyId: string, id: string): Promise<void> {
  await prisma.precoBase.deleteMany({ where: { id, companyId } })
}

// ---- Exportar ----

const COLUNAS: ColunaDaPlanilha[] = [
  { titulo: 'Descrição', largura: 48 },
  { titulo: 'Unidade', largura: 12 },
  { titulo: 'Tipo', largura: 16 },
  { titulo: 'Custo unitário', largura: 16, tipo: 'moeda' },
  { titulo: 'Fonte', largura: 14 },
  { titulo: 'Data do preço', largura: 16 },
  { titulo: 'Observação', largura: 40 },
]

export async function exportarPlanilha(companyId: string): Promise<Uint8Array> {
  const precos = await prisma.precoBase.findMany({ where: { companyId }, orderBy: { descricao: 'asc' }, select: SELECAO })
  const linhas: ValorDaCelula[][] = precos.map((p) => [
    p.descricao,
    p.unidade ?? '',
    ROTULO_DO_TIPO[p.tipo],
    Number(p.custoUnitario),
    ROTULO_DA_FONTE[p.fonte],
    p.dataDoPreco,
    p.observacao ?? '',
  ])
  return gerarPlanilhaXlsx({ nomeDaAba: 'Base de preços', colunas: COLUNAS, linhas })
}

// ---- Importar ----

export interface ResultadoDaImportacao {
  importados: number
  ignorados: number
}

function parseValorBr(bruto: string): number | null {
  const limpo = bruto.replace(/[^\d.,-]/g, '').trim()
  if (!limpo) return null
  // "1.850,50" (BR) vs "1850.50" (ponto decimal): se tem vírgula, ela é o decimal.
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function tipoDoRotulo(bruto: string): TipoDeCusto {
  const n = normalizarDescricao(bruto)
  if (n.startsWith('mao') || n.includes('obra')) return 'MAO_DE_OBRA'
  if (n.startsWith('serv')) return 'SERVICO'
  return 'MATERIAL'
}

function fonteDoRotulo(bruto: string): FonteDePreco {
  const n = normalizarDescricao(bruto)
  if (n.startsWith('ref') || n.includes('sinapi')) return 'REFERENCIA'
  return 'PROPRIA'
}

function acharColuna(cabecalho: string[], ...termos: string[]): number {
  const norm = cabecalho.map((c) => normalizarDescricao(c))
  for (const t of termos) {
    const i = norm.findIndex((c) => c.includes(t))
    if (i >= 0) return i
  }
  return -1
}

// Lê a planilha (o mesmo formato que exportamos; cabeçalho na 1ª linha) e grava
// os preços. Tolera colunas em ordem diferente — casa pelo nome do cabeçalho.
// Linha sem descrição ou sem custo válido é ignorada, não derruba a importação.
export async function importarPlanilha(companyId: string, userId: string, buffer: Buffer): Promise<ResultadoDaImportacao> {
  if (!extrairTextoDeOffice(buffer)) throw new ImportacaoInvalida('Envie uma planilha .xlsx (foi o que o sistema exporta).')
  let grade: string[][]
  try {
    grade = extrairGradeDeXlsx(unzipSync(new Uint8Array(buffer)))
  } catch {
    throw new ImportacaoInvalida('Não consegui ler a planilha. Exporte o modelo, preencha e envie de volta.')
  }
  if (grade.length < 2) return { importados: 0, ignorados: 0 }

  const cabecalho = grade[0]
  const colDescricao = acharColuna(cabecalho, 'descricao', 'item')
  const colCusto = acharColuna(cabecalho, 'custo', 'valor', 'preco')
  if (colDescricao < 0 || colCusto < 0) {
    throw new ImportacaoInvalida('A planilha precisa ter ao menos as colunas "Descrição" e "Custo unitário".')
  }
  const colUnidade = acharColuna(cabecalho, 'unidade', 'und', 'un')
  const colTipo = acharColuna(cabecalho, 'tipo')
  const colFonte = acharColuna(cabecalho, 'fonte')
  const colObs = acharColuna(cabecalho, 'observacao', 'obs')

  const agora = new Date()
  const registros: Prisma.PrecoBaseCreateManyInput[] = []
  let ignorados = 0
  for (let i = 1; i < grade.length; i++) {
    const linha = grade[i]
    const descricao = (linha[colDescricao] ?? '').trim()
    const custo = parseValorBr(linha[colCusto] ?? '')
    if (!descricao || custo === null) {
      if (descricao || (linha[colCusto] ?? '').trim()) ignorados++
      continue
    }
    registros.push({
      companyId,
      userId,
      descricao: descricao.slice(0, 500),
      descricaoNorm: normalizarDescricao(descricao),
      unidade: colUnidade >= 0 ? (linha[colUnidade] ?? '').trim().slice(0, 30) || null : null,
      tipo: colTipo >= 0 ? tipoDoRotulo(linha[colTipo] ?? '') : 'MATERIAL',
      custoUnitario: new Prisma.Decimal(custo.toFixed(2)),
      fonte: colFonte >= 0 ? fonteDoRotulo(linha[colFonte] ?? '') : 'PROPRIA',
      observacao: colObs >= 0 ? (linha[colObs] ?? '').trim().slice(0, 2000) || null : null,
      dataDoPreco: agora,
    })
  }

  if (registros.length > 0) await prisma.precoBase.createMany({ data: registros })
  return { importados: registros.length, ignorados }
}

export class ImportacaoInvalida extends Error {}

// ---- Casar a base com os itens de uma licitação (Agente de Orçamento) ----

// Abaixo disto a descrição é parecida demais com qualquer coisa para sugerir.
// É só sugestão (o usuário confere), então pode ser folgado.
export const SIMILARIDADE_MINIMA_DA_BASE = 0.3

export interface SugestaoDeCusto {
  precoId: string
  custoUnit: number
  descricao: string
  fonte: FonteDePreco
  dataDoPreco: string
  desatualizado: boolean
  similaridade: number
}

type LinhaDaSugestao = {
  item_id: string
  id: string
  descricao: string
  custo_unitario: Prisma.Decimal | string
  fonte: FonteDePreco
  data_do_preco: Date
  semelhanca: number | string
}

// Para cada item (id + descrição), acha o preço da base mais parecido por
// trigramas (índice GIN em descricao_norm). Item sem nada acima do piso fica
// de fora do resultado. Não grava nada — quem decide usar é a tela do estudo.
export async function sugerirCustosParaItens(companyId: string, itens: { id: string; descricao: string }[]): Promise<Record<string, SugestaoDeCusto>> {
  const pedidos = itens
    .map((i) => ({ id: i.id, descricao: normalizarDescricao(i.descricao) }))
    .filter((p) => p.descricao.length >= 3)
  if (pedidos.length === 0) return {}
  const ids = pedidos.map((p) => p.id)
  const descricoes = pedidos.map((p) => p.descricao)

  const linhas = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(SIMILARIDADE_MINIMA_DA_BASE)}, true)`
    return tx.$queryRaw<LinhaDaSugestao[]>`
      SELECT pedido.item_id, p.*
      FROM unnest(${ids}::text[], ${descricoes}::text[]) AS pedido(item_id, descricao)
      CROSS JOIN LATERAL (
        SELECT pb.id, pb.descricao, pb.custo_unitario, pb.fonte, pb.data_do_preco,
               similarity(pb.descricao_norm, pedido.descricao) AS semelhanca
        FROM precos_base pb
        WHERE pb.company_id = ${companyId}
          AND pb.descricao_norm % pedido.descricao
        ORDER BY semelhanca DESC, pb.data_do_preco DESC, pb.id
        LIMIT 1
      ) p`
  })

  const saida: Record<string, SugestaoDeCusto> = {}
  for (const l of linhas) {
    const data = l.data_do_preco
    saida[l.item_id] = {
      precoId: l.id,
      custoUnit: Number(l.custo_unitario),
      descricao: l.descricao,
      fonte: l.fonte,
      dataDoPreco: data.toISOString(),
      desatualizado: estaDesatualizado(data),
      similaridade: Math.round(Number(l.semelhanca) * 100) / 100,
    }
  }
  return saida
}
