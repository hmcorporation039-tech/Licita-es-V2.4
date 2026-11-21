import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { asyncHandler } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { interpretarPedido } from '../../lib/bela/interpretar'
import { prisma } from '../../services/tenderService'
import { deveOferecerAJornada, lerEstadoDaJornada, novoEstadoDaJornada, pedidoDaJornadaSchema } from '../../lib/jornadaDaBela'
import { whereDaLicitacaoNoFeed } from '../../lib/feedDeMatches'

export const belaRouter = Router()

const pedidoSchema = z.object({
  texto: z.string().max(500),
  contexto: z.enum(['busca', 'pregao']).default('busca'),
})

belaRouter.post(
  '/interpretar',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { texto, contexto } = pedidoSchema.parse(req.body)
    res.json(interpretarPedido(texto, contexto))
  })
)

// "Bela que acompanha" (lib/jornadaDaBela.ts): onde a pessoa está no passo a
// passo, se a Bela deve se oferecer e o que a tela precisa para a próxima fala.
belaRouter.get(
  '/jornada',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!
    const [usuario, empresa, itens, matches, buscasEmAndamento] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId! }, select: { jornadaDaBela: true, name: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { planCode: true, enderecoUf: true, baseUf: true } }),
      prisma.monitoredItem.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, take: 5, select: { id: true, name: true, keywords: true, ufs: true } }),
      prisma.tenderMatch.count({ where: { companyId, tender: whereDaLicitacaoNoFeed() } }),
      prisma.monitoredItem.count({ where: { companyId, buscaEstado: 'EM_ANDAMENTO' } }),
    ])
    const estado = lerEstadoDaJornada(usuario?.jornadaDaBela)
    res.json({
      oferecer: deveOferecerAJornada(empresa?.planCode ?? '', estado),
      estado,
      nome: usuario?.name ?? null,
      ufDaEmpresa: empresa?.baseUf ?? empresa?.enderecoUf ?? null,
      itens,
      matches,
      buscando: buscasEmAndamento > 0,
    })
  })
)

belaRouter.put(
  '/jornada',
  asyncHandler(async (req, res) => {
    const pedido = pedidoDaJornadaSchema.parse(req.body)
    const usuario = await prisma.user.findUnique({ where: { id: req.userId! }, select: { jornadaDaBela: true } })
    const estado = novoEstadoDaJornada(pedido, lerEstadoDaJornada(usuario?.jornadaDaBela))
    await prisma.user.update({ where: { id: req.userId! }, data: { jornadaDaBela: estado as unknown as Prisma.InputJsonValue } })
    res.json({ estado })
  })
)
