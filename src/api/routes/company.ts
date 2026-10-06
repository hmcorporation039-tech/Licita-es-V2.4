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
import { generateTempPassword, hashPassword, normalizeEmail } from '../../services/authService'
import { senhaSchema } from '../passwordPolicy'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireCompanyOwner } from '../authMiddleware'
import { cepLimiter, escritaSensivelLimiter } from '../rateLimit'
import { exigirCotaDaRequisicao } from '../cotas'
import { registrarAuditoria } from '../../services/auditService'
import { resumoDeCotas } from '../../services/quotaService'
import { cnpjValido, cpfValido, somenteDigitos } from '../../lib/documentos'
import { Prisma } from '@prisma/client'
import { findMunicipioByNomeUf } from '../../lib/geoService'
import { CepIndisponivelError, CepNaoEncontradoError, consultarCep } from '../../lib/cep'

export const companyRouter = Router()

// Plano da empresa e quanto dele já foi usado (itens, usuários, análises de IA
// no mês) — alimenta os avisos de limite na tela.
companyRouter.get(
  '/usage',
  asyncHandler(async (req, res) => {
    // O administrador da plataforma nunca é limitado (ver exigirCota): a tela mostra "sem limite".
    res.json({ ...(await resumoDeCotas(req.companyId!)), ilimitado: req.isAdmin === true })
  })
)

companyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: req.companyId! },
      // Campos explícitos: a linha inteira traria também os ajustes comerciais (quotaOverrides).
      select: {
        id: true, tipo: true, name: true, cnpj: true, cpf: true, email: true, telefone: true, responsavel: true,
        endereco: true, cep: true, enderecoNumero: true, enderecoComplemento: true, enderecoBairro: true, enderecoCidade: true,
        enderecoUf: true, baseMunicipio: true, baseUf: true, planCode: true, createdAt: true, updatedAt: true,
        users: {
          select: { id: true, email: true, name: true, companyRole: true, active: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    res.json(company)
  })
)

// CEP -> rua, bairro, cidade e UF (a pessoa só informa o número).
companyRouter.get(
  '/cep/:cep',
  cepLimiter,
  asyncHandler(async (req, res) => {
    try {
      res.json(await consultarCep(req.params.cep))
    } catch (err) {
      if (err instanceof CepNaoEncontradoError) throw new ApiError(404, err.message)
      if (err instanceof CepIndisponivelError) throw new ApiError(503, err.message)
      throw err
    }
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
  enderecoNumero: z.string().trim().max(20).nullable().optional(),
  enderecoComplemento: z.string().trim().max(80).nullable().optional(),
  enderecoBairro: z.string().trim().max(80).nullable().optional(),
  enderecoCidade: z.string().trim().max(80).nullable().optional(),
  enderecoUf: z.string().length(2).nullable().optional(),
  // Base de entregas: de onde sai o fornecimento (custo de deslocamento do estudo de custos).
  baseMunicipio: z.string().trim().min(2).max(120).nullable().optional(),
  baseUf: z.string().length(2).nullable().optional(),
})

companyRouter.patch(
  '/',
  requireCompanyOwner,
  asyncHandler(async (req, res) => {
    const { tipo, cnpj, cpf, baseMunicipio, baseUf, ...resto } = updateCompanySchema.parse(req.body)
    const data: Prisma.CompanyUpdateInput = { ...resto }

    // Base de entregas: município + UF viram coordenadas pela base do IBGE. Limpar um limpa o outro.
    if (baseMunicipio !== undefined || baseUf !== undefined) {
      if (!baseMunicipio || !baseUf) {
        Object.assign(data, { baseMunicipio: null, baseUf: null, baseLat: null, baseLng: null })
      } else {
        const geo = findMunicipioByNomeUf(baseMunicipio, baseUf)
        if (!geo) throw new ApiError(400, `Cidade "${baseMunicipio}/${baseUf.toUpperCase()}" não encontrada — confira o nome e a UF.`)
        Object.assign(data, { baseMunicipio: baseMunicipio.trim(), baseUf: baseUf.toUpperCase(), baseLat: geo.lat, baseLng: geo.lng })
      }
    }

    // CPF/CNPJ e tipo identificam a conta (um período de teste por documento). Depois de
    // preenchidos, só o suporte altera: senão o dono "soltava" o documento para fazer outro
    // teste grátis, ou tomava o CNPJ de terceiros. Reenviar o mesmo valor (o formulário manda
    // tudo) é aceito; preencher um documento que ainda não existe também, com validação.
    const atual = await prisma.company.findUniqueOrThrow({ where: { id: req.companyId! }, select: { tipo: true, cnpj: true, cpf: true } })
    const digitos = (v: string | null | undefined) => (v ? somenteDigitos(v) : null)
    const temDocumento = !!(atual.cnpj || atual.cpf)
    const pedido = { tipo: tipo ?? atual.tipo, cnpj: cnpj === undefined ? digitos(atual.cnpj) : digitos(cnpj), cpf: cpf === undefined ? digitos(atual.cpf) : digitos(cpf) }
    const igual = pedido.tipo === atual.tipo && pedido.cnpj === digitos(atual.cnpj) && pedido.cpf === digitos(atual.cpf)
    if (!igual) {
      if (temDocumento) {
        throw new ApiError(403, 'O CPF/CNPJ e o tipo de conta não podem ser alterados por aqui. Fale com o suporte.')
      }
      if (pedido.cnpj && (pedido.tipo !== 'PESSOA_JURIDICA' || !cnpjValido(pedido.cnpj))) throw new ApiError(400, 'CNPJ inválido.')
      if (pedido.cpf && (pedido.tipo !== 'PESSOA_FISICA' || !cpfValido(pedido.cpf))) throw new ApiError(400, 'CPF inválido.')
      Object.assign(data, { tipo: pedido.tipo, cnpj: pedido.cnpj, cpf: pedido.cpf })
    }

    let updated
    try {
      updated = await prisma.company.update({ where: { id: req.companyId! }, data })
    } catch (err) {
      // Documento já usado por outra conta: mensagem neutra (não confirma que ele existe).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(409, 'Não foi possível usar este documento. Fale com o suporte.')
      }
      throw err
    }
    await registrarAuditoria(req, {
      action: 'EMPRESA_ALTERADA',
      entityType: 'empresa',
      entityId: updated.id,
      metadata: { campos: Object.keys(data) },
    })
    res.json(updated)
  })
)

const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  password: senhaSchema.optional(), // se ausente, gera uma temporária
})

companyRouter.post(
  '/members',
  requireCompanyOwner,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const body = createMemberSchema.parse(req.body)
    const email = normalizeEmail(body.email)

    // Mensagem neutra: um dono de empresa não deve conseguir descobrir, pelo
    // texto do erro, que um e-mail já tem conta em OUTRA empresa. Continua
    // sendo 409 (o e-mail não pôde ser usado), mas sem confirmar a existência.
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new ApiError(409, 'Não foi possível convidar este e-mail. Fale com o administrador.')
    }

    await exigirCotaDaRequisicao(req, 'usuarios')

    const tempPassword = body.password ?? generateTempPassword()

    // Membro novo herda o prazo de acesso da empresa (accessExpiresAt do dono),
    // em vez de nascer com acesso indeterminado enquanto a conta da empresa é
    // por prazo — senão um convidado "furava" a validade do plano.
    const owner = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { accessExpiresAt: true },
    })

    const member = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await hashPassword(tempPassword),
        companyId: req.companyId!,
        companyRole: 'MEMBER',
        // Convidado pelo dono da empresa: não passa pela confirmação de e-mail.
        emailVerifiedAt: new Date(),
        accessExpiresAt: owner?.accessExpiresAt ?? null,
      },
    })

    await registrarAuditoria(req, {
      action: 'MEMBRO_CRIADO',
      entityType: 'usuario',
      entityId: member.id,
      metadata: { email: member.email },
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

    // Conta travada pelo admin da plataforma só o admin reativa — o dono da
    // empresa não pode reabrir um acesso que o admin bloqueou de propósito.
    if (body.active === true && membro.disabledByAdmin) {
      throw new ApiError(403, 'Esta conta foi desativada pelo administrador — só ele pode reativá-la')
    }

    if (membro.id === req.userId && (body.companyRole === 'MEMBER' || body.active === false)) {
      await assertNaoEhUltimoOwner(req.companyId!, membro.id)
    }

    const data: { companyRole?: 'OWNER' | 'MEMBER'; active?: boolean; tokenVersion?: { increment: number } } = {}
    if (body.companyRole !== undefined) data.companyRole = body.companyRole
    if (body.active !== undefined) {
      data.active = body.active
      if (!body.active) data.tokenVersion = { increment: 1 }
    }

    // Reativar um membro ocupa uma vaga do plano, como convidar um novo.
    if (body.active === true && !membro.active) await exigirCotaDaRequisicao(req, 'usuarios')

    const updated = await prisma.user.update({ where: { id: membro.id }, data })
    await registrarAuditoria(req, {
      action: 'MEMBRO_ALTERADO',
      entityType: 'usuario',
      entityId: membro.id,
      metadata: { email: membro.email, companyRole: body.companyRole, active: body.active },
    })
    res.json({ id: updated.id, email: updated.email, companyRole: updated.companyRole, active: updated.active })
  })
)
