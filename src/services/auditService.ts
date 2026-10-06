// ============================================================
// services/auditService.ts — Trilha de auditoria: quem fez o quê, quando e
// de onde. Gravação NUNCA derruba a operação que está sendo auditada (falha
// vira log), e nunca recebe senha/token — por isso o metadata é filtrado.
// ============================================================

import type { Request } from 'express'
import { prisma } from './tenderService'

export const ACOES = [
  'LOGIN_OK',
  'LOGIN_FALHA',
  'LOGOUT',
  'SENHA_ALTERADA',
  'USUARIO_CRIADO',
  'USUARIO_ALTERADO',
  'SENHA_REDEFINIDA_ADMIN',
  'MEMBRO_CRIADO',
  'MEMBRO_ALTERADO',
  'EMPRESA_ALTERADA',
  'ITEM_MONITORADO_CRIADO',
  'ITEM_MONITORADO_ALTERADO',
  'ITEM_MONITORADO_REMOVIDO',
  'DOCUMENTO_CRIADO',
  'DOCUMENTO_ALTERADO',
  'DOCUMENTO_REMOVIDO',
  'ANALISE_SOLICITADA',
  'PARTICIPACAO_STATUS',
  'PLANO_EMPRESA_ALTERADO',
  'PLANO_ALTERADO',
  'ADMIN_CONSULTOU_EMPRESA',
  'ADMIN_EXPORTOU_AUDITORIA',
  'COTA_EXCEDIDA',
  'CADASTRO_CRIADO',
  'CADASTRO_RECUSADO',
  'EMAIL_VERIFICADO',
  'RECUPERACAO_SOLICITADA',
  'SENHA_REDEFINIDA_POR_EMAIL',
  'ADMIN_EMAIL_CONFIRMADO',
  'EXIGENCIA_ATUALIZADA',
  'DADOS_EXPORTADOS',
  'MATCHES_APAGADOS',
  'CODIGO_ENVIADO',
  'CODIGO_INCORRETO',
  'CODIGO_BLOQUEADO',
  'ESTUDO_SALVO',
  'ESTUDO_PDF_GERADO',
  'EXCLUSAO_SOLICITADA',
  'EMPRESA_EXCLUIDA',
] as const
export type AcaoAuditoria = (typeof ACOES)[number]

export interface EntradaAuditoria {
  action: AcaoAuditoria
  entityType?: string
  entityId?: string
  companyId?: string | null
  metadata?: Record<string, unknown>
}

const CHAVES_PROIBIDAS = /senha|password|token|secret|hash|authorization/i
const MAX_TEXTO = 500

// Remove qualquer chave que pareça segredo e limita o tamanho dos textos.
export function limparMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (CHAVES_PROIBIDAS.test(k)) continue
    if (typeof v === 'string') out[k] = v.length > MAX_TEXTO ? v.slice(0, MAX_TEXTO) + '…' : v
    else if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (Array.isArray(v)) out[k] = v.slice(0, 50).map((x) => (typeof x === 'string' ? x.slice(0, 200) : x))
    else if (typeof v === 'object') out[k] = limparMetadata(v as Record<string, unknown>)
  }
  return out
}

export async function registrarAuditoria(
  req: Request | null,
  entrada: EntradaAuditoria,
  ator?: { userId?: string | null; email?: string | null }
): Promise<void> {
  try {
    let email = ator?.email ?? null
    const userId = ator?.userId ?? req?.userId ?? null
    // O e-mail do ator vem do banco só quando não foi informado (o authMiddleware
    // guarda apenas o id) — uma consulta barata por ação auditada.
    if (!email && userId) {
      email = (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null
    }
    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        actorEmail: email,
        companyId: entrada.companyId !== undefined ? entrada.companyId : (req?.companyId ?? null),
        action: entrada.action,
        entityType: entrada.entityType,
        entityId: entrada.entityId,
        metadata: limparMetadata(entrada.metadata) as object | undefined,
        ip: req?.ip ?? null,
        userAgent: req?.header('user-agent')?.slice(0, 300) ?? null,
      },
    })
  } catch (err) {
    console.error('[Auditoria] Falha ao gravar o registro:', err instanceof Error ? err.message : err)
  }
}
