// ============================================================
// services/contaService.ts — Cadastro público, confirmação de e-mail e
// recuperação de senha.
//
// Princípios:
//  - Nada aqui revela se um e-mail ou documento já existe: quem chama responde
//    sempre a mesma coisa. O dono do e-mail é avisado por e-mail.
//  - Um teste por CPF/CNPJ: o documento (já validado) é único em `companies`.
//  - Token de uso único, só o hash no banco, e o consumo é atômico (duas
//    requisições com o mesmo link: só uma vence).
//  - Pré-sequestro de conta: alguém pode cadastrar o e-mail de outra pessoa com
//    uma senha que ele conhece. Por isso (1) a confirmação exige a senha do
//    cadastro — o dono do e-mail, que não a conhece, não ativa a conta do
//    atacante por engano — e (2) um novo cadastro com um e-mail ainda NÃO
//    confirmado substitui o anterior (só quem recebe o e-mail confirma).
// ============================================================

import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { hashPassword, normalizeEmail, verifyPasswordConstantTime } from './authService'
import {
  enviarAvisoDeCadastroRepetido,
  enviarConfirmacaoDeEmail,
  enviarRecuperacaoDeSenha,
} from './emailTransacional'
import { somenteDigitos } from '../lib/documentos'
import { TERMOS_VERSAO } from '../lib/legal'
import {
  INTERVALO_ENTRE_ENVIOS_MS,
  TipoDeToken,
  VALIDADE_DO_TOKEN,
  gerarToken,
  hashDoToken,
  tokenUtilizavel,
} from '../lib/tokensDeConta'

export const TRIAL_DIAS_PADRAO = 14

export function trialDias(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TRIAL_DIAS)
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : TRIAL_DIAS_PADRAO
}

// Emite um token novo e invalida os anteriores ainda não usados do mesmo tipo.
// Devolve null se já foi emitido um há menos de um minuto (evita spam de e-mail).
async function emitirToken(userId: string, tipo: TipoDeToken, agora = new Date()): Promise<string | null> {
  const recente = await prisma.authToken.findFirst({
    where: { userId, type: tipo, createdAt: { gt: new Date(agora.getTime() - INTERVALO_ENTRE_ENVIOS_MS) } },
    select: { id: true },
  })
  if (recente) return null

  const { token, hash } = gerarToken()
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, type: tipo, usedAt: null }, data: { usedAt: agora } }),
    prisma.authToken.create({
      data: { userId, type: tipo, tokenHash: hash, expiresAt: new Date(agora.getTime() + VALIDADE_DO_TOKEN[tipo]) },
    }),
  ])
  return token
}

// Consome um token: devolve o id do usuário, ou null se inválido/expirado/já usado.
// O "marcar como usado" é condicional (usedAt IS NULL), então dois cliques
// simultâneos no mesmo link não passam os dois.
async function consumirToken(token: string, tipo: TipoDeToken, agora = new Date()): Promise<string | null> {
  const registro = await prisma.authToken.findUnique({ where: { tokenHash: hashDoToken(token) } })
  if (!registro || registro.type !== tipo || !tokenUtilizavel(registro, agora)) return null
  const { count } = await prisma.authToken.updateMany({
    where: { id: registro.id, usedAt: null },
    data: { usedAt: agora },
  })
  return count === 1 ? registro.userId : null
}

export interface DadosDeCadastro {
  nome: string
  email: string
  senha: string
  tipo: 'PESSOA_FISICA' | 'PESSOA_JURIDICA'
  documento: string // CPF ou CNPJ, já validado
  empresaNome?: string
  telefone?: string
}

export interface ResultadoDoCadastro {
  criado: boolean
  userId?: string
  companyId?: string
  email?: string
  motivo?: 'email-existente' | 'documento-existente'
}

// Cadastro nunca confirmado: o usuário nunca entrou, então não há dados dele além
// da própria conta e da empresa vazia. Pode ser apagado com segurança.
async function apagarCadastroNaoConfirmado(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, companyId: true } })
  if (!user || user.emailVerifiedAt) return
  const outros = await prisma.user.count({ where: { companyId: user.companyId, id: { not: userId } } })
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
    ...(outros === 0 ? [prisma.company.delete({ where: { id: user.companyId } })] : []),
  ])
}

// Documento preso a um cadastro abandonado (nunca confirmado e com o link já vencido)
// não pode impedir o verdadeiro dono do CPF/CNPJ de se cadastrar.
const CADASTRO_ABANDONADO_MS = 48 * 60 * 60 * 1000

// Aviso "alguém tentou cadastrar seu e-mail": no máximo 1 por hora por destinatário,
// para o cadastro não virar ferramenta de encher a caixa de alguém.
const ultimoAvisoRepetido = new Map<string, number>()
function podeAvisarCadastroRepetido(email: string, agora = Date.now()): boolean {
  const ultimo = ultimoAvisoRepetido.get(email)
  if (ultimo !== undefined && agora - ultimo < 60 * 60 * 1000) return false
  ultimoAvisoRepetido.set(email, agora)
  if (ultimoAvisoRepetido.size > 5000) ultimoAvisoRepetido.delete(ultimoAvisoRepetido.keys().next().value as string)
  return true
}

// Cria a conta em período de teste. NÃO diz ao chamador "já existe": devolve
// `criado: false` e o motivo só para a auditoria interna. Quem responde ao
// cliente usa sempre a mesma mensagem.
export async function cadastrar(dados: DadosDeCadastro): Promise<ResultadoDoCadastro> {
  const email = normalizeEmail(dados.email)
  // O custo do bcrypt é pago SEMPRE, existindo ou não a conta: senão o tempo de
  // resposta denunciaria quais e-mails/documentos já têm cadastro.
  const passwordHash = await hashPassword(dados.senha)
  const documento = somenteDigitos(dados.documento)

  const existente = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } })
  if (existente?.emailVerifiedAt) {
    if (podeAvisarCadastroRepetido(email)) void enviarAvisoDeCadastroRepetido(email)
    return { criado: false, motivo: 'email-existente' }
  }
  // E-mail com cadastro pendente: o novo cadastro substitui o antigo (o link anterior morre).
  if (existente) await apagarCadastroNaoConfirmado(existente.id)

  const docWhere = dados.tipo === 'PESSOA_JURIDICA' ? { cnpj: documento } : { cpf: documento }
  const dono = await prisma.company.findFirst({
    where: docWhere,
    select: { users: { select: { id: true, emailVerifiedAt: true, createdAt: true } } },
  })
  if (dono) {
    const abandonado =
      dono.users.length > 0 && dono.users.every((u) => !u.emailVerifiedAt && Date.now() - u.createdAt.getTime() > CADASTRO_ABANDONADO_MS)
    if (!abandonado) return { criado: false, motivo: 'documento-existente' }
    for (const u of dono.users) await apagarCadastroNaoConfirmado(u.id)
  }

  const agora = new Date()
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: dados.nome,
        passwordHash,
        companyRole: 'OWNER',
        // O período de teste é o prazo de acesso: vencido, o login é recusado
        // até o administrador estender ou trocar o plano.
        accessExpiresAt: new Date(agora.getTime() + trialDias() * 24 * 60 * 60 * 1000),
        termsAcceptedAt: agora,
        termsVersion: TERMOS_VERSAO,
        company: {
          create: {
            tipo: dados.tipo,
            name: dados.tipo === 'PESSOA_JURIDICA' ? (dados.empresaNome ?? dados.nome) : dados.nome,
            ...docWhere,
            email,
            telefone: dados.telefone,
            responsavel: dados.nome,
            planCode: 'TESTE',
          },
        },
      },
    })

    const token = await emitirToken(user.id, 'EMAIL_VERIFY', agora)
    if (token) void enviarConfirmacaoDeEmail(email, dados.nome, token, VALIDADE_DO_TOKEN.EMAIL_VERIFY / 3_600_000)
    return { criado: true, userId: user.id, companyId: user.companyId, email }
  } catch (err) {
    // Corrida: outra requisição criou o mesmo e-mail/documento entre a checagem e o insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { criado: false, motivo: 'email-existente' }
    }
    throw err
  }
}

export async function reenviarConfirmacao(emailBruto: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailBruto) } })
  if (!user || !user.active || user.emailVerifiedAt) return
  const token = await emitirToken(user.id, 'EMAIL_VERIFY')
  if (token) void enviarConfirmacaoDeEmail(user.email, user.name, token, VALIDADE_DO_TOKEN.EMAIL_VERIFY / 3_600_000)
}

// Confirma o e-mail. Exige a senha escolhida no cadastro (ver "pré-sequestro" no topo).
// Senha errada NÃO consome o link: a pessoa pode tentar de novo.
export async function confirmarEmail(
  token: string,
  senha: string
): Promise<{ userId: string; companyId: string } | { erro: 'link' | 'senha' }> {
  const registro = await prisma.authToken.findUnique({ where: { tokenHash: hashDoToken(token) } })
  if (!registro || registro.type !== 'EMAIL_VERIFY' || !tokenUtilizavel(registro, new Date())) return { erro: 'link' }
  const dono = await prisma.user.findUnique({ where: { id: registro.userId }, select: { passwordHash: true } })
  if (!(await verifyPasswordConstantTime(senha, dono?.passwordHash ?? null))) return { erro: 'senha' }

  const userId = await consumirToken(token, 'EMAIL_VERIFY')
  if (!userId) return { erro: 'link' }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { erro: 'link' }
  if (!user.emailVerifiedAt) await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  return { userId, companyId: user.companyId }
}

export async function solicitarRecuperacao(emailBruto: string): Promise<{ userId: string; companyId: string } | null> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailBruto) } })
  if (!user || !user.active) return null
  const token = await emitirToken(user.id, 'PASSWORD_RESET')
  if (token) void enviarRecuperacaoDeSenha(user.email, token, VALIDADE_DO_TOKEN.PASSWORD_RESET / 60_000)
  return token ? { userId: user.id, companyId: user.companyId } : null
}

export async function redefinirSenha(
  token: string,
  novaSenha: string
): Promise<{ userId: string; companyId: string } | null> {
  const userId = await consumirToken(token, 'PASSWORD_RESET')
  if (!userId) return null
  const passwordHash = await hashPassword(novaSenha)
  const antes = await prisma.user.findUnique({ where: { id: userId } })
  if (!antes || !antes.active) return null

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Derruba todas as sessões abertas: se alguém roubou a conta, perde o acesso.
        tokenVersion: { increment: 1 },
        // Receber o link no e-mail prova que a pessoa controla o endereço.
        emailVerifiedAt: antes.emailVerifiedAt ?? new Date(),
      },
    }),
    // Outros links de recuperação pendentes deixam de valer.
    prisma.authToken.updateMany({ where: { userId, type: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: new Date() } }),
  ])
  return { userId, companyId: antes.companyId }
}
