import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter } from '../rateLimit'
import { exigirCotaDaRequisicao } from '../cotas'
import { analiseQueue } from '../../queues'
import { enfileirarSemTravar } from '../../queues/enfileirar'
import { limitesDaEmpresa } from '../../services/quotaService'
import { inicioDoMesBrasilia } from '../../lib/planos'
import {
  ConversaIndisponivel,
  conversaHabilitada,
  perguntasDaEmpresa,
  perguntasDoUsuarioNaUltimaHora,
  responderPergunta,
} from '../../services/conversaComOEdital'
import {
  MAX_PERGUNTAS_POR_HORA,
  TAMANHO_MAXIMO_DA_PERGUNTA,
  TAMANHO_MINIMO_DA_PERGUNTA,
  normalizarPergunta,
  precisaPreparar,
} from '../../lib/conversaComOEdital'

export const conversaComOEditalRouter = Router({ mergeParams: true })

type SituacaoDaConversa = 'sem-analise' | 'nao-preparada' | 'preparando' | 'pronta' | 'sem-texto' | 'falhou'

const perguntando = new Set<string>()

const perguntaSchema = z.object({
  pergunta: z
    .string()
    .transform(normalizarPergunta)
    .pipe(
      z
        .string()
        .min(TAMANHO_MINIMO_DA_PERGUNTA, 'Escreva a sua pergunta')
        .max(TAMANHO_MAXIMO_DA_PERGUNTA, `A pergunta pode ter até ${TAMANHO_MAXIMO_DA_PERGUNTA} caracteres`)
    ),
})

function idDaLicitacao(req: Request): string {
  return (req.params as { id: string }).id
}

async function analiseDaLicitacao(tenderId: string) {
  return prisma.tenderAnalysis.findUnique({
    where: { tenderId },
    select: { status: true, conversaStatus: true, conversaAtualizadaEm: true },
  })
}

function situacaoDe(analise: Awaited<ReturnType<typeof analiseDaLicitacao>>, agora = new Date()): SituacaoDaConversa {
  if (!analise || analise.status !== 'DONE') return 'sem-analise'
  if (precisaPreparar(analise, agora)) return 'nao-preparada'
  switch (analise.conversaStatus) {
    case 'PRONTA':
      return 'pronta'
    case 'SEM_TEXTO':
      return 'sem-texto'
    case 'FALHOU':
      return 'falhou'
    default:
      return 'preparando'
  }
}

async function cotaDePerguntas(req: Request) {
  const [{ limites }, usadas] = await Promise.all([
    limitesDaEmpresa(req.companyId!),
    prisma.editalPergunta.count({ where: { companyId: req.companyId!, createdAt: { gte: inicioDoMesBrasilia() } } }),
  ])
  return { usadas, limite: req.isAdmin === true ? null : limites.perguntasAoEditalMes }
}

conversaComOEditalRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenderId = idDaLicitacao(req)
    const analise = await analiseDaLicitacao(tenderId)
    const [documentos, perguntas, cota] = await Promise.all([
      prisma.tenderDocumentText.findMany({ where: { tenderId }, orderBy: { ordem: 'asc' }, select: { nome: true, paginas: true, escaneado: true } }),
      perguntasDaEmpresa(tenderId, req.companyId!),
      cotaDePerguntas(req),
    ])
    res.json({ disponivel: conversaHabilitada(), situacao: situacaoDe(analise), documentos, perguntas, cota })
  })
)

conversaComOEditalRouter.post(
  '/preparar',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    if (!conversaHabilitada()) throw new ApiError(503, 'A conversa com o edital está desligada nesta instalação')
    const tenderId = idDaLicitacao(req)
    const analise = await analiseDaLicitacao(tenderId)
    if (!analise || analise.status !== 'DONE') throw new ApiError(409, 'Analise o edital antes de conversar com ele')

    const agora = new Date()
    if (!precisaPreparar(analise, agora)) {
      res.json({ situacao: situacaoDe(analise, agora) })
      return
    }

    const reservou = await prisma.tenderAnalysis.updateMany({
      where: { tenderId, conversaStatus: analise.conversaStatus, conversaAtualizadaEm: analise.conversaAtualizadaEm },
      data: { conversaStatus: 'PREPARANDO', conversaAtualizadaEm: agora },
    })
    if (reservou.count === 0) {
      res.status(202).json({ situacao: 'preparando' })
      return
    }

    const enfileirou = await enfileirarSemTravar(analiseQueue, 'preparar-conversa', { tenderId }, 'Conversa com o edital', {
      deduplication: { id: `conversa-${tenderId}` },
    })
    if (!enfileirou) {
      await prisma.tenderAnalysis.updateMany({ where: { tenderId }, data: { conversaStatus: analise.conversaStatus, conversaAtualizadaEm: analise.conversaAtualizadaEm } })
      throw new ApiError(503, 'A fila está indisponível no momento. Tente de novo em alguns minutos.')
    }
    res.status(202).json({ situacao: 'preparando' })
  })
)

conversaComOEditalRouter.post(
  '/perguntas',
  asyncHandler(async (req, res) => {
    if (!conversaHabilitada()) throw new ApiError(503, 'A conversa com o edital está desligada nesta instalação')
    const { pergunta } = perguntaSchema.parse(req.body)
    const tenderId = idDaLicitacao(req)
    const analise = await analiseDaLicitacao(tenderId)
    const situacao = situacaoDe(analise)
    if (situacao === 'sem-analise') throw new ApiError(409, 'Analise o edital antes de conversar com ele')
    if (situacao === 'sem-texto') throw new ApiError(409, 'Os documentos desta licitação são imagens escaneadas, sem texto para a conversa.')
    if (situacao !== 'pronta') throw new ApiError(409, 'O edital ainda está sendo preparado para a conversa. Aguarde um instante.')

    await exigirCotaDaRequisicao(req, 'perguntasAoEditalMes')
    const userId = req.userId!
    if (!req.isAdmin && (await perguntasDoUsuarioNaUltimaHora(userId)) >= MAX_PERGUNTAS_POR_HORA) {
      throw new ApiError(429, 'Muitas perguntas na última hora. Aguarde um pouco antes de perguntar de novo.', { code: 'PERGUNTAS_POR_HORA' })
    }
    if (perguntando.has(userId)) throw new ApiError(429, 'Aguarde a resposta da pergunta anterior.', { code: 'PERGUNTA_EM_ANDAMENTO' })

    perguntando.add(userId)
    try {
      const respondida = await responderPergunta({ tenderId, companyId: req.companyId!, userId, pergunta })
      res.status(201).json({ pergunta: respondida, cota: await cotaDePerguntas(req) })
    } catch (err) {
      if (err instanceof ConversaIndisponivel) throw new ApiError(422, err.message)
      console.error(`[Conversa com o edital] Falha ao responder em ${tenderId}:`, err instanceof Error ? err.message : err)
      throw new ApiError(502, 'Não foi possível responder agora. Tente de novo em instantes.')
    } finally {
      perguntando.delete(userId)
    }
  })
)
