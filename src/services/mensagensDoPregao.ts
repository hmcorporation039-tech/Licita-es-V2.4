// ============================================================
// services/mensagensDoPregao.ts — Monitor do chat do pregoeiro.
//
// A extensão da Bela lê as mensagens do chat na sala de disputa que o cliente
// já tem aberta e manda para cá. Aqui elas são classificadas, gravadas sem
// repetição e, se a empresa foi chamada (ou a sessão mudou), viram aviso no
// celular de quem está acompanhando.
// ============================================================

import { prisma } from './tenderService'
import { enviarNoCelular } from './notificacaoNoCelular'
import { chaveDaMensagem, classificarMensagem, ROTULO_DA_CATEGORIA, type CategoriaDaMensagem } from '../lib/bela/mensagemDoPregoeiro'

export interface MensagemRecebida {
  texto: string
  autor?: string | null
  horaNoPortal?: string | null
}

export interface MensagemNaTela {
  id: string
  autor: string | null
  texto: string
  categoria: CategoriaDaMensagem
  rotulo: string
  citaAEmpresa: boolean
  urgente: boolean
  lida: boolean
  createdAt: Date
}

export const MAX_MENSAGENS_POR_ENVIO = 50
export const MAX_MENSAGENS_POR_PREGAO = 3000
const TAM_MAXIMO_DO_TEXTO = 2000

function naTela(m: { id: string; autor: string | null; texto: string; categoria: string; citaAEmpresa: boolean; urgente: boolean; lidaEm: Date | null; createdAt: Date }): MensagemNaTela {
  const categoria = (m.categoria in ROTULO_DA_CATEGORIA ? m.categoria : 'AVISO') as CategoriaDaMensagem
  return { id: m.id, autor: m.autor, texto: m.texto, categoria, rotulo: ROTULO_DA_CATEGORIA[categoria], citaAEmpresa: m.citaAEmpresa, urgente: m.urgente, lida: m.lidaEm !== null, createdAt: m.createdAt }
}

async function acompanhamentoDe(companyId: string, tenderId: string) {
  return prisma.pregaoAcompanhamento.upsert({
    where: { companyId_tenderId: { companyId, tenderId } },
    update: {},
    create: { companyId, tenderId },
    select: { id: true },
  })
}

export async function registrarMensagens(args: {
  companyId: string
  userId: string
  tenderId: string
  mensagens: MensagemRecebida[]
  avisar?: typeof enviarNoCelular
}): Promise<{ novas: number; urgentes: number }> {
  const acompanhamento = await acompanhamentoDe(args.companyId, args.tenderId)
  const total = await prisma.pregaoMensagem.count({ where: { acompanhamentoId: acompanhamento.id } })
  const espaco = Math.max(0, MAX_MENSAGENS_POR_PREGAO - total)
  const empresa = await prisma.company.findUnique({ where: { id: args.companyId }, select: { cnpj: true, name: true } })
  const nomes = [empresa?.name].filter((n): n is string => !!n && !n.includes('@'))

  let novas = 0
  const urgentes: { categoria: CategoriaDaMensagem; texto: string }[] = []
  for (const m of args.mensagens.slice(0, Math.min(MAX_MENSAGENS_POR_ENVIO, espaco))) {
    const texto = m.texto.replace(/\s+/g, ' ').trim().slice(0, TAM_MAXIMO_DO_TEXTO)
    if (!texto) continue
    const autor = m.autor?.replace(/\s+/g, ' ').trim().slice(0, 120) || null
    const c = classificarMensagem(texto, { cnpj: empresa?.cnpj, nomes })
    const criada = await prisma.pregaoMensagem.createMany({
      data: [{ acompanhamentoId: acompanhamento.id, chave: chaveDaMensagem(autor, texto, m.horaNoPortal), autor, texto, categoria: c.categoria, citaAEmpresa: c.citaAEmpresa, urgente: c.urgente }],
      skipDuplicates: true,
    })
    if (criada.count === 0) continue
    novas++
    if (c.urgente) urgentes.push({ categoria: c.categoria, texto })
  }

  if (urgentes.length > 0) {
    const tender = await prisma.tender.findUnique({ where: { id: args.tenderId }, select: { orgao: true, numeroControle: true } })
    const primeira = urgentes[0]
    const onde = [tender?.orgao, tender?.numeroControle].filter(Boolean).join(' · ')
    await (args.avisar ?? enviarNoCelular)(
      args.userId,
      {
        titulo: `${ROTULO_DA_CATEGORIA[primeira.categoria]} no pregão${urgentes.length > 1 ? ` (+${urgentes.length - 1})` : ''}`,
        corpo: `${onde ? onde + ': ' : ''}${primeira.texto.slice(0, 160)}`,
        url: `/tenders/${args.tenderId}/pregao`,
        tag: `chat-pregoeiro-${args.tenderId}`,
      },
      { urgente: true }
    ).catch(() => undefined)
  }
  return { novas, urgentes: urgentes.length }
}

export async function mensagensDoPregao(companyId: string, tenderId: string, limite = 200): Promise<{ mensagens: MensagemNaTela[]; naoLidas: number }> {
  const acompanhamento = await prisma.pregaoAcompanhamento.findUnique({ where: { companyId_tenderId: { companyId, tenderId } }, select: { id: true } })
  if (!acompanhamento) return { mensagens: [], naoLidas: 0 }
  const [linhas, naoLidas] = await Promise.all([
    prisma.pregaoMensagem.findMany({ where: { acompanhamentoId: acompanhamento.id }, orderBy: { createdAt: 'desc' }, take: limite }),
    prisma.pregaoMensagem.count({ where: { acompanhamentoId: acompanhamento.id, lidaEm: null } }),
  ])
  return { mensagens: linhas.map(naTela), naoLidas }
}

export async function marcarComoLidas(companyId: string, tenderId: string, agora = new Date()): Promise<number> {
  const acompanhamento = await prisma.pregaoAcompanhamento.findUnique({ where: { companyId_tenderId: { companyId, tenderId } }, select: { id: true } })
  if (!acompanhamento) return 0
  const { count } = await prisma.pregaoMensagem.updateMany({ where: { acompanhamentoId: acompanhamento.id, lidaEm: null }, data: { lidaEm: agora } })
  return count
}

// "Minhas sessões": pregões que a empresa acompanha e ainda não encerrou, com o
// chat de cada um (mensagens não lidas e a mais recente).
export async function minhasSessoes(companyId: string) {
  const acompanhamentos = await prisma.pregaoAcompanhamento.findMany({
    where: { companyId, encerradoEm: null },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      tenderId: true,
      updatedAt: true,
      tender: { select: { objeto: true, objetoResumido: true, orgao: true, numeroControle: true, aberturaAt: true, encerramentoAt: true, fonte: true } },
    },
  })
  const ids = acompanhamentos.map((a) => a.id)
  const [naoLidas, urgentes, ultimas] = await Promise.all([
    prisma.pregaoMensagem.groupBy({ by: ['acompanhamentoId'], where: { acompanhamentoId: { in: ids }, lidaEm: null }, _count: { _all: true } }),
    prisma.pregaoMensagem.groupBy({ by: ['acompanhamentoId'], where: { acompanhamentoId: { in: ids }, lidaEm: null, urgente: true }, _count: { _all: true } }),
    Promise.all(ids.map((id) => prisma.pregaoMensagem.findFirst({ where: { acompanhamentoId: id }, orderBy: { createdAt: 'desc' } }))),
  ])
  const contagem = (lista: { acompanhamentoId: string; _count: { _all: number } }[], id: string) => lista.find((l) => l.acompanhamentoId === id)?._count._all ?? 0
  return acompanhamentos
    .map((a, i) => ({
      tenderId: a.tenderId,
      objeto: a.tender.objetoResumido ?? a.tender.objeto.slice(0, 200),
      orgao: a.tender.orgao,
      numeroControle: a.tender.numeroControle,
      fonte: a.tender.fonte,
      sessaoEm: a.tender.aberturaAt ?? a.tender.encerramentoAt,
      naoLidas: contagem(naoLidas, a.id),
      urgentes: contagem(urgentes, a.id),
      ultimaMensagem: ultimas[i] ? naTela(ultimas[i]!) : null,
      atualizadoEm: a.updatedAt,
    }))
    .sort((x, y) => y.urgentes - x.urgentes || y.naoLidas - x.naoLidas || (y.ultimaMensagem?.createdAt.getTime() ?? 0) - (x.ultimaMensagem?.createdAt.getTime() ?? 0))
}
