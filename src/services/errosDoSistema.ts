import { prisma } from './tenderService'
import { semSegredos } from './alertaOperacional'
import { DIAS_DE_GUARDA_DOS_ERROS, JANELA_DOS_ERROS_DO_CHAMADO_MS, cortar, rotaSemConsulta, versaoDoSistema, type OrigemDoErro } from '../lib/suporte'

const MAX_ERROS_POR_MINUTO = 60
let janelaAtual = { inicio: 0, gravados: 0 }

export interface ErroParaRegistrar {
  origem: OrigemDoErro
  mensagem: string
  pilha?: string | null
  codigoDeRastreio?: string | null
  metodo?: string | null
  rota?: string | null
  status?: number | null
  tela?: string | null
  navegador?: string | null
  userId?: string | null
  companyId?: string | null
}

function cabeNaJanela(agora: number): boolean {
  if (agora - janelaAtual.inicio >= 60_000) janelaAtual = { inicio: agora, gravados: 0 }
  janelaAtual.gravados++
  return janelaAtual.gravados <= MAX_ERROS_POR_MINUTO
}

export function textoDaFalha(err: unknown): { mensagem: string; pilha: string | null } {
  if (err instanceof Error) return { mensagem: `${err.name}: ${err.message}`, pilha: err.stack?.split('\n').slice(1, 15).join('\n') ?? null }
  return { mensagem: String(err), pilha: null }
}

export async function registrarErro(erro: ErroParaRegistrar, agora: Date = new Date()): Promise<string | null> {
  try {
    if (!cabeNaJanela(agora.getTime())) return null
    const salvo = await prisma.erroDoSistema.create({
      data: {
        origem: erro.origem,
        mensagem: cortar(semSegredos(erro.mensagem), 2000) ?? 'Erro sem mensagem',
        pilha: cortar(erro.pilha ? semSegredos(erro.pilha) : null, 6000),
        codigoDeRastreio: cortar(erro.codigoDeRastreio, 64),
        metodo: cortar(erro.metodo, 10),
        rota: erro.rota ? rotaSemConsulta(erro.rota) : null,
        status: erro.status ?? null,
        tela: erro.tela ? rotaSemConsulta(erro.tela) : null,
        navegador: cortar(erro.navegador, 300),
        versao: versaoDoSistema(),
        userId: erro.userId ?? null,
        companyId: erro.companyId ?? null,
        createdAt: agora,
      },
      select: { id: true },
    })
    return salvo.id
  } catch (err) {
    console.error('[Erros do sistema] Falha ao guardar o erro:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function errosDoChamado(chamado: { userId: string | null; createdAt: Date; codigos: string[] }) {
  const perto = chamado.userId
    ? { userId: chamado.userId, createdAt: { gte: new Date(chamado.createdAt.getTime() - JANELA_DOS_ERROS_DO_CHAMADO_MS), lte: new Date(chamado.createdAt.getTime() + 5 * 60 * 1000) } }
    : null
  const filtros = [...(chamado.codigos.length > 0 ? [{ codigoDeRastreio: { in: chamado.codigos } }] : []), ...(perto ? [perto] : [])]
  if (filtros.length === 0) return []
  return prisma.erroDoSistema.findMany({
    where: { OR: filtros },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, origem: true, codigoDeRastreio: true, metodo: true, rota: true, status: true, mensagem: true, pilha: true, tela: true, navegador: true, versao: true, createdAt: true },
  })
}

export async function apagarErrosAntigos(agora: Date = new Date()): Promise<{ apagados: number }> {
  const { count } = await prisma.erroDoSistema.deleteMany({ where: { createdAt: { lt: new Date(agora.getTime() - DIAS_DE_GUARDA_DOS_ERROS * 24 * 60 * 60 * 1000) } } })
  return { apagados: count }
}
