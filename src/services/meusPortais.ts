import { prisma } from './tenderService'
import { ApiError } from '../api/asyncHandler'
import { chavesDoAmbiente, cifrar, decifrar, type ChaveVersionada } from '../lib/cofreDeCredenciais'
import { mascararLogin, portalPorId } from '../lib/portais'

interface Chaves {
  atual: ChaveVersionada
  todas: ChaveVersionada[]
}

export async function listarCredenciais(companyId: string) {
  const todas = await prisma.portalCredencial.findMany({
    where: { companyId },
    orderBy: { portal: 'asc' },
  })
  return todas.map((c) => ({
    id: c.id,
    portal: c.portal,
    login: mascararLogin(c.login),
    temConsentimento: c.consentimentoEm !== null,
    ultimoTesteEm: c.ultimoTesteEm,
    ultimoTesteOk: c.ultimoTesteOk,
    atualizadoEm: c.updatedAt,
  }))
}

export async function salvarCredencial(
  companyId: string,
  entrada: { portal: string; login: string; senha: string; consentimentoTexto: string },
  chaves: Chaves = chavesDoAmbiente(),
): Promise<{ id: string; portal: string }> {
  if (!portalPorId(entrada.portal)) throw new ApiError(400, 'Portal não suportado.')
  const senhaCifrada = cifrar(entrada.senha, chaves.atual)
  const comum = {
    login: entrada.login,
    senhaCifrada,
    chaveVersao: chaves.atual.versao,
    consentimentoEm: new Date(),
    consentimentoTexto: entrada.consentimentoTexto,
    ultimoTesteEm: null,
    ultimoTesteOk: null,
  }
  const salvo = await prisma.portalCredencial.upsert({
    where: { companyId_portal: { companyId, portal: entrada.portal } },
    create: { companyId, portal: entrada.portal, ...comum },
    update: comum,
  })
  return { id: salvo.id, portal: salvo.portal }
}

export async function removerCredencial(companyId: string, id: string): Promise<void> {
  const resultado = await prisma.portalCredencial.deleteMany({ where: { id, companyId } })
  if (resultado.count === 0) throw new ApiError(404, 'Credencial não encontrada.')
}

export async function senhaDaCredencial(companyId: string, id: string, chaves: Chaves = chavesDoAmbiente()): Promise<string> {
  const credencial = await prisma.portalCredencial.findFirst({ where: { id, companyId } })
  if (!credencial) throw new ApiError(404, 'Credencial não encontrada.')
  return decifrar(Buffer.from(credencial.senhaCifrada), chaves.todas)
}
