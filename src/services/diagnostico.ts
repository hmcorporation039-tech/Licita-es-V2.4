import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { registrarUsoDeIa } from './aiUsageService'
import { errosDoChamado } from './errosDoSistema'
import { consultarGemini, modeloDoAtendimento, atendimentoHabilitado, type Consultor } from './atendimento'
import { ErroComUso } from './llm/types'
import { codigosDosErros } from '../lib/suporte'
import {
  DIAGNOSTICO_SCHEMA,
  INSTRUCAO_DO_TECNICO,
  MAX_ARQUIVOS_COM_CODIGO,
  MAX_CARACTERES_POR_ARQUIVO,
  arquivosDaPilha,
  conferirArquivos,
  precisaDiagnosticar,
  validarDiagnostico,
  type DiagnosticoSalvo,
} from '../lib/diagnostico'

const RAIZ = resolve(__dirname, '..', '..')
const PASTAS_DO_PROJETO = ['src', 'web/src', 'prisma', 'scripts']
const IGNORAR = new Set(['node_modules', '.next', 'dist', 'migrations', 'public'])
const EXTENSOES = /\.(ts|tsx|prisma|mjs)$/

let arquivos: string[] | null = null
export function arquivosDoProjeto(raiz: string = RAIZ): string[] {
  if (arquivos && raiz === RAIZ) return arquivos
  const achados: string[] = []
  const visitar = (pasta: string) => {
    let entradas: import('node:fs').Dirent[]
    try {
      entradas = readdirSync(pasta, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entradas) {
      if (IGNORAR.has(e.name)) continue
      const caminho = join(pasta, e.name)
      if (e.isDirectory()) visitar(caminho)
      else if (EXTENSOES.test(e.name)) achados.push(relative(raiz, caminho).replace(/\\/g, '/'))
    }
  }
  for (const p of PASTAS_DO_PROJETO) visitar(join(raiz, p))
  achados.sort()
  if (raiz === RAIZ) arquivos = achados
  return achados
}

function rotasDaApi(): string {
  try {
    return readFileSync(join(RAIZ, 'src', 'api', 'server.ts'), 'utf8')
      .split('\n')
      .filter((l) => /^import \{ \w+Router \}|^app\.use\('\/api/.test(l.trim()))
      .join('\n')
  } catch {
    return '(indisponível)'
  }
}

function codigoDosArquivos(caminhos: string[]): string {
  return caminhos
    .slice(0, MAX_ARQUIVOS_COM_CODIGO)
    .map((c) => {
      try {
        const texto = readFileSync(join(RAIZ, c), 'utf8')
        return `--- ${c} ---\n${texto.length > MAX_CARACTERES_POR_ARQUIVO ? `${texto.slice(0, MAX_CARACTERES_POR_ARQUIVO)}\n(…arquivo cortado)` : texto}`
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

export async function diagnosticarChamado(chamadoId: string, opcoes: { consultor?: Consultor<unknown>; agora?: Date; forcar?: boolean } = {}): Promise<'PRONTO' | 'FALHOU' | 'IGNORADO'> {
  if (!atendimentoHabilitado()) return 'IGNORADO'
  const agora = opcoes.agora ?? new Date()
  const chamado = await prisma.chamado.findUnique({
    where: { id: chamadoId },
    include: { mensagens: { where: { autor: 'CLIENTE' }, orderBy: { createdAt: 'asc' }, select: { texto: true, createdAt: true } } },
  })
  if (!chamado) return 'IGNORADO'
  if (!opcoes.forcar && !precisaDiagnosticar(chamado, agora)) return 'IGNORADO'
  const reservou = await prisma.chamado.updateMany({
    where: { id: chamadoId, diagnosticoStatus: chamado.diagnosticoStatus, diagnosticoEm: chamado.diagnosticoEm },
    data: { diagnosticoStatus: 'DIAGNOSTICANDO', diagnosticoEm: agora },
  })
  if (reservou.count === 0) return 'IGNORADO'

  const inicio = Date.now()
  const quem = { companyId: chamado.companyId, userId: null }
  try {
    const erros = await errosDoChamado({ userId: chamado.userId, createdAt: chamado.createdAt, codigos: codigosDosErros(chamado.contexto) })
    const lista = arquivosDoProjeto()
    const existentes = new Set(lista)
    const doCodigo = [...new Set(erros.flatMap((e) => arquivosDaPilha(e.pilha, existentes)))]
    const textoDoChamado = JSON.stringify(
      {
        assunto: chamado.assunto,
        relato: chamado.relato,
        mensagensDoCliente: chamado.mensagens.map((m) => m.texto),
        contexto: chamado.contexto,
        abertoEm: chamado.createdAt.toISOString(),
      },
      null,
      2
    )
    const textoDosErros = erros.length === 0 ? '(nenhum erro guardado ligado a este chamado)' : JSON.stringify(erros, null, 2)
    const consultor = opcoes.consultor ?? consultarGemini
    const { json, uso } = await consultor(
      INSTRUCAO_DO_TECNICO,
      [`CHAMADO\n${textoDoChamado}`, `ERROS GUARDADOS\n${textoDosErros}`, `ROTAS DA API\n${rotasDaApi()}`, `ARQUIVOS DO PROJETO\n${lista.join('\n')}`, `CÓDIGO\n${codigoDosArquivos(doCodigo) || '(nenhum arquivo identificado nos erros)'}`],
      DIAGNOSTICO_SCHEMA
    )
    let diagnostico: DiagnosticoSalvo
    try {
      const valido = validarDiagnostico(json)
      const { confirmados, descartados } = conferirArquivos(valido.arquivosEnvolvidos, existentes)
      diagnostico = { ...valido, arquivosEnvolvidos: confirmados, arquivosDescartados: descartados, errosAnalisados: erros.length, modelo: uso.model }
    } catch (err) {
      throw new ErroComUso(err, uso)
    }
    await registrarUsoDeIa({ tenderId: null, quem, uso, durationMs: Date.now() - inicio, status: 'OK', etapa: 'diagnostico' })
    await prisma.chamado.update({
      where: { id: chamadoId },
      data: { diagnostico: diagnostico as unknown as Prisma.InputJsonValue, diagnosticoStatus: 'PRONTO', diagnosticoEm: new Date() },
    })
    return 'PRONTO'
  } catch (err) {
    const uso = err instanceof ErroComUso ? err.uso : { provider: 'gemini', model: modeloDoAtendimento(), inputTokens: 0, outputTokens: 0 }
    await registrarUsoDeIa({ tenderId: null, quem, uso, durationMs: Date.now() - inicio, status: 'ERRO', etapa: 'diagnostico' })
    console.error(`[Diagnóstico] Falha no chamado ${chamadoId}:`, err instanceof Error ? err.message : err)
    await prisma.chamado.updateMany({ where: { id: chamadoId }, data: { diagnosticoStatus: 'FALHOU', diagnosticoEm: new Date() } })
    return 'FALHOU'
  }
}

export function diagnosticarEmSegundoPlano(chamadoId: string): void {
  if (process.env.NODE_ENV === 'test') return
  setImmediate(() => {
    diagnosticarChamado(chamadoId).catch((err) => console.error('[Diagnóstico] Erro inesperado:', err instanceof Error ? err.message : err))
  })
}
