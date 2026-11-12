// ============================================================
// api/routes/interno.ts — Rotas internas, só de leitura, para sistemas do próprio
// Marcio (não para clientes). Hoje: o comercial-ia busca licitações abertas reais
// do ramo e do estado do lead para montar a mensagem de venda.
//
// Proteção: header x-chave-comercial = COMERCIAL_IA_CHAVE (tempo constante). Sem a
// variável a rota não existe (404). A busca por termo e UF é a mesma da vitrine
// pública; a resposta não tem nada de usuário nem de empresa cliente.
// ============================================================

import { Router, type NextFunction, type Request, type Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler } from '../asyncHandler'
import { comercialLimiter } from '../rateLimit'
import { whereLicitacaoComPrazoConfirmado } from '../../lib/licitacaoAberta'
import { dataDaSessao } from '../../lib/dataDaSessao'
import { idsQueCitamOTexto } from '../../services/buscaDeLicitacoes'
import { citaPessoaOuProcesso, limparObjetoDaVitrine, orgaoDaVitrine } from '../../lib/vitrinePublica'
import { chaveConfere, chaveDoComercial, linkDaLicitacao, pontosDeAtencao, rotuloDaModalidade, valorComoNumero } from '../../lib/abertasDoComercial'

export const internoRouter = Router()

function rotaLigada(_req: Request, res: Response, next: NextFunction) {
  if (!chaveDoComercial()) {
    res.status(404).json({ error: 'Não encontrado' })
    return
  }
  next()
}

function exigeChave(req: Request, res: Response, next: NextFunction) {
  const esperada = chaveDoComercial()
  if (!esperada || !chaveConfere(req.get('x-chave-comercial'), esperada)) {
    res.status(401).json({ error: 'Chave inválida' })
    return
  }
  next()
}

// Mesma ordem e mesmo critério de texto da vitrine pública (routes/public.ts).
const ORDEM_DA_BUSCA: Prisma.TenderOrderByWithRelationInput[] = [{ encerramentoAt: { sort: 'asc', nulls: 'last' } }, { aberturaAt: 'asc' }, { id: 'asc' }]
// Quantas encontradas olhamos para ordenar pelo prazo real (que depende da fonte).
const MAX_CANDIDATAS = 2000

const abertasSchema = z.object({
  q: z.string().trim().min(3).max(60),
  uf: z.string().trim().toUpperCase().length(2).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
})

internoRouter.get(
  '/abertas',
  rotaLigada,
  comercialLimiter,
  exigeChave,
  asyncHandler(async (req, res) => {
    const { q, uf, limite } = abertasSchema.parse(req.query)
    const agora = new Date()
    const { ids } = await idsQueCitamOTexto(q, { AND: [whereLicitacaoComPrazoConfirmado(agora), ...(uf ? [{ uf }] : [])] }, ORDEM_DA_BUSCA)

    // O prazo vem de encerramentoAt ou aberturaAt conforme a fonte (lib/dataDaSessao.ts):
    // calcula o de cada uma, fica só com as de prazo no futuro e ordena por ele.
    const datas = await prisma.tender.findMany({
      where: { id: { in: ids.slice(0, MAX_CANDIDATAS) } },
      select: { id: true, fonte: true, aberturaAt: true, encerramentoAt: true },
    })
    const comPrazo = datas
      .map((t) => ({ id: t.id, prazo: dataDaSessao(t) }))
      .filter((t): t is { id: string; prazo: Date } => t.prazo !== null && t.prazo.getTime() > agora.getTime())
      .sort((a, b) => a.prazo.getTime() - b.prazo.getTime() || a.id.localeCompare(b.id))

    // Busca algumas a mais: as que citam pessoa ou processo judicial não entram (ver lib/vitrinePublica.ts).
    const candidatas = comPrazo.slice(0, limite * 3)
    const encontradas = await prisma.tender.findMany({
      where: { id: { in: candidatas.map((c) => c.id) } },
      select: {
        id: true,
        fonte: true,
        objeto: true,
        objetoResumido: true,
        orgao: true,
        municipio: true,
        uf: true,
        modalidade: true,
        valorEstimado: true,
        linkEdital: true,
        numeroControle: true,
        analysis: { select: { status: true, resultado: true } },
      },
    })
    const porId = new Map(encontradas.map((t) => [t.id, t]))
    const itens = candidatas
      .map((c) => ({ c, t: porId.get(c.id) }))
      .filter((x): x is { c: (typeof candidatas)[number]; t: (typeof encontradas)[number] } => x.t !== undefined)
      .filter(({ t }) => !citaPessoaOuProcesso(`${t.objeto} ${t.objetoResumido ?? ''}`))
      .slice(0, limite)
      .map(({ c, t }) => ({
        id: t.id,
        objeto: limparObjetoDaVitrine(t.objeto),
        orgao: orgaoDaVitrine(t.orgao),
        municipio: t.municipio,
        uf: t.uf,
        modalidade: rotuloDaModalidade(t.modalidade),
        valorEstimado: valorComoNumero(t.valorEstimado),
        prazo: c.prazo.toISOString(),
        link: linkDaLicitacao(t),
        pontosAtencao: pontosDeAtencao(t.analysis),
      }))

    res.setHeader('Cache-Control', 'no-store')
    res.json({ total: comPrazo.length, itens })
  })
)
