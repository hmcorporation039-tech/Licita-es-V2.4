// ============================================================
// api/routes/auth.ts — Login e troca de senha
// (criação de usuário é feita pelo admin — ver routes/admin.ts)
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import {
  hashPassword,
  normalizeEmail,
  signSessionToken,
  verifyPasswordConstantTime,
} from '../../services/authService'
import { senhaSchema } from '../passwordPolicy'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireAuth } from '../authMiddleware'
import { registrarAuditoria } from '../../services/auditService'
import { loginLimiter, changePasswordLimiter, cadastroLimiter, recuperacaoLimiter } from '../rateLimit'
import { cnpjValido, cpfValido } from '../../lib/documentos'
import {
  cadastrar,
  confirmarEmail,
  redefinirSenha,
  reenviarConfirmacao,
  solicitarRecuperacao,
  trialDias,
} from '../../services/contaService'

export const authRouter = Router()

// Respostas de "esqueci a senha"/"reenviar confirmação" levam um tempo mínimo
// fixo: sem isso, a diferença entre "conta existe" (grava token, envia e-mail)
// e "não existe" apareceria no tempo de resposta. Em teste não há espera.
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
async function comTempoMinimo<T>(trabalho: Promise<T>, ms = 400): Promise<T> {
  const espera = process.env.NODE_ENV === 'test' ? 0 : ms
  const [resultado] = await Promise.all([trabalho, esperar(espera)])
  return resultado
}

const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe seu nome').max(120),
    email: z.string().trim().email('E-mail inválido').max(254),
    senha: senhaSchema,
    tipo: z.enum(['PESSOA_FISICA', 'PESSOA_JURIDICA']),
    documento: z.string().trim().min(11).max(18),
    empresaNome: z.string().trim().min(2).max(160).optional(),
    telefone: z.string().trim().min(8).max(30).optional(),
    aceiteTermos: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os Termos de Uso e a Política de Privacidade' }) }),
    // Isca para robôs: campo invisível na tela. Pessoa nunca preenche.
    website: z.string().max(200).optional(),
  })
  .superRefine((d, ctx) => {
    const ok = d.tipo === 'PESSOA_FISICA' ? cpfValido(d.documento) : cnpjValido(d.documento)
    if (!ok) ctx.addIssue({ code: 'custom', path: ['documento'], message: d.tipo === 'PESSOA_FISICA' ? 'CPF inválido' : 'CNPJ inválido' })
  })

const MENSAGEM_CADASTRO =
  'Se os dados estiverem corretos, enviamos um e-mail de confirmação. Abra o link recebido para ativar a conta e começar o período de teste.'

// Cadastro aberto. A resposta é SEMPRE a mesma (202) — nunca revela se o e-mail
// ou o documento já tinham conta; o dono do e-mail é avisado por e-mail.
authRouter.post(
  '/register',
  cadastroLimiter,
  asyncHandler(async (req, res) => {
    const d = cadastroSchema.parse(req.body)
    if (d.website) {
      res.status(202).json({ mensagem: MENSAGEM_CADASTRO })
      return
    }

    const r = await cadastrar({
      nome: d.nome,
      email: d.email,
      senha: d.senha,
      tipo: d.tipo,
      documento: d.documento,
      empresaNome: d.empresaNome,
      telefone: d.telefone,
    })

    if (r.criado) {
      await registrarAuditoria(
        req,
        { action: 'CADASTRO_CRIADO', entityType: 'usuario', entityId: r.userId, companyId: r.companyId, metadata: { tipo: d.tipo, trialDias: trialDias() } },
        { userId: r.userId, email: r.email }
      )
    } else {
      // Só o motivo (visível apenas ao admin): sem e-mail nem documento no log.
      await registrarAuditoria(req, { action: 'CADASTRO_RECUSADO', metadata: { motivo: r.motivo } }, { userId: null, email: null })
    }
    res.status(202).json({ mensagem: MENSAGEM_CADASTRO })
  })
)

const tokenSchema = z.object({ token: z.string().min(20).max(200) })

authRouter.post(
  '/verify-email',
  recuperacaoLimiter,
  asyncHandler(async (req, res) => {
    const { token } = tokenSchema.parse(req.body)
    const r = await confirmarEmail(token)
    if (!r) throw new ApiError(400, 'Link inválido ou expirado. Peça um novo e-mail de confirmação.')
    await registrarAuditoria(req, { action: 'EMAIL_VERIFICADO', entityType: 'usuario', entityId: r.userId, companyId: r.companyId }, { userId: r.userId })
    res.json({ ok: true })
  })
)

const emailSchema = z.object({ email: z.string().trim().email().max(254) })

authRouter.post(
  '/resend-verification',
  recuperacaoLimiter,
  asyncHandler(async (req, res) => {
    const { email } = emailSchema.parse(req.body)
    await comTempoMinimo(reenviarConfirmacao(email))
    res.status(202).json({ mensagem: 'Se a conta existir e ainda não estiver confirmada, enviamos um novo link.' })
  })
)

authRouter.post(
  '/forgot-password',
  recuperacaoLimiter,
  asyncHandler(async (req, res) => {
    const { email } = emailSchema.parse(req.body)
    const r = await comTempoMinimo(solicitarRecuperacao(email))
    if (r) {
      await registrarAuditoria(req, { action: 'RECUPERACAO_SOLICITADA', entityType: 'usuario', entityId: r.userId, companyId: r.companyId }, { userId: r.userId })
    }
    res.status(202).json({ mensagem: 'Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.' })
  })
)

authRouter.post(
  '/reset-password',
  recuperacaoLimiter,
  asyncHandler(async (req, res) => {
    const { token, novaSenha } = z.object({ token: z.string().min(20).max(200), novaSenha: senhaSchema }).parse(req.body)
    const r = await redefinirSenha(token, novaSenha)
    if (!r) throw new ApiError(400, 'Link inválido ou expirado. Peça uma nova redefinição de senha.')
    await registrarAuditoria(req, { action: 'SENHA_REDEFINIDA_POR_EMAIL', entityType: 'usuario', entityId: r.userId, companyId: r.companyId }, { userId: r.userId })
    res.json({ ok: true })
  })
)

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body)
    const email = normalizeEmail(parsed.email)
    const { password } = parsed

    const user = await prisma.user.findUnique({ where: { email } })
    // Mesma mensagem de erro pra e-mail inexistente, conta sem senha e senha
    // errada — e sempre pagando o custo de um bcrypt.compare (mesmo sem hash
    // real), pra que nem a mensagem nem o tempo de resposta revelem quais
    // e-mails têm conta. Ver verifyPasswordConstantTime.
    const invalid = () => new ApiError(401, 'E-mail ou senha inválidos')

    const senhaConfere = await verifyPasswordConstantTime(
      password,
      user && user.active ? user.passwordHash : null
    )
    if (!user || !user.active || !senhaConfere) {
      // O e-mail só é registrado quando a conta existe: o campo digitado errado
      // costuma conter outra coisa (até uma senha colada), que não deve ir para o log.
      await registrarAuditoria(
        req,
        {
          action: 'LOGIN_FALHA',
          entityType: 'usuario',
          entityId: user?.id,
          companyId: user?.companyId ?? null,
          metadata: { motivo: !user ? 'conta-desconhecida' : !user.active ? 'conta-inativa' : 'senha-incorreta' },
        },
        { userId: user?.id ?? null, email: user?.email ?? null }
      )
      throw invalid()
    }
    // Só chega aqui quem acertou a senha, então dizer "confirme o e-mail" não
    // revela nada a quem não é o dono da conta.
    if (!user.emailVerifiedAt) {
      await registrarAuditoria(
        req,
        { action: 'LOGIN_FALHA', entityType: 'usuario', entityId: user.id, companyId: user.companyId, metadata: { motivo: 'email-nao-confirmado' } },
        { userId: user.id, email: user.email }
      )
      throw new ApiError(403, 'Confirme seu e-mail para entrar. Enviamos um link quando você se cadastrou.', {
        code: 'EMAIL_NAO_VERIFICADO',
      })
    }
    if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
      await registrarAuditoria(
        req,
        { action: 'LOGIN_FALHA', entityType: 'usuario', entityId: user.id, companyId: user.companyId, metadata: { motivo: 'acesso-expirado' } },
        { userId: user.id, email: user.email }
      )
      throw new ApiError(403, 'O acesso desta conta expirou — fale com o administrador', { code: 'ACESSO_EXPIRADO' })
    }

    const token = signSessionToken(user.id, user.tokenVersion)
    await registrarAuditoria(
      req,
      { action: 'LOGIN_OK', entityType: 'usuario', entityId: user.id, companyId: user.companyId },
      { userId: user.id, email: user.email }
    )
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    })
  })
)

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: senhaSchema,
})

authRouter.post(
  '/change-password',
  requireAuth,
  changePasswordLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    if (!(await verifyPasswordConstantTime(currentPassword, user.passwordHash))) {
      throw new ApiError(401, 'Senha atual incorreta')
    }

    // Trocar a senha invalida as sessões antigas — senão um token roubado
    // continuaria valendo por até 30 dias mesmo depois da troca.
    const atualizado = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    })

    await registrarAuditoria(req, { action: 'SENHA_ALTERADA', entityType: 'usuario', entityId: user.id })
    res.json({ token: signSessionToken(atualizado.id, atualizado.tokenVersion) })
  })
)

// Logout de verdade: incrementa o tokenVersion, o que invalida no servidor
// TODOS os tokens já emitidos para esta conta (o authMiddleware confere o
// tokenVersion do token contra o do banco). Sem isto, "sair" só apagava o
// token do navegador e um token copiado antes seguia valendo até expirar.
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.userId! },
      data: { tokenVersion: { increment: 1 } },
    })
    await registrarAuditoria(req, { action: 'LOGOUT', entityType: 'usuario', entityId: req.userId })
    res.status(204).end()
  })
)

// Retorna os dados do usuário autenticado (pra revalidar a sessão salva no
// navegador ao carregar a página, sem precisar logar de novo).
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    res.json({ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin })
  })
)
