// ============================================================
// api/routes/company.ts — Etapa 1b: dados da empresa + membros.
// Qualquer membro pode ver; só o OWNER edita a empresa e gerencia quem
// faz parte dela. Convidar colega = criar a conta dele direto nesta
// empresa (não existe autocadastro aberto — mesma regra do admin.ts,
// só que escopada pro dono da empresa em vez do admin da plataforma).
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { generateTempPassword, hashPassword } from '../../services/authService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireCompanyOwner } from '../authMiddleware'

export const companyRouter = Router()

companyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: req.companyId! },
      include: {
        users: {
          select: { id: true, email: true, name: true, companyRole: true, active: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    res.json(company)
  })
)

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  tipo: z.enum(['PESSOA_FISICA', 'PESSOA_JURIDICA']).optional(),
  cnpj: z.string().min(1).nullable().optional(),
  cpf: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  telefone: z.string().min(1).nullable().optional(),
  responsavel: z.string().min(1).nullable().optional(),
  endereco: z.string().min(1).nullable().optional(),
  cep: z.string().min(1).nullable().optional(),
})

companyRouter.patch(
  '/',
  requireCompanyOwner,
  asyncHandler(async (req, res) => {
    const data = updateCompanySchema.parse(req.body)
    const updated = await prisma.company.update({ where: { id: req.companyId! }, data })
    res.json(updated)
  })
)

const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(), // se ausente, gera uma temporária
})

companyRouter.post(
  '/members',
  requireCompanyOwner,
  asyncHandler(async (req, res) => {
    const body = createMemberSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) throw new ApiError(409, 'Já existe um usuário com este e-mail')

    const tempPassword = body.password ?? generateTempPassword()

    const member = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(tempPassword),
        companyId: req.companyId!,
        companyRole: 'MEMBER',
      },
    })

    res.status(201).json({
      id: member.id,
      email: member.email,
      name: member.name,
      companyRole: member.companyRole,
      // Só aparece nesta resposta, uma vez — mesmo padrão do POST /admin/users.
      generatedPassword: body.password ? undefined : tempPassword,
    })
  })
)

const updateMemberSchema = z.object({
  companyRole: z.enum(['OWNER', 'MEMBER']).optional(),
  active: z.boolean().optional(),
})

async function assertMembroDaEmpresa(userId: string, companyId: string) {
  const membro = await prisma.user.findUnique({ where: { id: userId } })
  if (!membro || membro.companyId !== companyId) throw new ApiError(404, 'Membro não encontrado')
  return membro
}

// Guarda contra ficar sem nenhum OWNER ativo — sem isso, um rebaixamento ou
// uma desativação mal-feita trancaria a empresa (ninguém mais poderia
// convidar/gerenciar membro nenhum).
async function assertNaoEhUltimoOwner(companyId: string, userIdExcluido: string) {
  const outrosOwners = await prisma.user.count({
    where: { companyId, companyRole: 'OWNER', active: true, id: { not: userIdExcluido } },
  })
  if (outrosOwners === 0) {
    throw new ApiError(400, 'A empresa precisa ter ao menos um dono ativo — promova outro membro antes')
  }
}

companyRouter.patch(
  '/members/:id',
  requireCompanyOwner,
  asyncHandler(async (req, res) => {
    const membro = await assertMembroDaEmpresa(req.params.id, req.companyId!)
    const body = updateMemberSchema.parse(req.body)

    if (membro.id === req.userId && (body.companyRole === 'MEMBER' || body.active === false)) {
      await assertNaoEhUltimoOwner(req.companyId!, membro.id)
    }

    const data: { companyRole?: 'OWNER' | 'MEMBER'; active?: boolean; tokenVersion?: { increment: number } } = {}
    if (body.companyRole !== undefined) data.companyRole = body.companyRole
    if (body.active !== undefined) {
      data.active = body.active
      if (!body.active) data.tokenVersion = { increment: 1 }
    }

    const updated = await prisma.user.update({ where: { id: membro.id }, data })
    res.json({ id: updated.id, email: updated.email, companyRole: updated.companyRole, active: updated.active })
  })
)
