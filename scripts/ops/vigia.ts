import { Prisma, PrismaClient } from '@prisma/client'
import {
  alvosComMuitasFalhas,
  classificarEndereco,
  enderecosNovosPorAtor,
  houveSalto,
  ipsComMuitasFalhas,
  Severidade,
  severidadeGeral,
} from '../../src/lib/vigiaDeSeguranca'

type Secao = { titulo: string; severidade: Severidade; linhas: string[] }

const SELOS: Record<Severidade, string> = { critico: '🔴', atencao: '🟡', ok: '🟢' }

function inteiroDoAmbiente(nome: string, padrao: number): number {
  const valor = Number(process.env[nome])
  return Number.isFinite(valor) && valor > 0 ? valor : padrao
}

async function main() {
  const horas = inteiroDoAmbiente('VIGIA_HORAS', 24)
  const adminsEsperados = inteiroDoAmbiente('VIGIA_ADMINS_ESPERADOS', 3)
  const limiteFalhasIp = inteiroDoAmbiente('VIGIA_FALHAS_IP', 10)
  const limiteFalhasAlvo = inteiroDoAmbiente('VIGIA_FALHAS_ALVO', 8)
  const pisoErros = inteiroDoAmbiente('VIGIA_PISO_ERROS', 30)
  const comoJson = process.argv.includes('--json')

  const agora = new Date()
  const desde = new Date(agora.getTime() - horas * 60 * 60 * 1000)
  const inicioAnterior = new Date(desde.getTime() - horas * 60 * 60 * 1000)

  const url = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Defina BACKUP_DATABASE_URL (scripts/ops/.env.backup) ou DATABASE_URL')
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  const secoes: Secao[] = []

  try {
    await prisma.$executeRawUnsafe('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')

    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { email: true, createdAt: true, active: true },
      orderBy: { createdAt: 'asc' },
    })
    const emailsAdmin = admins.map((a) => a.email.toLowerCase())
    const adminsNovos = admins.filter((a) => a.createdAt >= desde)
    const secaoAdmin: Secao = { titulo: 'Contas administradoras', severidade: 'ok', linhas: [] }
    secaoAdmin.linhas.push(`${admins.length} admin(s); esperado ${adminsEsperados}.`)
    for (const a of admins) {
      secaoAdmin.linhas.push(`- ${a.email} — criado ${a.createdAt.toISOString().slice(0, 10)}${a.active ? '' : ' (inativo)'}`)
    }
    if (adminsNovos.length > 0) {
      secaoAdmin.severidade = 'critico'
      secaoAdmin.linhas.push(`! ${adminsNovos.length} admin(s) criado(s) na janela: ${adminsNovos.map((a) => a.email).join(', ')}`)
    } else if (admins.length > adminsEsperados) {
      secaoAdmin.severidade = 'atencao'
      secaoAdmin.linhas.push('! Mais admins do que o esperado — confira se algum foi promovido.')
    }
    secoes.push(secaoAdmin)

    const acoesSensiveis = ['USUARIO_CRIADO', 'USUARIO_ALTERADO', 'PLANO_ALTERADO', 'PLANO_EMPRESA_ALTERADO', 'SENHA_REDEFINIDA_ADMIN', 'ADMIN_EXPORTOU_AUDITORIA']
    const sensiveis = await prisma.auditLog.findMany({
      where: { createdAt: { gte: desde }, action: { in: acoesSensiveis } },
      select: { action: true, actorEmail: true, ip: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const secaoSensiveis: Secao = { titulo: 'Ações sensíveis no período', severidade: sensiveis.length > 0 ? 'atencao' : 'ok', linhas: [] }
    if (sensiveis.length === 0) secaoSensiveis.linhas.push('Nenhuma.')
    for (const s of sensiveis) {
      secaoSensiveis.linhas.push(`- ${s.createdAt.toISOString().slice(0, 16)} ${s.action} por ${s.actorEmail ?? '?'} (${s.ip ?? 'sem ip'})`)
    }
    secoes.push(secaoSensiveis)

    const falhas = await prisma.auditLog.findMany({
      where: { createdAt: { gte: desde }, action: 'LOGIN_FALHA' },
      select: { ip: true, actorEmail: true },
    })
    const porIp = ipsComMuitasFalhas(falhas.map((f) => ({ ip: f.ip })), limiteFalhasIp)
    const porAlvo = alvosComMuitasFalhas(falhas.map((f) => ({ email: f.actorEmail })), limiteFalhasAlvo)
    const secaoForca: Secao = { titulo: 'Tentativas de login que falharam', severidade: porIp.length > 0 || porAlvo.length > 0 ? 'atencao' : 'ok', linhas: [] }
    secaoForca.linhas.push(`${falhas.length} falha(s) no período.`)
    for (const r of porIp) secaoForca.linhas.push(`! IP ${r.ip}: ${r.total} falhas (>= ${limiteFalhasIp})`)
    for (const r of porAlvo) secaoForca.linhas.push(`! Alvo ${r.email}: ${r.total} falhas (>= ${limiteFalhasAlvo})`)
    secoes.push(secaoForca)

    const secaoAdminLogin: Secao = { titulo: 'Login de admin de IP novo', severidade: 'ok', linhas: [] }
    if (emailsAdmin.length > 0) {
      const loginsJanela = await prisma.auditLog.findMany({
        where: { createdAt: { gte: desde }, action: 'LOGIN_OK', actorEmail: { in: emailsAdmin } },
        select: { actorEmail: true, ip: true },
      })
      const loginsAntes = await prisma.auditLog.findMany({
        where: { createdAt: { lt: desde }, action: 'LOGIN_OK', actorEmail: { in: emailsAdmin } },
        select: { actorEmail: true, ip: true },
      })
      const conhecidos = new Set(
        loginsAntes
          .map((l) => `${l.actorEmail?.toLowerCase()}|${l.ip ? l.ip.split(',')[0]?.trim() : ''}`)
          .filter((c) => !c.endsWith('|')),
      )
      const novos = enderecosNovosPorAtor(
        loginsJanela.map((l) => ({ email: l.actorEmail, ip: l.ip })),
        conhecidos,
      )
      if (novos.length > 0) {
        secaoAdminLogin.severidade = 'critico'
        for (const n of novos) secaoAdminLogin.linhas.push(`! ${n.email} entrou de IP nunca visto: ${n.ip}`)
      } else {
        secaoAdminLogin.linhas.push('Nenhum admin entrou de IP novo.')
      }
    } else {
      secaoAdminLogin.linhas.push('Sem admins para conferir.')
    }
    secoes.push(secaoAdminLogin)

    const secaoConexoes: Secao = { titulo: 'Conexões ao banco', severidade: 'ok', linhas: [] }
    try {
      const conexoes = await prisma.$queryRaw<Array<{ ip: string | null; usename: string | null; app: string | null; estado: string | null }>>(Prisma.sql`
        SELECT client_addr::text AS ip, usename, application_name AS app, state AS estado
        FROM pg_stat_activity
        WHERE client_addr IS NOT NULL AND pid <> pg_backend_pid()
      `)
      const externas = conexoes.filter((c) => classificarEndereco(c.ip) === 'externo')
      secaoConexoes.linhas.push(`${conexoes.length} conexão(ões) com IP; ${externas.length} externa(s).`)
      for (const c of externas) {
        secaoConexoes.severidade = 'atencao'
        secaoConexoes.linhas.push(`! externa ${c.ip} usuário=${c.usename ?? '?'} app=${c.app ?? '?'} estado=${c.estado ?? '?'}`)
      }
    } catch {
      secaoConexoes.linhas.push('Não foi possível ler pg_stat_activity (sem permissão neste usuário).')
    }
    secoes.push(secaoConexoes)

    const secaoErros: Secao = { titulo: 'Erros e workers', severidade: 'ok', linhas: [] }
    try {
      const errosJanela = await prisma.erroDoSistema.count({ where: { createdAt: { gte: desde } } })
      const errosAntes = await prisma.erroDoSistema.count({ where: { createdAt: { gte: inicioAnterior, lt: desde } } })
      const saltoErros = houveSalto(errosJanela, errosAntes, 3, pisoErros)
      if (saltoErros) secaoErros.severidade = 'atencao'
      secaoErros.linhas.push(`Erros: ${errosJanela} (período anterior: ${errosAntes}).`)
      if (saltoErros) secaoErros.linhas.push(`! Salto de erros em relação ao período anterior (piso ${pisoErros}, fator 3).`)
    } catch {
      secaoErros.linhas.push('Tabela erros_do_sistema ausente — migration ainda não aplicada neste banco.')
    }
    try {
      const workersFalhos = await prisma.workerLog.count({ where: { createdAt: { gte: desde }, status: { in: ['FAILED', 'PARTIAL'] } } })
      secaoErros.linhas.push(`Workers com falha no período: ${workersFalhos}.`)
    } catch {
      secaoErros.linhas.push('Tabela worker_logs indisponível.')
    }
    secoes.push(secaoErros)

    const geral = severidadeGeral(secoes)

    if (comoJson) {
      console.log(JSON.stringify({ geral, janelaHoras: horas, em: agora.toISOString(), secoes }, null, 2))
    } else {
      console.log(`${SELOS[geral]} VIGIA DE SEGURANCA — ${agora.toISOString()} — janela de ${horas}h`)
      console.log('='.repeat(64))
      for (const secao of secoes) {
        console.log(`\n${SELOS[secao.severidade]} ${secao.titulo}`)
        for (const linha of secao.linhas) console.log(`   ${linha}`)
      }
      console.log('\n' + '='.repeat(64))
      console.log(`Resultado: ${SELOS[geral]} ${geral.toUpperCase()}`)
    }

    process.exitCode = geral === 'critico' ? 2 : geral === 'atencao' ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((erro) => {
  console.error('Vigia falhou:', erro)
  process.exit(3)
})
