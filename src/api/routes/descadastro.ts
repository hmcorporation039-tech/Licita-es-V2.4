import express, { Router, type Request } from 'express'
import { prisma } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import { descadastroLimiter, descadastroUmCliqueLimiter } from '../rateLimit'
import { ApiError, asyncHandler } from '../asyncHandler'
import { CAMPO_DA_PREFERENCIA, NOME_DO_AVISO, lerTokenDeDescadastro, type DadosDoDescadastro } from '../../lib/descadastro'

export const descadastroRouter = Router()

descadastroRouter.use(express.urlencoded({ extended: false, limit: '2kb' }))

function tokenDaRequisicao(req: Request): unknown {
  const doCorpo = (req.body as { t?: unknown } | undefined)?.t
  return typeof doCorpo === 'string' && doCorpo.length > 0 ? doCorpo : req.query.t
}

function dadosDoLink(req: Request): DadosDoDescadastro {
  const dados = lerTokenDeDescadastro(tokenDaRequisicao(req))
  if (!dados) throw new ApiError(400, 'Este link de descadastro não é válido. Abra o link mais recente que recebeu por e-mail ou mude as preferências na página Conta.')
  return dados
}

async function usuarioDoLink(dados: DadosDoDescadastro) {
  const campo = CAMPO_DA_PREFERENCIA[dados.tipo]
  const usuario = await prisma.user.findUnique({
    where: { id: dados.userId },
    select: { id: true, companyId: true, receberResumoDiario: true, receberLembreteDePrazo: true, receberAvisoDeDocumento: true, receberAvisoDeAlteracao: true },
  })
  if (!usuario) throw new ApiError(404, 'Esta conta não existe mais, então você já não recebe e-mails dela.')
  return { usuario, campo, recebendo: usuario[campo] }
}

descadastroRouter.get(
  '/',
  descadastroLimiter,
  asyncHandler(async (req, res) => {
    const dados = dadosDoLink(req)
    const { recebendo } = await usuarioDoLink(dados)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ tipo: dados.tipo, aviso: NOME_DO_AVISO[dados.tipo], recebendo })
  })
)

async function descadastrar(req: Request) {
  const dados = dadosDoLink(req)
  const { usuario, campo, recebendo } = await usuarioDoLink(dados)
  if (recebendo) {
    await prisma.user.update({ where: { id: usuario.id }, data: { [campo]: false } })
    await registrarAuditoria(
      req,
      { action: 'DESCADASTRO_POR_LINK', entityType: 'usuario', entityId: usuario.id, companyId: usuario.companyId, metadata: { tipo: dados.tipo } },
      { userId: usuario.id }
    )
  }
  return { tipo: dados.tipo, aviso: NOME_DO_AVISO[dados.tipo], recebendo: false }
}

descadastroRouter.post(
  '/',
  descadastroLimiter,
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await descadastrar(req))
  })
)

descadastroRouter.post(
  '/um-clique',
  descadastroUmCliqueLimiter,
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await descadastrar(req))
  })
)
