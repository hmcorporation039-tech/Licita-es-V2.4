import QRCode from 'qrcode'
import { prisma } from './tenderService'
import { ApiError } from '../api/asyncHandler'
import { avisarAdministrador } from './alertaOperacional'
import {
  cifrarSegredo,
  decifrarSegredo,
  enderecoDoAutenticador,
  gerarCodigosDeRecuperacao,
  gerarSegredo,
  pareceCodigoDeRecuperacao,
  passoDoCodigoValido,
  resumoDoCodigoDeRecuperacao,
  resumoQueConfere,
  segredoAgrupado,
} from '../lib/segundoFator'

export type ConferenciaDoSegundoFator =
  | { ok: true; via: 'aplicativo' | 'recuperacao'; codigosRestantes: number }
  | { ok: false }

interface UsuarioComSegundoFator {
  id: string
  email: string
  totpSegredo: string | null
  totpAtivadoEm: Date | null
  totpUltimoPasso: number | null
  totpCodigosDeRecuperacao: string[]
}

function segredoDoServidor(): string {
  const segredo = process.env.JWT_SECRET
  if (!segredo) throw new Error('JWT_SECRET não configurado no .env')
  return segredo
}

export function segundoFatorAtivo(user: { totpAtivadoEm: Date | null; totpSegredo: string | null }): boolean {
  return Boolean(user.totpAtivadoEm && user.totpSegredo)
}

export async function situacaoDoSegundoFator(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true, totpAtivadoEm: true, totpSegredo: true, totpCodigosDeRecuperacao: true },
  })
  return {
    disponivel: user.isAdmin,
    ativo: segundoFatorAtivo(user),
    ativadoEm: user.totpAtivadoEm,
    codigosDeRecuperacaoRestantes: user.totpCodigosDeRecuperacao.length,
  }
}

export async function prepararAplicativo(userId: string, email: string) {
  const segredo = gerarSegredo()
  const endereco = enderecoDoAutenticador(email, segredo)
  await prisma.user.update({ where: { id: userId }, data: { totpSegredoNovo: cifrarSegredo(segredo, segredoDoServidor()) } })
  return {
    segredo: segredoAgrupado(segredo),
    endereco,
    qrCodeSvg: await QRCode.toString(endereco, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }),
  }
}

export async function ativarAplicativo(userId: string, codigo: string, agora = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSegredoNovo: true, totpAtivadoEm: true } })
  if (!user.totpSegredoNovo) throw new ApiError(409, 'Comece de novo: leia o QR code no aplicativo e digite o código que aparecer.')
  const segredo = decifrarSegredo(user.totpSegredoNovo, segredoDoServidor())
  const passo = passoDoCodigoValido(segredo, codigo, agora, null)
  if (passo === null) {
    throw new ApiError(400, 'Código incorreto. Confira se o horário do celular está automático e digite o código que está aparecendo agora.', { code: 'SEGUNDO_FATOR_INCORRETO' })
  }
  const codigosDeRecuperacao = gerarCodigosDeRecuperacao()
  const atualizado = await prisma.user.update({
    where: { id: userId },
    data: {
      totpSegredo: user.totpSegredoNovo,
      totpSegredoNovo: null,
      totpAtivadoEm: agora,
      totpUltimoPasso: passo,
      totpCodigosDeRecuperacao: codigosDeRecuperacao.map(resumoDoCodigoDeRecuperacao),
      tokenVersion: { increment: 1 },
    },
    select: { tokenVersion: true },
  })
  return { tokenVersion: atualizado.tokenVersion, codigosDeRecuperacao, trocouDeAparelho: Boolean(user.totpAtivadoEm) }
}

export async function conferirSegundoFator(user: UsuarioComSegundoFator, codigo: string, agora = new Date()): Promise<ConferenciaDoSegundoFator> {
  if (!user.totpSegredo || !user.totpAtivadoEm) return { ok: false }
  if (pareceCodigoDeRecuperacao(codigo)) {
    const resumo = resumoQueConfere(codigo, user.totpCodigosDeRecuperacao)
    if (!resumo) return { ok: false }
    const restantes = await prisma.$queryRaw<{ restantes: number }[]>`
      UPDATE "users"
      SET "totp_codigos_de_recuperacao" = array_remove("totp_codigos_de_recuperacao", ${resumo}), "updated_at" = NOW()
      WHERE "id" = ${user.id} AND ${resumo} = ANY("totp_codigos_de_recuperacao")
      RETURNING cardinality("totp_codigos_de_recuperacao") AS restantes`
    if (restantes.length === 0) return { ok: false }
    const codigosRestantes = Number(restantes[0].restantes)
    void avisarAdministrador(
      `segundo-fator-recuperacao|${user.id}|${agora.getTime()}`,
      'Código de recuperação usado no login em duas etapas',
      `A conta ${user.email} entrou com um código de recuperação em ${agora.toISOString()}. Restam ${codigosRestantes} códigos. Se não foi você, troque a senha e o aparelho do login em duas etapas agora.`
    )
    return { ok: true, via: 'recuperacao', codigosRestantes }
  }
  const segredo = decifrarSegredo(user.totpSegredo, segredoDoServidor())
  const passo = passoDoCodigoValido(segredo, codigo, agora, user.totpUltimoPasso)
  if (passo === null) return { ok: false }
  const gravado = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ totpUltimoPasso: null }, { totpUltimoPasso: { lt: passo } }] },
    data: { totpUltimoPasso: passo },
  })
  if (gravado.count === 0) return { ok: false }
  return { ok: true, via: 'aplicativo', codigosRestantes: user.totpCodigosDeRecuperacao.length }
}

export async function usuarioParaConferir(userId: string): Promise<UsuarioComSegundoFator> {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, totpSegredo: true, totpAtivadoEm: true, totpUltimoPasso: true, totpCodigosDeRecuperacao: true },
  })
}

export async function renovarCodigosDeRecuperacao(userId: string): Promise<string[]> {
  const codigos = gerarCodigosDeRecuperacao()
  await prisma.user.update({ where: { id: userId }, data: { totpCodigosDeRecuperacao: codigos.map(resumoDoCodigoDeRecuperacao) } })
  return codigos
}

export async function desligarSegundoFator(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSegredo: null,
      totpSegredoNovo: null,
      totpAtivadoEm: null,
      totpUltimoPasso: null,
      totpCodigosDeRecuperacao: [],
      tokenVersion: { increment: 1 },
    },
  })
}
