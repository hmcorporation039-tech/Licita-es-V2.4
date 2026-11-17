// ============================================================
// services/funilDeVendas.ts — Dados do painel "Funil" do administrador
// (GET /api/admin/funil). Só leitura. Uma consulta pelos cadastros do período
// e consultas agrupadas por empresa para os sinais de uso, pagamento e última
// atividade — nada de uma consulta por cadastro.
//
// Sinais usados:
// - cadastro: usuário criado pelo cadastro público (ver ehCadastroPublico);
// - e-mail confirmado: User.emailVerifiedAt preenchido;
// - usou o sistema: a empresa criou um item monitorado além do automático do
//   interesse, favoritou licitação, abriu plano de participação, perguntou ao
//   edital ou pediu análise de edital (ver usouOSistema);
// - pagante: a empresa tem Assinatura com status ATIVA (pagamento confirmado),
//   no ambiente do Asaas configurado, quando houver um.
// ============================================================

import { prisma } from './tenderService'
import { configuracaoDoAsaas } from '../lib/cobranca'
import {
  MAXIMO_DE_CONTATOS,
  ehCadastroPublico,
  lerOrigem,
  linkDoWhatsApp,
  montarFunil,
  usouOSistema,
  type PeriodoDoFunil,
} from '../lib/funilDeVendas'

// Teto de segurança: o período mais longo (90 dias) cabe com folga.
const MAXIMO_DE_CADASTROS = 5000
const DIA_MS = 24 * 60 * 60 * 1000

// Eventos que acontecem no cadastro/confirmação, sem a pessoa usar o sistema.
const EVENTOS_DO_CADASTRO = ['CADASTRO_CRIADO', 'CADASTRO_RECUSADO', 'CADASTRO_MESMO_IP', 'CODIGO_ENVIADO', 'CODIGO_INCORRETO', 'CODIGO_BLOQUEADO']

type ContagemPorEmpresa = Map<string, { n: number; ultima: Date | null }>

function porEmpresa(linhas: Array<{ companyId: string | null; _count: { _all: number }; _max: { createdAt?: Date | null; updatedAt?: Date | null } }>): ContagemPorEmpresa {
  const m: ContagemPorEmpresa = new Map()
  for (const l of linhas) {
    if (!l.companyId) continue
    const datas = [l._max.createdAt, l._max.updatedAt].filter((d): d is Date => d instanceof Date)
    m.set(l.companyId, { n: l._count._all, ultima: datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null })
  }
  return m
}

function maisRecente(...datas: Array<Date | null | undefined>): Date | null {
  const validas = datas.filter((d): d is Date => d instanceof Date)
  return validas.length ? new Date(Math.max(...validas.map((d) => d.getTime()))) : null
}

export async function funilDeVendas(dias: PeriodoDoFunil, agora: Date = new Date()) {
  const desde = new Date(agora.getTime() - dias * DIA_MS)

  const candidatos = await prisma.user.findMany({
    where: { createdAt: { gte: desde }, isAdmin: false, companyRole: 'OWNER', termsAcceptedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: MAXIMO_DE_CADASTROS,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      termsAcceptedAt: true,
      emailVerifiedAt: true,
      accessExpiresAt: true,
      company: { select: { id: true, name: true, tipo: true, telefone: true, planCode: true, origemDoCadastro: true } },
    },
  })
  const cadastros = candidatos.filter(ehCadastroPublico)
  const empresas = [...new Set(cadastros.map((c) => c.company.id))]
  const usuarios = cadastros.map((c) => c.id)
  const daEmpresa = { companyId: { in: empresas } }

  const ambiente = configuracaoDoAsaas()?.ambiente
  // Listas vazias (`in: []`) simplesmente não devolvem nada.
  const [itens, favoritos, planos, perguntas, analises, assinaturas, auditoria] = await Promise.all([
    prisma.monitoredItem.groupBy({ by: ['companyId'], where: daEmpresa, _count: { _all: true }, _max: { createdAt: true, updatedAt: true } }),
    prisma.tenderFavorito.groupBy({ by: ['companyId'], where: daEmpresa, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.tenderParticipationPlan.groupBy({ by: ['companyId'], where: daEmpresa, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.editalPergunta.groupBy({ by: ['companyId'], where: daEmpresa, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.aiUsage.groupBy({ by: ['companyId'], where: { ...daEmpresa, etapa: 'analise' }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.assinatura.findMany({ where: { ...daEmpresa, status: 'ATIVA', ...(ambiente ? { ambiente } : {}) }, select: { companyId: true }, distinct: ['companyId'] }),
    prisma.auditLog.groupBy({ by: ['actorUserId'], where: { actorUserId: { in: usuarios }, action: { notIn: EVENTOS_DO_CADASTRO } }, _max: { createdAt: true } }),
  ])

  const mItens = porEmpresa(itens)
  const mFavoritos = porEmpresa(favoritos)
  const mPlanos = porEmpresa(planos)
  const mPerguntas = porEmpresa(perguntas)
  const mAnalises = porEmpresa(analises)
  const pagantes = new Set(assinaturas.map((a) => a.companyId))
  const ultimoEvento = new Map(auditoria.map((a) => [a.actorUserId, a._max.createdAt]))

  const linhas = cadastros.map((c) => {
    const empresa = c.company.id
    const origem = lerOrigem(c.company.origemDoCadastro)
    const usou = usouOSistema({
      itensMonitorados: mItens.get(empresa)?.n ?? 0,
      temInteresseNoCadastro: origem.interesse !== null,
      favoritos: mFavoritos.get(empresa)?.n ?? 0,
      planosDeParticipacao: mPlanos.get(empresa)?.n ?? 0,
      perguntasAoEdital: mPerguntas.get(empresa)?.n ?? 0,
      analisesPedidas: mAnalises.get(empresa)?.n ?? 0,
    })
    const ultimaAtividade = maisRecente(
      ultimoEvento.get(c.id),
      mFavoritos.get(empresa)?.ultima,
      mPlanos.get(empresa)?.ultima,
      mPerguntas.get(empresa)?.ultima,
      mAnalises.get(empresa)?.ultima,
      usou ? mItens.get(empresa)?.ultima : null
    )
    return { c, origem, usou, pagante: pagantes.has(empresa), ultimaAtividade }
  })

  const funil = montarFunil(
    linhas.map((l) => ({ criadoEm: l.c.createdAt, emailConfirmado: l.c.emailVerifiedAt != null, usou: l.usou, pagante: l.pagante, origem: l.origem })),
    desde,
    agora
  )

  return {
    dias,
    desde: desde.toISOString(),
    ate: agora.toISOString(),
    ...funil,
    contatosOmitidos: Math.max(0, linhas.length - MAXIMO_DE_CONTATOS),
    contatos: linhas.slice(0, MAXIMO_DE_CONTATOS).map(({ c, origem, usou, pagante, ultimaAtividade }) => ({
      userId: c.id,
      companyId: c.company.id,
      nome: c.name,
      email: c.email,
      telefone: c.company.telefone,
      whatsapp: linkDoWhatsApp(c.company.telefone),
      empresa: c.company.name,
      tipoDeDocumento: c.company.tipo === 'PESSOA_JURIDICA' ? ('CNPJ' as const) : ('CPF' as const),
      plano: c.company.planCode,
      testeAte: c.accessExpiresAt?.toISOString() ?? null,
      cadastradoEm: c.createdAt.toISOString(),
      origem: { fonte: origem.fonte, meio: origem.meio, campanha: origem.campanha, termo: origem.termo, anuncioDoGoogle: origem.anuncioDoGoogle },
      interesse: origem.interesse,
      emailConfirmado: c.emailVerifiedAt != null,
      usou,
      pagante,
      ultimaAtividade: ultimaAtividade?.toISOString() ?? null,
    })),
  }
}

export type FunilDeVendas = Awaited<ReturnType<typeof funilDeVendas>>
