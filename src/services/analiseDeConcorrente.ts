// ============================================================
// services/analiseDeConcorrente.ts — Estrategista de Habilitação (fatia 1,
// base). Guarda a análise de um concorrente e seus documentos (efêmeros,
// isolados por companyId). A análise por IA em si vem na fatia seguinte; aqui
// só CRUD + upload dos documentos. Quem expõe por HTTP é routes/concorrentes.
// ============================================================

import { createHash } from 'node:crypto'
import { Prisma, AnalysisStatus } from '@prisma/client'
import { prisma } from './tenderService'
import { detectarTipoDeArquivo, nomeDeArquivoSeguro, TAMANHO_MAXIMO_ARQUIVO } from '../lib/arquivoDeDocumento'

export const MAX_ARQUIVOS_POR_ANALISE = 10

export interface ArquivoNaTela {
  id: string
  nomeArquivo: string
  tamanho: number
}

export interface AnaliseNaTela {
  id: string
  tenderId: string
  nomeConcorrente: string | null
  status: AnalysisStatus
  erro: string | null
  resultado: unknown
  arquivos: ArquivoNaTela[]
  criadaEm: string
  atualizadaEm: string
}

const SELECAO = {
  id: true,
  tenderId: true,
  nomeConcorrente: true,
  status: true,
  erro: true,
  resultado: true,
  createdAt: true,
  updatedAt: true,
  arquivos: { select: { id: true, nomeArquivo: true, tamanho: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AnaliseDeConcorrenteSelect

type AnaliseDoBanco = Prisma.AnaliseDeConcorrenteGetPayload<{ select: typeof SELECAO }>

function paraTela(a: AnaliseDoBanco): AnaliseNaTela {
  return {
    id: a.id,
    tenderId: a.tenderId,
    nomeConcorrente: a.nomeConcorrente,
    status: a.status,
    erro: a.erro,
    resultado: a.resultado ?? null,
    arquivos: a.arquivos.map((f) => ({ id: f.id, nomeArquivo: f.nomeArquivo, tamanho: f.tamanho })),
    criadaEm: a.createdAt.toISOString(),
    atualizadaEm: a.updatedAt.toISOString(),
  }
}

export async function listarAnalises(companyId: string, tenderId: string): Promise<AnaliseNaTela[]> {
  const analises = await prisma.analiseDeConcorrente.findMany({
    where: { companyId, tenderId },
    orderBy: { createdAt: 'desc' },
    select: SELECAO,
  })
  return analises.map(paraTela)
}

export async function obterAnalise(companyId: string, id: string): Promise<AnaliseNaTela | null> {
  const a = await prisma.analiseDeConcorrente.findFirst({ where: { id, companyId }, select: SELECAO })
  return a ? paraTela(a) : null
}

export async function criarAnalise(companyId: string, userId: string, tenderId: string, nomeConcorrente: string | null): Promise<AnaliseNaTela> {
  const criada = await prisma.analiseDeConcorrente.create({
    data: { companyId, userId, tenderId, nomeConcorrente, status: 'PENDING' },
    select: SELECAO,
  })
  return paraTela(criada)
}

export async function removerAnalise(companyId: string, id: string): Promise<void> {
  await prisma.analiseDeConcorrente.deleteMany({ where: { id, companyId } })
}

export class ArquivoInvalido extends Error {}
export class LimiteDeArquivos extends Error {}

// Adiciona um documento do concorrente à análise (bytes no banco, como o cofre).
// Só PDF/JPG/PNG; teto de arquivos por análise. Volta a análise atualizada.
export async function adicionarArquivo(companyId: string, analiseId: string, conteudo: Buffer): Promise<AnaliseNaTela> {
  const analise = await prisma.analiseDeConcorrente.findFirst({ where: { id: analiseId, companyId }, select: { id: true, _count: { select: { arquivos: true } } } })
  if (!analise) throw new ArquivoInvalido('Análise não encontrada')
  if (conteudo.length === 0) throw new ArquivoInvalido('Nenhum arquivo foi enviado')
  if (analise._count.arquivos >= MAX_ARQUIVOS_POR_ANALISE) throw new LimiteDeArquivos(`Máximo de ${MAX_ARQUIVOS_POR_ANALISE} documentos por análise.`)

  const tipo = detectarTipoDeArquivo(conteudo)
  if (!tipo) throw new ArquivoInvalido('Envie o documento em PDF, JPG ou PNG')

  const sha256 = createHash('sha256').update(conteudo).digest('hex')
  await prisma.concorrenteArquivo.create({
    data: {
      analiseId,
      companyId,
      nomeArquivo: nomeDeArquivoSeguro('documento-do-concorrente', tipo),
      mimeType: tipo,
      tamanho: conteudo.length,
      sha256,
      conteudo,
    },
  })
  // Novo documento → a análise anterior (se houver) fica desatualizada: volta a PENDING.
  await prisma.analiseDeConcorrente.updateMany({ where: { id: analiseId, companyId }, data: { status: 'PENDING', erro: null } })

  const atualizada = await prisma.analiseDeConcorrente.findFirst({ where: { id: analiseId, companyId }, select: SELECAO })
  return paraTela(atualizada!)
}

export { TAMANHO_MAXIMO_ARQUIVO }
