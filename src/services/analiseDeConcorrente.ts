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
import { extractPdf, temCamadaDeTexto } from './pdfTextService'
import { analiseHabilitada } from './editalAnalysisService'
import { QuemPediu, registrarUsoDeIa } from './aiUsageService'
import { verificarExigencias, type ComVerificacao, type DocumentoParaVerificar } from '../lib/matrizExigencias'
import { AnalysisRefusedError, ErroComUso, type EditalAnalysisResult } from './llm/types'
import {
  analisarConcorrenteComGemini,
  type AchadoDeHabilitacao,
  type AnalisadorDeConcorrente,
  type DocumentoDoConcorrente,
  type ExigenciaResumida,
} from './llm/habilitacaoConcorrente'

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

// ------------------------------------------------------------
// Análise por IA (Fatia 1b) — Modo A (só Gemini). Roda na fila (worker), nunca
// na requisição HTTP: ler vários documentos + modelo leva minutos. O achado
// guarda, além do que a IA disse, a verificação por código do trecho citado.
// ------------------------------------------------------------

export type AchadoVerificado = ComVerificacao<AchadoDeHabilitacao>

export interface DependenciasDaAnaliseDeConcorrente {
  // Injeção para teste: roda o fluxo completo (banco real) sem rede nem IA paga.
  analista?: AnalisadorDeConcorrente
}

// Teto de documentos lidos por análise (defesa de memória/custo; o upload já
// limita a MAX_ARQUIVOS_POR_ANALISE, isto é só um segundo cinto).
const MAX_DOCUMENTOS_NA_IA = MAX_ARQUIVOS_POR_ANALISE
// Quantas exigências do edital levar ao modelo (a matriz pode ter até 150).
const MAX_EXIGENCIAS_NO_PROMPT = 80

interface ArquivoBruto {
  nomeArquivo: string
  mimeType: string
  conteudo: Buffer
}

// Transforma os bytes de cada documento do concorrente no que vai ao modelo
// (texto quando dá, senão PDF/imagem nativa) e no que o verificador confere.
async function prepararDocumentos(arquivos: ArquivoBruto[]): Promise<{ aoModelo: DocumentoDoConcorrente[]; paraVerificar: DocumentoParaVerificar[] }> {
  const aoModelo: DocumentoDoConcorrente[] = []
  const paraVerificar: DocumentoParaVerificar[] = []

  for (const arq of arquivos.slice(0, MAX_DOCUMENTOS_NA_IA)) {
    const buffer = Buffer.isBuffer(arq.conteudo) ? arq.conteudo : Buffer.from(arq.conteudo)
    if (arq.mimeType === 'application/pdf') {
      let extraido: { texto: string; paginas: number; textoComPaginas: string } | null = null
      try {
        extraido = await extractPdf(buffer)
      } catch (err) {
        console.warn(`[Estrategista] Não deu para ler o texto de "${arq.nomeArquivo}", enviando como PDF:`, err instanceof Error ? err.message : err)
      }
      if (extraido && temCamadaDeTexto(extraido.texto, extraido.paginas)) {
        aoModelo.push({ nome: arq.nomeArquivo, tipo: 'texto', texto: extraido.textoComPaginas })
        paraVerificar.push({ nome: arq.nomeArquivo, texto: extraido.textoComPaginas })
      } else {
        // Escaneado: o modelo lê a página, mas não há texto para o verificador conferir.
        aoModelo.push({ nome: arq.nomeArquivo, tipo: 'pdf', data: buffer })
        paraVerificar.push({ nome: arq.nomeArquivo, texto: null })
      }
    } else {
      // Imagem (JPG/PNG): vai nativa; sem texto para conferir.
      aoModelo.push({ nome: arq.nomeArquivo, tipo: 'imagem', mimeType: arq.mimeType, data: buffer })
      paraVerificar.push({ nome: arq.nomeArquivo, texto: null })
    }
  }

  return { aoModelo, paraVerificar }
}

async function exigenciasDoEdital(tenderId: string): Promise<ExigenciaResumida[]> {
  const analise = await prisma.tenderAnalysis.findUnique({ where: { tenderId }, select: { status: true, resultado: true } })
  if (!analise || analise.status !== 'DONE' || !analise.resultado) return []
  const matriz = (analise.resultado as unknown as EditalAnalysisResult).matrizExigencias
  if (!Array.isArray(matriz)) return []
  return matriz
    .slice(0, MAX_EXIGENCIAS_NO_PROMPT)
    .map((e) => ({ texto: e.texto, categoria: e.categoria, documento: e.documento }))
}

async function marcarFalha(companyId: string, analiseId: string, erro: string): Promise<void> {
  await prisma.analiseDeConcorrente.updateMany({ where: { id: analiseId, companyId }, data: { status: 'FAILED', erro } })
}

// Põe a análise "em andamento" (conta na cota de análises em curso). Devolve
// se achou a análise dessa empresa. Chamado pela rota, antes de enfileirar.
export async function marcarAnaliseEmAndamento(companyId: string, analiseId: string): Promise<boolean> {
  const r = await prisma.analiseDeConcorrente.updateMany({ where: { id: analiseId, companyId }, data: { status: 'RUNNING', erro: null } })
  return r.count > 0
}

// Desfaz a reserva quando o enfileiramento falha (Redis fora): volta a PENDING.
export async function reverterAnaliseParaPendente(companyId: string, analiseId: string): Promise<void> {
  await prisma.analiseDeConcorrente.updateMany({ where: { id: analiseId, companyId, status: 'RUNNING' }, data: { status: 'PENDING' } })
}

// Executa a análise por IA de um concorrente (roda no worker). Idempotente no
// status: pode ser chamada já com a análise em RUNNING (reservada pela rota).
export async function executarAnaliseDeConcorrente(
  companyId: string,
  analiseId: string,
  quem: QuemPediu,
  deps: DependenciasDaAnaliseDeConcorrente = {}
): Promise<void> {
  const analise = await prisma.analiseDeConcorrente.findFirst({
    where: { id: analiseId, companyId },
    select: {
      id: true,
      tenderId: true,
      nomeConcorrente: true,
      arquivos: { select: { nomeArquivo: true, mimeType: true, conteudo: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!analise) return

  await prisma.analiseDeConcorrente.updateMany({ where: { id: analiseId, companyId }, data: { status: 'RUNNING', erro: null } })

  try {
    if (analise.arquivos.length === 0) {
      await marcarFalha(companyId, analiseId, 'Nenhum documento do concorrente foi enviado.')
      return
    }

    let analista = deps.analista
    if (!analista) {
      if (!analiseHabilitada()) {
        await marcarFalha(companyId, analiseId, 'A análise por IA está desligada nesta instalação.')
        return
      }
      analista = analisarConcorrenteComGemini
    }

    const { aoModelo, paraVerificar } = await prepararDocumentos(analise.arquivos)
    if (aoModelo.length === 0) {
      await marcarFalha(companyId, analiseId, 'Não foi possível ler os documentos enviados.')
      return
    }

    const tender = await prisma.tender.findUnique({ where: { id: analise.tenderId }, select: { objeto: true } })
    const exigencias = await exigenciasDoEdital(analise.tenderId)

    const inicio = Date.now()
    let outcome
    try {
      outcome = await analista({
        objetoDaLicitacao: tender?.objeto ?? '',
        nomeConcorrente: analise.nomeConcorrente,
        exigenciasDoEdital: exigencias,
        documentos: aoModelo,
      })
    } catch (rawErr) {
      // Falha depois da chamada ao modelo: os tokens já foram gastos e entram na medição.
      if (rawErr instanceof ErroComUso) {
        await registrarUsoDeIa({ tenderId: analise.tenderId, quem, uso: rawErr.uso, durationMs: Date.now() - inicio, status: 'ERRO', etapa: 'habilitacao-concorrente' })
        if (rawErr.causa instanceof AnalysisRefusedError) {
          await marcarFalha(companyId, analiseId, 'A análise foi recusada pelos filtros de segurança do modelo.')
          return
        }
        throw rawErr.causa
      }
      throw rawErr
    }

    await registrarUsoDeIa({ tenderId: analise.tenderId, quem, uso: outcome.uso, durationMs: Date.now() - inicio, status: 'OK', etapa: 'habilitacao-concorrente' })

    // Confere, por código, se o trecho que a IA citou aparece mesmo no documento do concorrente.
    const verificados = verificarExigencias(
      outcome.resultado.achados.map((a) => ({ achado: a, texto: a.trecho, documento: a.documento })),
      paraVerificar
    )
    const achados: AchadoVerificado[] = verificados.map((v) => ({ ...v.achado, verificacao: v.verificacao }))

    const resultado = { resumo: outcome.resultado.resumo, recomendacao: outcome.resultado.recomendacao, achados }
    await prisma.analiseDeConcorrente.updateMany({
      where: { id: analiseId, companyId },
      data: { status: 'DONE', erro: null, resultado: resultado as unknown as object },
    })
  } catch (err) {
    console.error(`[Estrategista] Falha ao analisar o concorrente ${analiseId}:`, err instanceof Error ? err.message : err)
    await marcarFalha(companyId, analiseId, 'Não foi possível concluir a análise. Tente novamente mais tarde.')
    throw err
  }
}
